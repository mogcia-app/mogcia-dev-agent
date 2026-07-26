import type { CodexCheckStatus, CodexResult, DevelopmentProgressItem, Project, TimelineEvent, WorkTask } from "./types";

export interface CodexResultInput {
  status: "completed" | "failed";
  summary: string;
  completedItems: string[];
  remainingItems: string[];
  changedFiles: string[];
  warnings: string[];
  errors: string[];
  checks: {
    typecheck: CodexCheckStatus;
    lint: CodexCheckStatus;
    build: CodexCheckStatus;
  };
  duration: number;
  rawOutput?: string;
}

export function parseCodexResultJson(value: string): CodexResultInput {
  const parsed = JSON.parse(value) as Partial<CodexResultInput>;
  const checks: Partial<CodexResultInput["checks"]> = parsed.checks ?? {};

  return {
    status: parsed.status === "failed" ? "failed" : "completed",
    summary: typeof parsed.summary === "string" ? parsed.summary : "Codex実行結果を取り込みました",
    completedItems: normalizeStringArray(parsed.completedItems),
    remainingItems: normalizeStringArray(parsed.remainingItems),
    changedFiles: normalizeStringArray(parsed.changedFiles),
    warnings: normalizeStringArray(parsed.warnings),
    errors: normalizeStringArray(parsed.errors),
    checks: {
      typecheck: normalizeCheckStatus(checks.typecheck),
      lint: normalizeCheckStatus(checks.lint),
      build: normalizeCheckStatus(checks.build)
    },
    duration: typeof parsed.duration === "number" ? parsed.duration : 0,
    rawOutput: typeof parsed.rawOutput === "string" ? parsed.rawOutput : undefined
  };
}

export function createCodexResultRecord({
  input,
  runId,
  projectId,
  importedBy
}: {
  input: CodexResultInput;
  runId: string;
  projectId: string;
  importedBy: string;
}): CodexResult {
  return {
    id: `codex-result-${crypto.randomUUID()}`,
    runId,
    projectId,
    ...input,
    importedBy,
    importedAt: new Date().toISOString()
  };
}

export function mapCodexResultToProgressItems({
  result,
  updatedBy
}: {
  result: CodexResult;
  updatedBy: string;
}): DevelopmentProgressItem[] {
  const completed = result.completedItems.map((title) => createProgressItem({ result, title, status: "completed", updatedBy }));
  const remaining = result.remainingItems.map((title) => createProgressItem({ result, title, status: "remaining", updatedBy }));
  return [...completed, ...remaining];
}

export function findCompletedWorkTaskIds({ result, tasks }: { result: CodexResult; tasks: WorkTask[] }): string[] {
  const completedKeys = result.completedItems.map(normalizeComparableText).filter(Boolean);
  const automaticTasks = tasks.filter((task) => !isHumanOnlyTask(task));

  return automaticTasks
    .filter((task) => {
      const taskText = normalizeComparableText(`${task.title} ${task.description ?? ""}`);
      return completedKeys.some((item) => taskText.includes(item) || item.includes(taskText));
    })
    .map((task) => task.id);
}

export function createCodexTimelineEvent({
  result,
  project,
  clientId
}: {
  result: CodexResult;
  project: Project;
  clientId: string;
}): TimelineEvent {
  const checkSummary = [
    `Typecheck ${result.checks.typecheck}`,
    `Lint ${result.checks.lint}`,
    `Build ${result.checks.build}`
  ].join(" / ");

  return {
    id: `timeline-codex-${crypto.randomUUID()}`,
    clientId,
    kind: "development",
    title: `Codex: ${project.name}`,
    date: new Date(result.importedAt).toLocaleDateString("ja-JP"),
    summary: `${result.summary} / ${checkSummary}`
  };
}

export function calculateCodexProgress({
  progressItems,
  tasks
}: {
  progressItems: DevelopmentProgressItem[];
  tasks: WorkTask[];
}): number {
  const codexItems = progressItems.filter((item) => item.status === "completed" || item.status === "remaining");
  if (codexItems.length > 0) {
    const completed = codexItems.filter((item) => item.status === "completed").length;
    return Math.round((completed / codexItems.length) * 100);
  }

  const trackedTasks = tasks.filter((task) => !isHumanOnlyTask(task));
  if (trackedTasks.length === 0) return 0;
  return Math.round((trackedTasks.filter((task) => task.status === "done").length / trackedTasks.length) * 100);
}

export function normalizeProgressItemId(projectId: string, title: string): string {
  return `development-progress-${projectId}-${normalizeComparableText(title).replace(/[^a-z0-9-]/g, "-").slice(0, 80) || crypto.randomUUID()}`;
}

function createProgressItem({
  result,
  title,
  status,
  updatedBy
}: {
  result: CodexResult;
  title: string;
  status: DevelopmentProgressItem["status"];
  updatedBy: string;
}): DevelopmentProgressItem {
  return {
    id: normalizeProgressItemId(result.projectId, title),
    projectId: result.projectId,
    title,
    status,
    source: "codex-result",
    sourceRunId: result.runId,
    updatedAt: result.importedAt,
    updatedBy
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeCheckStatus(value: unknown): CodexCheckStatus {
  return value === "passed" || value === "failed" || value === "skipped" ? value : "skipped";
}

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

function isHumanOnlyTask(task: WorkTask): boolean {
  return ["レビュー", "UI確認", "クライアント確認", "本番反映"].some((keyword) => task.title.includes(keyword) || task.description?.includes(keyword));
}
