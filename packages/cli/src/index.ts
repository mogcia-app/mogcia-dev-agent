#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MogciaDesktopApiError, MogciaDesktopClient, type DesktopCompanyResult, type ParsedDesktopMemo } from "../../desktop-sdk/src";

const execFileAsync = promisify(execFile);
const serviceName = "mogcia-desktop-token";
const accountName = "default";
const configPath = join(homedir(), ".config", "mogcia", "config.json");

type Config = { baseUrl: string };

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  try {
    if (!command) return splash();
    if (command === "help" || command === "--help") return help();
    if (command === "login") return login();
    if (command === "status") return status();
    if (command === "doctor") return doctor();
    if (command === "list") return today();
    if (command === "today") return today();
    if (command === "memo") return memo();
    if (command === "run") return runShortcut(subcommand, rest);
    if (command === "task" && subcommand === "add") return taskAdd(rest);
    if (command === "company" && subcommand === "search") return companySearch(rest.join(" "));
    if (command === "company" && subcommand === "log") return companyLog();
    if (command === "preview") return preview(subcommand ?? "home", rest.join(" "));
    if (command === "open") return openWeb(subcommand ?? "home", rest.join(" "));
    throw new Error("未対応のコマンドです。mogcia help を確認してください。");
  } catch (error) {
    if (error instanceof MogciaDesktopApiError) {
      printError(error.message);
      process.exitCode = 1;
      return;
    }
    printError(error instanceof Error ? error.message : "処理に失敗しました");
    process.exitCode = 1;
  }
}

function splash() {
  printBrand();
  console.log(color.dim("  mogcia help でコマンド一覧を表示できます\n"));
  console.log(box([
    row("アクティブ", "mogcia status"),
    row("今日のタスク", "mogcia list"),
    row("AIメモ整理", "mogcia memo"),
    row("プレビュー", "mogcia preview home")
  ], "基本コマンド"));
}

function help() {
  printBrand();
  console.log(box([
    row("mogcia login", "URLとデスクトップトークンを保存"),
    row("mogcia status", "接続状態と今日の状態を表示"),
    row("mogcia list", "今日・期限切れタスクを表示"),
    row("mogcia run memo", "AIメモ整理を開始"),
    row("mogcia task add \"タイトル\"", "タスクを登録"),
    row("mogcia company search \"会社名\"", "会社を検索"),
    row("mogcia company log", "活動ログを登録"),
    row("mogcia preview home", "Web画面URLを表示して開く"),
    row("mogcia doctor", "環境・設定を診断")
  ], "基本コマンド"));
}

async function login() {
  const rl = readline.createInterface({ input, output });
  const baseUrl = normalizeBaseUrl(await rl.question("MOGCIA Agent URL: "));
  const token = (await rl.question("デスクトップアクセストークン: ")).trim();
  rl.close();
  if (!token) throw new Error("アクセストークンを入力してください。");
  await saveConfig({ baseUrl });
  await saveToken(token);
  const client = new MogciaDesktopClient({ baseUrl, token });
  const verify = await client.verify();
  printBrand();
  printOk(`ログインしました: ${verify.device.deviceName}`);
}

async function status() {
  printBrand("ステータス確認");
  const config = await loadConfig();
  const client = await createClient();
  const verify = await client.verify();
  const { tasks } = await client.todayTasks();
  const overdue = tasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < startOfTokyoToday().getTime());
  const dueToday = tasks.filter((task) => !overdue.includes(task));
  console.log(box([
    row("接続", `${color.green("Complete")}  ${verify.device.deviceName}`),
    row("Project", config.baseUrl),
    row("今日のタスク", `${dueToday.length}件`),
    row("期限切れ", `${overdue.length}件`),
    row("状態", color.green("Ready"))
  ], "MOGCIA Dev Agent"));
}

async function today() {
  const client = await createClient();
  printBrand("今日のタスク");
  const { tasks } = await client.todayTasks();
  if (tasks.length === 0) {
    printOk("今日・期限切れのタスクはありません。");
    return;
  }
  const overdue = tasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < startOfTokyoToday().getTime());
  const dueToday = tasks.filter((task) => !overdue.includes(task));
  printTaskGroup("期限切れ", overdue);
  printTaskGroup("今日", dueToday);
}

async function companySearch(query: string) {
  const keyword = query.trim() || await ask("会社を検索: ");
  const client = await createClient();
  printProgress("会社を検索しています");
  const { companies } = await client.searchCompanies(keyword);
  if (companies.length === 0) {
    printWarn("会社が見つかりませんでした。");
    return;
  }
  console.log(box(companies.map((company, index) => row(`${index + 1}. ${company.name}`, `${company.industry ? `${company.industry} / ` : ""}${company.id}`)), "会社候補"));
}

async function taskAdd(args: string[]) {
  const title = args.find((arg) => !arg.startsWith("--"));
  if (!title) throw new Error("タスクタイトルを入力してください。");
  const options = parseOptions(args);
  const client = await createClient();
  const company = options.company ? await selectCompany(client, options.company) : null;
  const dueDate = options.due ? parseNaturalDate(options.due) : null;
  if (options.due && !dueDate) throw new Error("期限を解釈できませんでした。例: tomorrow 18:00 / 2026-08-03 18:00");
  printProgress("タスクを登録しています");
  const result = await client.createTask({
    title,
    description: options.description,
    companyId: company?.id ?? null,
    dueDate: dueDate?.toISOString() ?? null,
    priority: normalizePriority(options.priority)
  });
  printOk(`登録しました: ${result.taskId}`);
}

async function companyLog() {
  const client = await createClient();
  const company = await selectCompany(client, await ask("会社を検索: "));
  const type = (await ask("種類（phone/email/visit/meeting/memo/other）: ")) || "memo";
  const title = await ask("タイトル: ");
  const content = await askMultiline("内容（空行で終了）:");
  printProgress("活動ログを登録しています");
  const result = await client.createActivityLog({ companyId: company.id, type, title, content, occurredAt: new Date().toISOString() });
  printOk(`登録しました: ${result.activityLogId}`);
}

async function memo() {
  const client = await createClient();
  const companyKeyword = await ask("会社を検索（未選択ならEnter）: ");
  const company = companyKeyword ? await selectCompany(client, companyKeyword) : null;
  const text = await askMultiline("内容（空行で終了）:");
  if (!text.trim()) throw new Error("メモ内容を入力してください。");

  printProgress("AIがメモを整理しています");
  const { memoId, parsed } = await client.parseMemo({ text, companyId: company?.id ?? null, createdFrom: "cli" });
  const selectedCompany = company ?? await chooseCompanyCandidate(client, parsed);
  if (!selectedCompany) throw new Error("会社を選択してください。");
  const confirmed = await reviewParsedMemo(parsed);
  if (!confirmed) {
    printWarn("登録をキャンセルしました。");
    return;
  }
  printProgress("登録しています");
  const result = await client.commitMemo({
    memoId,
    companyId: selectedCompany.id,
    originalText: text,
    activityLog: parsed.activityLog,
    tasks: parsed.suggestedTasks,
    companyNotes: parsed.companyNotes,
    createdFrom: "cli"
  });
  printOk(`登録しました: ログ ${result.activityLogId ?? "-"} / タスク ${result.taskIds.length}件 / メモ ${result.companyNoteIds.length}件`);
}

async function openWeb(target: string, query: string) {
  const url = await resolveWebUrl(target, query);
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

async function preview(target: string, query: string) {
  printBrand("プレビューURL");
  const url = await resolveWebUrl(target, query);
  console.log(box([
    row("Local / Web", color.green(url)),
    row("コピー", "URLを選択してコピーしてください")
  ], "Preview"));
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

async function resolveWebUrl(target: string, query: string) {
  const config = await loadConfig();
  let path = "/home";
  if (target === "home") path = "/home";
  if (target === "tasks") path = "/tasks";
  if (target === "calendar") path = "/calendar";
  if (target === "companies") path = "/sales/companies";
  if (target === "upload") path = "/sales/upload";
  if (target === "company") {
    const client = await createClient();
    const company = await selectCompany(client, query || await ask("会社を検索: "));
    path = `/sales/companies?id=${encodeURIComponent(company.id)}`;
  }
  return `${config.baseUrl.replace(/\/$/, "")}${path}`;
}

async function runShortcut(target?: string, args: string[] = []) {
  if (!target || target === "memo") return memo();
  if (target === "task") return taskAdd(args);
  if (target === "status") return status();
  throw new Error("run は memo / task / status に対応しています。");
}

async function doctor() {
  printBrand("Doctor");
  const checks: string[] = [];
  try {
    const config = await loadConfig();
    checks.push(row("Config", color.green(config.baseUrl)));
  } catch (error) {
    checks.push(row("Config", color.red(error instanceof Error ? error.message : "未設定")));
  }
  try {
    await readToken();
    checks.push(row("Token", color.green("保存済み")));
  } catch (error) {
    checks.push(row("Token", color.red(error instanceof Error ? error.message : "未登録")));
  }
  try {
    const client = await createClient();
    const verify = await client.verify();
    checks.push(row("API", color.green(`接続OK: ${verify.device.deviceName}`)));
  } catch (error) {
    checks.push(row("API", color.red(error instanceof Error ? error.message : "接続失敗")));
  }
  console.log(box(checks, "環境診断"));
}

async function createClient() {
  const config = await loadConfig();
  const token = await readToken();
  return new MogciaDesktopClient({ baseUrl: config.baseUrl, token });
}

async function selectCompany(client: MogciaDesktopClient, keyword: string): Promise<DesktopCompanyResult> {
  printProgress("会社を検索しています");
  const { companies } = await client.searchCompanies(keyword);
  if (companies.length === 0) throw new Error("会社が見つかりませんでした。");
  if (companies.length === 1) return companies[0];
  companies.slice(0, 10).forEach((company, index) => console.log(`${index + 1}. ${company.name}`));
  const answer = await ask("会社番号: ");
  const index = Number(answer) - 1;
  const company = companies[index];
  if (!company) throw new Error("会社を選択できませんでした。");
  return company;
}

async function chooseCompanyCandidate(client: MogciaDesktopClient, parsed: ParsedDesktopMemo) {
  const candidates = parsed.companyCandidates ?? [];
  if (candidates.length === 0) return null;
  console.log("\n会社候補");
  candidates.forEach((company, index) => console.log(`${index + 1}. ${company.name} (${Math.round(company.confidence * 100)}%)`));
  const answer = await ask("会社番号（未選択ならEnter）: ");
  if (!answer) return null;
  const candidate = candidates[Number(answer) - 1];
  if (!candidate) return null;
  const { companies } = await client.searchCompanies(candidate.name);
  return companies.find((company) => company.id === candidate.id) ?? { id: candidate.id, name: candidate.name };
}

async function reviewParsedMemo(parsed: ParsedDesktopMemo): Promise<boolean> {
  console.log("\n活動ログ候補");
  if (parsed.activityLog) {
    console.log(`[x] ${parsed.activityLog.type}: ${parsed.activityLog.title}`);
    parsed.activityLog.selected = await confirm("活動ログを登録しますか？", parsed.activityLog.selected);
  } else {
    console.log("なし");
  }

  console.log("\nタスク候補");
  for (const task of parsed.suggestedTasks) {
    console.log(`[x] ${task.title}`);
    console.log(`    期限: ${task.dueDate ?? "未設定"} / 優先度: ${priorityLabel(task.priority)}`);
    task.selected = await confirm("このタスクを登録しますか？", task.selected);
  }

  console.log("\n会社メモ");
  for (const note of parsed.companyNotes) {
    console.log(`[x] ${note.content}`);
    note.selected = await confirm("このメモを登録しますか？", note.selected);
  }

  if (parsed.warnings?.length) {
    console.log("\n注意");
    parsed.warnings.forEach((warning) => console.log(`- ${warning}`));
  }

  return confirm("\n選択した内容を登録しますか？", true);
}

function parseOptions(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    options[arg.slice(2)] = args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "true";
  }
  return options;
}

function parseNaturalDate(value: string): Date | null {
  const normalized = value.trim().toLowerCase();
  const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? Number(timeMatch[1]) : 18;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const today = startOfTokyoToday();
  if (normalized.startsWith("today")) return setTime(today, hour, minute);
  if (normalized.startsWith("tomorrow")) {
    const date = new Date(today);
    date.setDate(date.getDate() + 1);
    return setTime(date, hour, minute);
  }
  if (normalized.startsWith("next ")) {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = weekdays.findIndex((day) => normalized.includes(day));
    if (target >= 0) {
      const date = new Date(today);
      const diff = ((target - date.getDay() + 7) % 7) || 7;
      date.setDate(date.getDate() + diff);
      return setTime(date, hour, minute);
    }
  }
  const parsed = new Date(normalized.includes("t") ? normalized : normalized.replace(" ", "T") + (timeMatch ? "+09:00" : "T18:00:00+09:00"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfTokyoToday(): Date {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${map.year}-${map.month}-${map.day}T00:00:00+09:00`);
}

function setTime(date: Date, hour: number, minute: number) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function printTaskGroup(label: string, tasks: Array<{ title: string; priority: string }>) {
  if (tasks.length === 0) return;
  console.log(box(tasks.map((task) => row(priorityLabel(task.priority), task.title)), label));
}

const color = {
  pink: (value: string) => `\u001b[38;5;211m${value}\u001b[0m`,
  green: (value: string) => `\u001b[38;5;119m${value}\u001b[0m`,
  yellow: (value: string) => `\u001b[38;5;222m${value}\u001b[0m`,
  red: (value: string) => `\u001b[38;5;203m${value}\u001b[0m`,
  dim: (value: string) => `\u001b[2m${value}\u001b[0m`
};

function printBrand(subtitle = "Terminal Agent") {
  console.log(`${color.pink("MOGCIA Dev Agent")}  ${color.dim(subtitle)}`);
  console.log(color.pink("  /\\_/\\\\"));
  console.log(color.pink(" ( o.o )") + "  " + color.dim("AIと、いっしょに考え、つくる。"));
  console.log(color.pink("  > ^ <") + "\n");
}

function row(label: string, value: string) {
  return `${label.padEnd(18, " ")} ${value}`;
}

function box(lines: string[], title: string) {
  const plainLines = lines.map(stripAnsi);
  const width = Math.max(title.length + 4, ...plainLines.map((line) => line.length)) + 4;
  const top = `╭─ ${color.pink(title)} ${"─".repeat(Math.max(0, width - title.length - 5))}╮`;
  const body = lines.map((line) => `│ ${line}${" ".repeat(Math.max(0, width - stripAnsi(line).length - 2))}│`);
  const bottom = `╰${"─".repeat(width)}╯`;
  return [top, ...body, bottom].join("\n");
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function printOk(message: string) {
  console.log(`${color.green("✓")} ${message}`);
}

function printWarn(message: string) {
  console.log(`${color.yellow("!")} ${message}`);
}

function printError(message: string) {
  console.error(`${color.red("Error")} ${message}`);
}

function printProgress(message: string) {
  console.log(`${color.pink("...")} ${message}`);
}

function priorityLabel(priority: string) {
  if (priority === "high") return "高";
  if (priority === "low") return "低";
  return "中";
}

function normalizePriority(value?: string): "high" | "medium" | "low" {
  if (value === "high" || value === "low") return value;
  return "medium";
}

async function ask(question: string) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function askMultiline(label: string) {
  console.log(label);
  const rl = readline.createInterface({ input, output });
  const lines: string[] = [];
  while (true) {
    const line = await rl.question("> ");
    if (!line.trim()) break;
    lines.push(line);
  }
  rl.close();
  return lines.join("\n");
}

async function confirm(question: string, defaultValue: boolean) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await ask(`${question} ${suffix}: `)).toLowerCase();
  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes";
}

async function saveConfig(config: Config) {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

async function loadConfig(): Promise<Config> {
  try {
    const data = JSON.parse(await readFile(configPath, "utf8")) as Config;
    if (!data.baseUrl) throw new Error("MOGCIA Agent URLが未設定です。mogcia login を実行してください。");
    return data;
  } catch {
    throw new Error("MOGCIA Agent URLが未設定です。mogcia login を実行してください。");
  }
}

async function saveToken(token: string) {
  await execFileAsync("security", ["add-generic-password", "-a", accountName, "-s", serviceName, "-w", token, "-U"]);
}

async function readToken() {
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", accountName, "-s", serviceName, "-w"]);
    return stdout.trim();
  } catch {
    throw new Error("デスクトップアクセストークンが未登録です。mogcia login を実行してください。");
  }
}

function normalizeBaseUrl(value: string) {
  const url = value.trim().replace(/\/$/, "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) throw new Error("URLは http:// または https:// から入力してください。");
  return url;
}

void main();
