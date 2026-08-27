#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, arch, platform } from "node:os";
import { join, resolve } from "node:path";

const configDir = resolve(".mogcia");
const configPath = join(configDir, "worker.json");
const defaultCapabilities = ["codex", "git", "node"];

async function main() {
  const command = process.argv[2] || "status";
  if (command === "login") return login();
  if (command === "start") return start();
  if (command === "stop") return stop();
  if (command === "status") return status();
  if (command === "projects") return projects();
  if (command === "doctor") return doctor();
  console.log("Usage: npm run worker -- login|start|stop|status|projects|doctor");
}

async function login() {
  const rl = createInterface({ input, output });
  const current = readConfig();
  const apiBase = process.env.MOGCIA_API_BASE || await rl.question(`MOGCIA API Base [${current.apiBase || "http://localhost:3000"}]: `) || current.apiBase || "http://localhost:3000";
  const idToken = process.env.MOGCIA_ID_TOKEN || await rl.question("Firebase ID token: ");
  const name = await rl.question(`Worker name [${current.name || hostname()}]: `) || current.name || hostname();
  rl.close();
  const config = {
    ...current,
    apiBase,
    idToken,
    name,
    capabilities: current.capabilities || defaultCapabilities,
    projects: current.projects || {}
  };
  const registered = await api(config, "/api/development/workers/register", {
    workerId: current.workerId,
    name,
    hostname: hostname(),
    os: platform(),
    architecture: arch(),
    capabilities: config.capabilities
  });
  writeConfig({ ...config, workerId: registered.workerId });
  console.log(`Logged in as worker ${registered.workerId}`);
}

async function start() {
  const config = ensureConfig();
  await heartbeat(config, "online");
  console.log(`MOGCIA Worker started: ${config.workerId}`);
  while (!shouldStop()) {
    try {
      await heartbeat(config, "online");
      const claim = await api(config, "/api/development/jobs/claim", {
        workerId: config.workerId,
        capabilities: config.capabilities || defaultCapabilities
      });
      if (claim.job) {
        await runJob(config, claim.job, claim.project, claim.memory || {});
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    await sleep(Number(config.pollIntervalMs || 15000));
  }
  await heartbeat(config, "online");
  console.log("MOGCIA Worker stopped.");
}

async function stop() {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "worker.stop"), String(Date.now()));
  console.log("Stop signal written.");
}

async function status() {
  const config = readConfig();
  console.log(JSON.stringify({
    configured: Boolean(config.apiBase && config.idToken && config.workerId),
    apiBase: config.apiBase || null,
    workerId: config.workerId || null,
    capabilities: config.capabilities || defaultCapabilities,
    mappedProjects: Object.keys(config.projects || {})
  }, null, 2));
}

async function projects() {
  const config = ensureConfig();
  const nextMapArg = process.argv.find((arg) => arg.startsWith("--map="));
  if (nextMapArg) {
    const [projectId, localPath] = nextMapArg.slice("--map=".length).split("=");
    if (!projectId || !localPath) throw new Error("--map=PROJECT_ID=/local/path の形式で指定してください。");
    const projectsConfig = { ...(config.projects || {}), [projectId]: resolve(localPath) };
    writeConfig({ ...config, projects: projectsConfig });
    console.log(`Mapped ${projectId} -> ${projectsConfig[projectId]}`);
    return;
  }
  const result = await apiGet(config, "/api/development/projects");
  for (const project of result.projects || []) {
    console.log(`${project.id}\t${project.name}\t${project.repositoryUrl || ""}\t${config.projects?.[project.id] || "unmapped"}`);
  }
}

async function doctor() {
  const checks = [
    ["node", ["--version"]],
    ["git", ["--version"]],
    ["codex", ["--version"]]
  ];
  for (const [command, args] of checks) {
    const result = await run(command, args, process.cwd(), { allowFailure: true, timeoutMs: 8000 });
    console.log(`${command}: ${result.code === 0 ? "ok" : "missing"} ${firstLine(result.output)}`);
  }
}

async function runJob(config, job, project, memory) {
  const localPath = config.projects?.[job.projectId];
  if (!localPath) {
    await complete(config, job, "failed", { requiresUserAction: true, summary: "Worker側Project mappingが未設定です。" }, "Project mappingが未設定です。");
    return;
  }
  const branchName = `agent/${job.id}-${slug(job.title || "development")}`;
  await api(config, `/api/development/jobs/${job.id}/running`, { workerId: config.workerId, branchName, message: "Repository安全確認を開始しました。" });
  const safety = await gitSafety(localPath);
  if (!safety.ok) {
    await complete(config, job, "failed", { requiresUserAction: true, summary: safety.reason }, safety.reason);
    return;
  }
  await log(config, job, "git-safety", "git status", "success", `branch=${safety.branch} remote=${safety.remote} commit=${safety.commit}`);
  await run("git", ["checkout", "-b", branchName], localPath);
  await api(config, `/api/development/jobs/${job.id}/running`, { workerId: config.workerId, branchName, message: `Branch ${branchName} を作成しました。` });
  const instruction = `${job.instruction}\n\nWorker Context:\nLocal project is already checked out at the mapped path.\nDo not deploy, push, merge, or touch production.\nProject Memory Snapshot:\n${JSON.stringify(memory, null, 2)}`;
  const codex = await run(config.codexCommand || "codex", [...(config.codexArgs || ["exec", "--full-auto"]), instruction], localPath, { allowFailure: true, maxOutput: 20000 });
  await log(config, job, "codex", config.codexCommand || "codex", codex.code === 0 ? "success" : "error", firstLine(codex.output) || "Codex finished");
  if (codex.code !== 0) {
    await complete(config, job, "failed", await collectResult(localPath, safety.commit, branchName, codex.output, [], null), "Codex実行に失敗しました。");
    return;
  }
  const validationResults = [];
  const commands = project.validationCommands?.length ? project.validationCommands : ["npm run typecheck", "npm run lint", "npm run build"];
  for (const command of commands) {
    const result = await runShell(command, localPath, { allowFailure: true, maxOutput: 12000 });
    validationResults.push({ command, status: result.code === 0 ? "success" : "error", output: tail(result.output, 4000) });
    await log(config, job, "validation", command, result.code === 0 ? "success" : "error", firstLine(result.output) || command);
  }
  const hasValidationError = validationResults.some((result) => result.status === "error");
  const changedFiles = await changedFilesFor(localPath, safety.commit);
  let commitSha = null;
  if (changedFiles.length && !hasValidationError) {
    await run("git", ["add", "-A"], localPath);
    const commit = await run("git", ["commit", "-m", `Agent job ${job.id}`], localPath, { allowFailure: true, maxOutput: 12000 });
    if (commit.code === 0) commitSha = (await run("git", ["rev-parse", "HEAD"], localPath)).output.trim();
  }
  const result = await collectResult(localPath, safety.commit, branchName, codex.output, validationResults, commitSha);
  await complete(config, job, hasValidationError ? "failed" : "completed", result, hasValidationError ? "検証コマンドが失敗しました。" : null);
}

async function gitSafety(localPath) {
  const status = await run("git", ["status", "--porcelain"], localPath);
  const branch = (await run("git", ["branch", "--show-current"], localPath)).output.trim();
  const remote = (await run("git", ["remote", "get-url", "origin"], localPath, { allowFailure: true })).output.trim();
  const commit = (await run("git", ["rev-parse", "HEAD"], localPath)).output.trim();
  if (status.output.trim()) return { ok: false, reason: "未コミット変更があります。安全のためJobを停止しました。", branch, remote, commit };
  return { ok: true, branch, remote, commit };
}

async function collectResult(localPath, baseCommit, branchName, codexOutput, validationResults, commitSha) {
  const changedFiles = await changedFilesFor(localPath, baseCommit);
  const numstat = await run("git", ["diff", "--numstat", baseCommit], localPath, { allowFailure: true });
  const diff = await run("git", ["diff", baseCommit], localPath, { allowFailure: true, maxOutput: 30000 });
  const { insertions, deletions } = parseNumstat(numstat.output);
  return {
    summary: `${changedFiles.length} files changed`,
    changedFiles,
    diff: tail(diff.output, 30000),
    insertions,
    deletions,
    branchName,
    commitSha,
    codexOutput: tail(codexOutput, 12000),
    validationResults,
    requiresUserAction: false
  };
}

async function changedFilesFor(localPath, baseCommit) {
  const output = await run("git", ["diff", "--name-only", baseCommit], localPath, { allowFailure: true });
  return output.output.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function heartbeat(config, statusValue) {
  return api(config, `/api/development/workers/${config.workerId}/heartbeat`, {
    status: statusValue,
    capabilities: config.capabilities || defaultCapabilities
  });
}

async function log(config, job, step, command, statusValue, summary) {
  return api(config, `/api/development/jobs/${job.id}/logs`, {
    workerId: config.workerId,
    step,
    command,
    status: statusValue,
    summary,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
}

async function complete(config, job, statusValue, result, errorMessage) {
  return api(config, `/api/development/jobs/${job.id}/complete`, {
    workerId: config.workerId,
    status: statusValue,
    result,
    errorMessage
  });
}

async function api(config, path, body) {
  const response = await fetch(`${config.apiBase}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.idToken}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(json.error?.message || `API error: ${path}`);
  return json.data;
}

async function apiGet(config, path) {
  const response = await fetch(`${config.apiBase}${path}`, {
    headers: { authorization: `Bearer ${config.idToken}` }
  });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(json.error?.message || `API error: ${path}`);
  return json.data;
}

function runShell(command, cwd, options = {}) {
  return run(command, [], cwd, { ...options, shell: true });
}

function run(command, args, cwd, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, shell: Boolean(options.shell), env: process.env });
    let outputText = "";
    const timeout = options.timeoutMs ? setTimeout(() => {
      child.kill("SIGTERM");
      outputText += "\nCommand timed out.";
    }, options.timeoutMs) : null;
    child.stdout.on("data", (data) => {
      outputText += data.toString();
      if (outputText.length > (options.maxOutput || 6000)) outputText = outputText.slice(-(options.maxOutput || 6000));
    });
    child.stderr.on("data", (data) => {
      outputText += data.toString();
      if (outputText.length > (options.maxOutput || 6000)) outputText = outputText.slice(-(options.maxOutput || 6000));
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      const result = { code: code ?? 1, output: outputText };
      if (result.code !== 0 && !options.allowFailure) reject(new Error(`${command} failed\n${outputText}`));
      else resolveRun(result);
    });
  });
}

function readConfig() {
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function ensureConfig() {
  const config = readConfig();
  if (!config.apiBase || !config.idToken || !config.workerId) throw new Error("Run `npm run worker -- login` first.");
  return config;
}

function writeConfig(config) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function shouldStop() {
  return existsSync(join(configDir, "worker.stop"));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "development";
}

function parseNumstat(value) {
  return value.split("\n").reduce((acc, line) => {
    const [adds, dels] = line.split(/\s+/);
    acc.insertions += Number(adds) || 0;
    acc.deletions += Number(dels) || 0;
    return acc;
  }, { insertions: 0, deletions: 0 });
}

function firstLine(value) {
  return String(value || "").split("\n").find(Boolean) || "";
}

function tail(value, length) {
  const next = String(value || "");
  return next.length > length ? next.slice(-length) : next;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
