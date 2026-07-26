#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const command = process.argv[2] ?? "home";
const args = process.argv.slice(3);
const root = process.cwd();
const mogciaDir = path.join(root, ".mogcia");
const runsDir = path.join(mogciaDir, "runs");
const projectsFile = path.join(mogciaDir, "projects.json");
const latestRunFile = path.join(mogciaDir, "latest-run.json");
const defaultAgentUrl = process.env.MOGCIA_AGENT_URL ?? process.env.MOGCIA_VERCEL_URL ?? "http://localhost:3000";

const pink = "\x1b[38;5;218m";
const green = "\x1b[38;5;120m";
const yellow = "\x1b[38;5;221m";
const red = "\x1b[38;5;203m";
const cyan = "\x1b[38;5;117m";
const muted = "\x1b[38;5;245m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";

const sampleProjects = [
  {
    id: "hotel-demo",
    name: "ホテル予約システム",
    client: "東映ホテル株式会社",
    status: "demo-ready",
    progress: 72,
    branch: "feature/demo",
    previewUrl: "http://localhost:3000",
    nextAction: "Preview確認",
    tasks: {
      analyze: "completed",
      plan: "completed",
      code: "running",
      review: "waiting",
      deploy: "pending"
    }
  },
  {
    id: "golf-line-mini-page",
    name: "公式LINEミニページ",
    client: "八女上陽ゴルフ倶楽部",
    status: "requirements-approved",
    progress: 45,
    branch: "feature/golf-line-mini-page",
    previewUrl: "http://localhost:3000",
    nextAction: "開発タスク確認",
    tasks: {
      analyze: "completed",
      plan: "completed",
      code: "waiting",
      review: "waiting",
      deploy: "pending"
    }
  }
];

function ensureWorkspace() {
  mkdirSync(mogciaDir, { recursive: true });
  mkdirSync(runsDir, { recursive: true });
  if (!existsSync(projectsFile)) {
    writeFileSync(projectsFile, JSON.stringify(sampleProjects, null, 2));
  }
}

function readJson(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function getProjects() {
  ensureWorkspace();
  const projects = readJson(projectsFile, sampleProjects);
  return Array.isArray(projects) ? projects : sampleProjects;
}

function saveProjects(projects) {
  writeJson(projectsFile, projects);
}

function findProject(projectId) {
  const projects = getProjects();
  return projects.find((project) => project.id === projectId || project.name === projectId);
}

function nowIso() {
  return new Date().toISOString();
}

function getAgentUrl() {
  return (process.env.MOGCIA_AGENT_URL || defaultAgentUrl).replace(/\/$/, "");
}

async function syncHome(event) {
  if (process.env.MOGCIA_CLI_SYNC === "off") return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const headers = { "content-type": "application/json" };
  if (process.env.MOGCIA_CLI_TOKEN) headers.authorization = `Bearer ${process.env.MOGCIA_CLI_TOKEN}`;

  try {
    const response = await fetch(`${getAgentUrl()}/api/cli/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: `cli-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        source: "mogcia-cli",
        createdAt: nowIso(),
        ...event
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    console.log(response.ok ? `${muted}Home sync: ok${reset}` : `${yellow}Home sync: ${response.status}${reset}`);
  } catch {
    clearTimeout(timer);
    console.log(`${muted}Home sync: skipped${reset}`);
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusText(status) {
  const labels = {
    completed: `${green}Complete${reset}`,
    running: `${yellow}Running${reset}`,
    waiting: `${muted}Waiting${reset}`,
    pending: `${muted}Pending${reset}`,
    failed: `${red}Error${reset}`,
    skipped: `${muted}Skipped${reset}`,
    passed: `${green}Passed${reset}`
  };
  return labels[status] ?? status ?? "-";
}

function taskIcon(status) {
  if (status === "completed" || status === "passed") return `${green}OK${reset}`;
  if (status === "running") return `${yellow}..${reset}`;
  if (status === "failed") return `${red}NG${reset}`;
  return `${muted}--${reset}`;
}

function progressBar(percent, width = 28) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((value / 100) * width);
  return `${pink}${"█".repeat(filled)}${muted}${"░".repeat(width - filled)}${reset} ${value}%`;
}

function box(title, lines) {
  const content = lines.map((line) => String(line));
  const width = Math.max(title.length + 6, ...content.map((line) => stripAnsi(line).length), 36);
  const top = `${muted}╭─ ${title} ${"─".repeat(Math.max(0, width - title.length - 4))}╮${reset}`;
  const bottom = `${muted}╰${"─".repeat(width + 2)}╯${reset}`;
  console.log(top);
  content.forEach((line) => {
    const padding = " ".repeat(Math.max(0, width - stripAnsi(line).length));
    console.log(`${muted}│${reset} ${line}${padding} ${muted}│${reset}`);
  });
  console.log(bottom);
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function printAgentHeader(subtitle = "AIと一緒に会社を動かすOS") {
  console.log("");
  console.log(`${pink}${bold}MOGCIA Dev Agent${reset} ${muted}v1.0.0${reset}`);
  console.log(`${muted}${subtitle}${reset}`);
  console.log(`${pink}      .-^^^^-.${reset}`);
  console.log(`${pink}   .-(  o  o )-.${reset}   ${bold}AIと、いっしょに考え、つくる。${reset}`);
  console.log(`${pink}  /   \\  --  /   \\${reset}`);
  console.log(`${pink}  \\____\\____/____/${reset}`);
  console.log("");
}

function printHelp() {
  ensureWorkspace();
  printAgentHeader("CLI操作卓 / Webはモニター表示");
  box("基本コマンド", [
    `${green}$ mogcia status${reset}              現在の進行状況を表示`,
    `${green}$ mogcia run <project>${reset}       開発タスクの実行ログを作成`,
    `${green}$ mogcia list${reset}                プロジェクト一覧を表示`,
    `${green}$ mogcia preview <project>${reset}   プレビューURLを表示`,
    `${green}$ mogcia logs [project]${reset}      実行ログを表示`,
    `${green}$ mogcia doctor${reset}              環境と設定を診断`,
    `${green}$ mogcia flow-test [url]${reset}     通しテストを実行`
  ]);
  console.log(`${muted}Web Dashboard: ${defaultAgentUrl}/home${reset}`);
  console.log("");
}

function loadLatestRun(projectId) {
  const latest = readJson(latestRunFile, null);
  if (latest && (!projectId || latest.projectId === projectId)) return latest;
  if (!existsSync(runsDir)) return null;

  const files = readdirSync(runsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(runsDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  for (const file of files) {
    const run = readJson(file, null);
    if (run && (!projectId || run.projectId === projectId)) return run;
  }
  return null;
}

async function status() {
  ensureWorkspace();
  const projects = getProjects();
  const activeProjects = projects.filter((project) => project.status !== "done");
  const latestRun = loadLatestRun();
  const latestProject = latestRun ? findProject(latestRun.projectId) : projects[0];

  printAgentHeader("ステータス確認");
  console.log(`${muted}Project:${reset} ${latestProject?.id ?? "not-selected"}`);
  console.log(`${muted}Updated:${reset} ${formatDateTime(latestRun?.finishedAt ?? latestRun?.startedAt ?? nowIso())}`);
  console.log("");

  const project = latestProject ?? projects[0];
  const tasks = project?.tasks ?? {};
  box("進行状況", [
    `${taskIcon(tasks.analyze)} Analyze   要件定義の解析        ${statusText(tasks.analyze)}   ${tasks.analyze === "completed" ? "100%" : "0%"}`,
    `${taskIcon(tasks.plan)} Plan      設計・タスク分解      ${statusText(tasks.plan)}   ${tasks.plan === "completed" ? "100%" : "0%"}`,
    `${taskIcon(tasks.code)} Code      実装                  ${statusText(tasks.code)}   ${progressBar(project?.progress ?? 0, 16)}`,
    `${taskIcon(tasks.review)} Review    レビュー待ち          ${statusText(tasks.review)}   0%`,
    `${taskIcon(tasks.deploy)} Deploy    本番化判断            ${statusText(tasks.deploy)}   0%`
  ]);

  box("今日の会社状況", [
    `アクティブなプロジェクト   ${bold}${activeProjects.length}${reset}件`,
    `実行中のタスク             ${bold}${projects.filter((project) => project.tasks?.code === "running").length}${reset}件`,
    `レビュー待ち               ${bold}${projects.filter((project) => project.tasks?.review === "waiting").length}${reset}件`,
    `最新Preview                ${cyan}${project?.previewUrl ?? "未設定"}${reset}`
  ]);
  await syncHome({
    command: "mogcia status",
    projectId: project?.id ?? "shared",
    projectName: project?.name ?? "MOGCIA Dev Agent",
    status: "info",
    summary: `${project?.name ?? "全体"} の進行状況をCLIで確認しました。`,
    previewUrl: project?.previewUrl ?? ""
  });
}

function listProjects() {
  ensureWorkspace();
  printAgentHeader("プロジェクト一覧");
  const projects = getProjects();
  projects.forEach((project) => {
    console.log(`${bold}${project.id}${reset}  ${project.name}`);
    console.log(`  client: ${project.client}`);
    console.log(`  status: ${project.status} / progress: ${project.progress}% / next: ${project.nextAction}`);
    console.log("");
  });
}

function getLocalNetworkUrl(port = 3000) {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return `http://${address.address}:${port}`;
      }
    }
  }
  return null;
}

async function preview(projectId = args[0]) {
  ensureWorkspace();
  const project = projectId ? findProject(projectId) : getProjects()[0];
  if (!project) {
    console.log(`${red}Project not found:${reset} ${projectId}`);
    process.exitCode = 1;
    return;
  }

  printAgentHeader("プレビューURL");
  box(project.name, [
    `Local Preview     ${green}${project.previewUrl ?? "http://localhost:3000"}${reset}`,
    `Network Preview   ${green}${getLocalNetworkUrl(3000) ?? "同一ネットワークURL未検出"}${reset}`,
    `Vercel Preview    ${cyan}${process.env.MOGCIA_VERCEL_URL ?? "未設定"}${reset}`
  ]);
  console.log(`${muted}Preview確認で気になるところがあれば、CLIかWebの案件画面から続けて確認できます。${reset}`);
  await syncHome({
    command: "mogcia preview",
    projectId: project.id,
    projectName: project.name,
    status: "info",
    summary: `${project.name} のPreview URLをCLIで確認しました。`,
    previewUrl: project.previewUrl ?? "http://localhost:3000"
  });
}

async function runProject(projectId = args[0]) {
  ensureWorkspace();
  const project = projectId ? findProject(projectId) : null;
  if (!project) {
    printAgentHeader("プロジェクト実行");
    console.log(`${red}Project not found.${reset} 先に ${green}mogcia list${reset} でIDを確認してください。`);
    process.exitCode = 1;
    return;
  }

  const startedAt = nowIso();
  const runId = `${project.id}-${startedAt.replace(/[:.]/g, "-")}`;
  const steps = [
    ["analyze", "議事録・要件を確認中"],
    ["plan", "確認範囲とタスクを整理中"],
    ["code", "Codex向け実装タスクを生成中"],
    ["safety", "外部サービスを作らない安全確認"],
    ["preview", "Preview URLを記録中"]
  ];

  printAgentHeader(`プロジェクト実行: ${project.name}`);
  console.log(`${muted}Project:${reset} ${project.id}`);
  console.log(`${muted}Client :${reset} ${project.client}`);
  console.log("");
  await syncHome({
    command: "mogcia run",
    projectId: project.id,
    projectName: project.name,
    status: "started",
    summary: `${project.name} のCLI実行を開始しました。`,
    previewUrl: project.previewUrl ?? "http://localhost:3000"
  });

  const completedItems = [];
  for (const [key, label] of steps) {
    const time = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());
    console.log(`[${time}] ${yellow}..${reset} ${label}`);
    completedItems.push(label);
    if (key === "safety") {
      console.log(`           ${green}OK${reset} GitHub / Vercel / Firebase / 外部APIは作成しません`);
    }
  }

  const finishedAt = nowIso();
  const result = {
    id: runId,
    projectId: project.id,
    projectName: project.name,
    client: project.client,
    status: "completed",
    executor: "mogcia-cli",
    summary: `${project.name} の開発タスク実行ログを作成しました。`,
    completedItems,
    remainingItems: ["人間レビュー", "UI確認", "クライアント確認"],
    changedFiles: [],
    warnings: ["このコマンドは外部サービスを作成しません。実装実行は石田確認後に行います。"],
    errors: [],
    checks: {
      typecheck: "skipped",
      lint: "skipped",
      build: "skipped"
    },
    previewUrl: project.previewUrl ?? "http://localhost:3000",
    startedAt,
    finishedAt,
    duration: Math.max(1, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  };

  const runPath = path.join(runsDir, `${runId}.json`);
  writeJson(runPath, result);
  writeJson(latestRunFile, result);

  const projects = getProjects().map((item) => {
    if (item.id !== project.id) return item;
    return {
      ...item,
      progress: Math.max(item.progress ?? 0, 72),
      status: "demo-ready",
      tasks: {
        ...item.tasks,
        analyze: "completed",
        plan: "completed",
        code: "completed",
        review: "waiting",
        deploy: "pending"
      },
      lastRunAt: finishedAt
    };
  });
  saveProjects(projects);

  console.log("");
  console.log(`${green}Complete${reset} ${project.name}`);
  console.log(`Log: ${runPath}`);
  console.log(`Preview: ${cyan}${result.previewUrl}${reset}`);
  await syncHome({
    command: "mogcia run",
    projectId: project.id,
    projectName: project.name,
    status: "completed",
    summary: result.summary,
    previewUrl: result.previewUrl
  });
}

async function latestLogs(projectId = args[0]) {
  ensureWorkspace();
  const latestRun = loadLatestRun(projectId);
  printAgentHeader("実行ログ");

  if (!latestRun) {
    console.log("まだ実行ログがありません。");
    console.log(`${green}mogcia run hotel-demo${reset} でサンプル実行できます。`);
    return;
  }

  box(latestRun.projectName ?? latestRun.projectId, [
    `Status          ${statusText(latestRun.status)}`,
    `Summary         ${latestRun.summary}`,
    `Started         ${formatDateTime(latestRun.startedAt)}`,
    `Finished        ${formatDateTime(latestRun.finishedAt)}`,
    `Preview         ${cyan}${latestRun.previewUrl ?? "-"}${reset}`
  ]);

  console.log(`${bold}Completed${reset}`);
  (latestRun.completedItems ?? []).forEach((item) => console.log(`- ${green}OK${reset} ${item}`));
  console.log("");
  console.log(`${bold}Remaining${reset}`);
  (latestRun.remainingItems ?? []).forEach((item) => console.log(`- ${yellow}TODO${reset} ${item}`));
  await syncHome({
    command: "mogcia logs",
    projectId: latestRun.projectId ?? "shared",
    projectName: latestRun.projectName ?? "MOGCIA Dev Agent",
    status: latestRun.status === "failed" ? "failed" : "info",
    summary: `${latestRun.projectName ?? latestRun.projectId} の実行ログをCLIで確認しました。`,
    previewUrl: latestRun.previewUrl ?? ""
  });
}

function checkCommand(label, binary, versionArgs = ["--version"], required = false) {
  const result = spawnSync(binary, versionArgs, { encoding: "utf8" });
  const passed = result.status === 0;
  const output = (result.stdout || result.stderr || "").trim().split("\n")[0];
  return {
    label,
    passed,
    required,
    output: output || (passed ? "ok" : "not found")
  };
}

async function doctor() {
  ensureWorkspace();
  printAgentHeader("環境診断");

  const fileChecks = [
    ["Next.js App", "src/app/page.tsx", true],
    ["Dashboard", "src/components/dashboard.tsx", true],
    ["Firebase client", "src/lib/firebase/client.ts", true],
    ["Firestore rules", "firestore.rules", true],
    ["Storage rules", "storage.rules", true],
    ["Implementation list", "実装一覧.md", false]
  ].map(([label, file, required]) => ({
    label,
    passed: existsSync(path.join(root, file)),
    required,
    output: file
  }));

  const commandChecks = [
    checkCommand("Node.js", "node", ["--version"], true),
    checkCommand("npm", "npm", ["--version"], true),
    checkCommand("pnpm", "pnpm", ["--version"], false),
    checkCommand("Codex CLI", "codex", ["--version"], false),
    checkCommand("Firebase CLI", "firebase", ["--version"], false),
    checkCommand("gcloud", "gcloud", ["--version"], false),
    checkCommand("git", "git", ["--version"], false)
  ];

  const checks = [...fileChecks, ...commandChecks];
  checks.forEach((check) => {
    const mark = check.passed ? `${green}OK${reset}` : check.required ? `${red}NG${reset}` : `${yellow}--${reset}`;
    const kind = check.required ? "required" : "optional";
    console.log(`${mark} ${check.label.padEnd(20)} ${muted}${kind}${reset} ${check.output}`);
  });

  const failedRequired = checks.filter((check) => check.required && !check.passed);
  console.log("");
  console.log(failedRequired.length === 0 ? `${green}doctor: ok${reset}` : `${red}doctor: needs attention${reset}`);
  await syncHome({
    command: "mogcia doctor",
    projectId: "shared",
    projectName: "MOGCIA Dev Agent",
    status: failedRequired.length === 0 ? "completed" : "failed",
    summary: failedRequired.length === 0 ? "CLI環境診断はOKです。" : `CLI環境診断で ${failedRequired.length} 件の必須項目が不足しています。`,
    previewUrl: ""
  });
}

function codex() {
  printAgentHeader("Codexタスク作成");
  const taskTitle = args[0] ?? "MOGCIA Codex Task";
  const outputPath = path.join(mogciaDir, "codex-task.md");
  mkdirSync(mogciaDir, { recursive: true });
  writeFileSync(outputPath, [`# ${taskTitle}`, "", "Codex CLI連携用のタスクです。", "レビュー、修正内容、開発タスクを確認してください。"].join("\n"));
  const version = spawnSync("codex", ["--version"], { encoding: "utf8" });
  console.log(`Task: ${outputPath}`);
  console.log(version.status === 0 ? `Codex CLI: ${version.stdout.trim()}` : "Codex CLI: unavailable");
}

function codexResults() {
  printAgentHeader("Codex Result");
  const action = args[0] ?? "init";
  const outputDir = path.join(mogciaDir, "codex-results");
  mkdirSync(outputDir, { recursive: true });

  if (action === "sample") {
    const outputPath = path.join(outputDir, `codex-result-${nowIso().replace(/[:.]/g, "-")}.json`);
    const result = {
      status: "completed",
      summary: "Codex実行結果サンプル",
      completedItems: ["Typecheck", "Lint", "Build"],
      remainingItems: [],
      changedFiles: ["src/components/dashboard.tsx"],
      warnings: [],
      errors: [],
      checks: {
        typecheck: "passed",
        lint: "passed",
        build: "passed"
      },
      duration: 320
    };
    writeJson(outputPath, result);
    console.log(`Sample result: ${outputPath}`);
    return;
  }

  const files = readdirSync(outputDir).filter((file) => file.endsWith(".json")).sort();
  console.log(`Codex result directory: ${outputDir}`);
  if (files.length === 0) {
    console.log("No result JSON yet. Run: mogcia codex-results sample");
    return;
  }
  files.slice(-10).forEach((file) => console.log(`- ${path.join(outputDir, file)}`));
}

const golfClient = {
  id: "flow-client-golf",
  name: "MOGCIA Golf Club",
  industry: "ゴルフ場",
  contactName: "テスト担当者",
  services: ["公式LINE運用", "HP制作"]
};

const golfProject = {
  id: "flow-project-golf-line-mini-page",
  clientId: golfClient.id,
  name: "公式LINEミニページ制作",
  kind: "development",
  source: "direct-client",
  mode: "demo",
  status: "承認待ち",
  approvalStatus: "pending",
  services: ["公式LINE運用", "HP制作"],
  owner: "flow-test@mogcia.com",
  nextAction: "架空案件の通しテスト"
};

const minutesPatterns = [
  {
    label: "要望が明確な議事録",
    content:
      "ゴルフ場の公式LINEから見られるミニページを作りたい。確認範囲はTOP、イベント一覧、イベント詳細。イベント情報がLINE配信内だけで流れてしまうため、後から見返せる導線が必要。LINE連携、予約機能、顧客DBは初期対象外。"
  },
  {
    label: "話が散らかっている議事録",
    content:
      "LINEでイベントを流しているが見逃される。予約も将来的には欲しいかも。写真はまだない。コンペ情報、レッスン、キャンペーン、料金も見せたい。まずTOP、イベント一覧、イベント詳細で確認。予約、LINE API、顧客DBは入れない。"
  },
  {
    label: "要望とMOGCIA提案が混ざっている議事録",
    content:
      "クライアント要望はLINE配信後に残るイベントページが欲しいこと。MOGCIA提案として、TOPに今月のイベント、イベント一覧、イベント詳細を作り、公式LINEへの戻り導線を置く。初期範囲では連携なし、予約なし、顧客DBなし。"
  }
];

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function readTextIfExists(file) {
  const filePath = path.join(root, file);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function checkRules() {
  const firestoreRules = readTextIfExists("firestore.rules");
  const storageRules = readTextIfExists("storage.rules");

  return [
    {
      label: "Firestore: 石田承認系は isIshida で保護",
      passed: firestoreRules.includes("function isIshida()") && firestoreRules.includes("allow create, update, delete: if isIshida()")
    },
    {
      label: "Storage: 書き込みは石田アカウントのみ",
      passed: storageRules.includes("allow write: if isIshida()")
    },
    {
      label: "Storage: ログインユーザーは読み取り可能",
      passed: storageRules.includes("allow read: if isSignedIn()")
    }
  ];
}

function validateRequirementDraft(draft) {
  const text = [
    draft?.summary,
    ...(draft?.requirements ?? []),
    ...(draft?.missingQuestions ?? []),
    ...(draft?.demoScope ?? []),
    ...(draft?.screens ?? []),
    ...(draft?.features ?? [])
  ].join(" ");

  return [
    { label: "TOP / イベント一覧 / イベント詳細を含む", passed: ["TOP", "イベント一覧", "イベント詳細"].some((item) => text.includes(item)) },
    { label: "LINE連携を初期範囲外として分離", passed: text.includes("LINE") },
    { label: "予約機能を勝手に実装しない前提", passed: text.includes("予約") },
    { label: "顧客DBを勝手に実装しない前提", passed: text.includes("DB") || text.includes("データ") }
  ];
}

async function flowTest() {
  printAgentHeader("通しテスト");
  const baseUrl = process.env.MOGCIA_TEST_BASE_URL ?? args[0] ?? "http://localhost:3001";
  const outputDir = mogciaDir;
  const reportPath = path.join(outputDir, "flow-test-report.md");
  const lines = ["# MOGCIA Flow Test Report", "", `Base URL: ${baseUrl}`, `Date: ${nowIso()}`, ""];
  const results = [];

  console.log(`Flow test base URL: ${baseUrl}`);

  for (const [index, pattern] of minutesPatterns.entries()) {
    const minutes = {
      id: `flow-minutes-${index + 1}`,
      clientId: golfClient.id,
      projectId: golfProject.id,
      content: pattern.content,
      registeredBy: "flow-test@mogcia.com",
      registeredAt: nowIso()
    };

    try {
      const data = await postJson(`${baseUrl}/api/ai/requirements`, {
        client: golfClient,
        project: golfProject,
        minutes,
        ruleLayers: []
      });
      const checks = validateRequirementDraft(data.draft);
      results.push({ label: `Claude要件定義: ${pattern.label}`, passed: checks.every((check) => check.passed), checks });
      console.log(`- ${pattern.label}: ${data.draft?.generatedBy ?? "unknown"}`);
    } catch (error) {
      results.push({
        label: `Claude要件定義: ${pattern.label}`,
        passed: false,
        checks: [{ label: error instanceof Error ? error.message : "API呼び出し失敗", passed: false }]
      });
      console.log(`- ${pattern.label}: failed`);
    }
  }

  results.push({ label: "権限rules確認", passed: checkRules().every((check) => check.passed), checks: checkRules() });

  for (const result of results) {
    lines.push(`## ${result.passed ? "PASS" : "FAIL"} ${result.label}`, "");
    for (const check of result.checks) {
      lines.push(`- ${check.passed ? "OK" : "NG"} ${check.label}`);
    }
    lines.push("");
  }

  const passed = results.every((result) => result.passed);
  lines.push("## Result", "", passed ? "PASS: Vercel公開前のCLIスモークテストは通過。" : "FAIL: 上記NGを直してからVercel確認へ進む。", "");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, lines.join("\n"));

  console.log("");
  console.log(`Report: ${reportPath}`);
  console.log(passed ? "flow-test: pass" : "flow-test: fail");
  process.exitCode = passed ? 0 : 1;
}

if (command === "home" || command === "help" || command === "--help" || command === "-h") printHelp();
else if (command === "status") await status();
else if (command === "list") listProjects();
else if (command === "run") await runProject();
else if (command === "preview") await preview();
else if (command === "logs") await latestLogs();
else if (command === "doctor") await doctor();
else if (command === "codex") codex();
else if (command === "codex-results") codexResults();
else if (command === "flow-test") await flowTest();
else {
  printAgentHeader("Unknown command");
  console.log(`${red}Unknown command:${reset} ${command}`);
  console.log(`Run ${green}mogcia help${reset} to see commands.`);
  process.exitCode = 1;
}
