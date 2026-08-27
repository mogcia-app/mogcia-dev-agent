import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { agentRunsCollection, createAgentNotification, developmentProjectsCollection, getProjectMemory, markStep } from "@/lib/server/agent/repository";

export const developmentWorkersCollection = "developmentWorkers";
export const developmentJobsCollection = "developmentJobs";

type WorkerUser = { uid: string; name?: string };

export async function registerDevelopmentWorker(user: WorkerUser, input: Record<string, unknown>) {
  const db = getAdminDb();
  const workerId = stringValue(input.workerId) || `worker-${user.uid}-${Date.now()}`;
  const ref = db.collection(developmentWorkersCollection).doc(workerId);
  await ref.set({
    name: stringValue(input.name) || "MOGCIA Worker",
    deviceId: nullableString(input.deviceId),
    userId: user.uid,
    status: "online",
    hostname: nullableString(input.hostname),
    os: nullableString(input.os),
    architecture: nullableString(input.architecture),
    capabilities: stringArray(input.capabilities),
    lastSeenAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { workerId };
}

export async function heartbeatDevelopmentWorker(user: WorkerUser, workerId: string, input: Record<string, unknown>) {
  const ref = getAdminDb().collection(developmentWorkersCollection).doc(workerId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== user.uid) throw new Error("Workerが見つかりません。");
  await ref.set({
    status: input.status === "busy" ? "busy" : "online",
    capabilities: stringArray(input.capabilities).length ? stringArray(input.capabilities) : snapshot.data()?.capabilities ?? [],
    lastSeenAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { workerId };
}

export async function listDevelopmentProjectsForWorker() {
  const snapshot = await getAdminDb().collection(developmentProjectsCollection).where("isActive", "==", true).get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...serialize(entry.data()) }));
}

export async function createDevelopmentJob(input: {
  userId: string;
  runId: string;
  requestId: string;
  projectId: string;
  title: string;
  instruction: string;
  requiredCapabilities: string[];
}) {
  const ref = await getAdminDb().collection(developmentJobsCollection).add({
    userId: input.userId,
    runId: input.runId,
    requestId: input.requestId,
    projectId: input.projectId,
    title: input.title,
    instruction: input.instruction,
    status: "queued",
    requiredCapabilities: input.requiredCapabilities,
    assignedWorkerId: null,
    branchName: null,
    startedAt: null,
    completedAt: null,
    result: null,
    errorMessage: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { jobId: ref.id };
}

export async function claimDevelopmentJob(user: WorkerUser, input: { workerId: string; capabilities: string[] }) {
  const db = getAdminDb();
  const workerRef = db.collection(developmentWorkersCollection).doc(input.workerId);
  const workerSnapshot = await workerRef.get();
  if (!workerSnapshot.exists || workerSnapshot.data()?.userId !== user.uid) throw new Error("Workerが見つかりません。");
  const queued = await db.collection(developmentJobsCollection).where("status", "==", "queued").orderBy("createdAt", "asc").limit(10).get();
  const candidate = queued.docs.find((entry) => hasCapabilities(input.capabilities, stringArray(entry.data().requiredCapabilities)));
  if (!candidate) {
    await workerRef.set({ status: "online", lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { job: null };
  }

  const claimed = await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(candidate.ref);
    if (!fresh.exists || fresh.data()?.status !== "queued") return null;
    transaction.update(candidate.ref, {
      status: "assigned",
      assignedWorkerId: input.workerId,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(workerRef, { status: "busy", lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { id: fresh.id, ...(fresh.data() ?? {}), status: "assigned", assignedWorkerId: input.workerId } as DocumentData;
  });
  if (!claimed) return { job: null };
  await updateRunForJob(claimed.runId as string, {
    status: "running",
    progress: 45,
    currentStep: "codex",
    answer: "開発Workerに割り当てました。Repository確認とCodex実行を開始します。",
    logs: FieldValue.arrayUnion(`Development Job ${claimed.id} をWorker ${input.workerId}に割り当てました。`)
  });
  const project = await getProjectForWorker(String(claimed.projectId));
  const memory = await getProjectMemory(String(claimed.projectId));
  return { job: serialize(claimed), project, memory };
}

export async function markDevelopmentJobRunning(user: WorkerUser, jobId: string, workerId: string, patch: Record<string, unknown>) {
  const job = await getWorkerJob(user, jobId, workerId);
  await job.ref.update({
    status: "running",
    branchName: nullableString(patch.branchName) ?? job.data.branchName ?? null,
    updatedAt: FieldValue.serverTimestamp()
  });
  await updateRunForJob(String(job.data.runId), {
    status: "running",
    progress: 62,
    currentStep: "codex",
    logs: FieldValue.arrayUnion(stringValue(patch.message) || "Workerが開発Jobを実行中です。")
  });
  return { jobId };
}

export async function appendDevelopmentJobLog(user: WorkerUser, jobId: string, workerId: string, input: Record<string, unknown>) {
  const job = await getWorkerJob(user, jobId, workerId);
  const log = {
    workerId,
    step: stringValue(input.step),
    command: stringValue(input.command),
    status: input.status === "error" ? "error" : "success",
    summary: stringValue(input.summary),
    startedAt: dateOrNow(input.startedAt),
    completedAt: dateOrNow(input.completedAt)
  };
  await job.ref.collection("logs").add(log);
  await updateRunForJob(String(job.data.runId), {
    toolLogs: FieldValue.arrayUnion({
      toolName: `worker:${log.step || log.command || "log"}`,
      status: log.status,
      summary: log.summary,
      targetType: "project",
      targetId: job.data.projectId ?? null,
      executedAt: Timestamp.now()
    }),
    logs: FieldValue.arrayUnion(log.summary || `${log.step}を実行しました。`)
  });
  return { jobId };
}

export async function completeDevelopmentJob(user: WorkerUser, jobId: string, workerId: string, input: Record<string, unknown>) {
  const job = await getWorkerJob(user, jobId, workerId);
  const status = input.status === "failed" ? "failed" : input.status === "cancelled" ? "cancelled" : "completed";
  const result = input.result && typeof input.result === "object" ? input.result as Record<string, unknown> : {};
  await job.ref.update({
    status,
    result,
    errorMessage: nullableString(input.errorMessage),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  await getAdminDb().collection(developmentWorkersCollection).doc(workerId).set({
    status: "online",
    lastSeenAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const success = status === "completed";
  await updateRunForJob(String(job.data.runId), {
    status: success ? "requires_approval" : "error",
    requiresApproval: success,
    progress: 100,
    currentStep: success ? "review" : "complete",
    completedAt: success ? null : FieldValue.serverTimestamp(),
    answer: success ? "実装が完了しました。変更内容と検証結果を確認してください。本番反映やmergeは行っていません。" : stringValue(input.errorMessage) || "Development Jobが失敗しました。",
    changeSummary: formatChangeSummary(result),
    reviewSummary: String(result.diff ?? "").slice(0, 12000),
    buildSummary: formatValidationSummary(result),
    previewUrl: null,
    cards: [jobResultCard(jobId, workerId, result, success)],
    steps: success ? markStep(markStep(job.data.steps, "codex", "success", "Codex実行が完了しました。"), "review", "running", "人間の確認待ちです。") : markStep(job.data.steps, "codex", "error", stringValue(input.errorMessage) || "Workerでエラーが発生しました。"),
    logs: FieldValue.arrayUnion(success ? "Development Jobが完了しました。確認待ちに移行します。" : "Development Jobが失敗しました。")
  });
  await createAgentNotification({
    userId: String(job.data.userId),
    title: success ? "開発Jobが完了しました" : "開発Jobが失敗しました",
    message: String(job.data.title ?? "Development Job"),
    type: success ? "approval" : "error",
    runId: String(job.data.runId),
    targetUrl: `/agent?runId=${job.data.runId}`
  });
  return { jobId };
}

export async function getProjectForWorker(projectId: string) {
  const snapshot = await getAdminDb().collection(developmentProjectsCollection).doc(projectId).get();
  if (!snapshot.exists) throw new Error("Development Projectが見つかりません。");
  return { id: snapshot.id, ...serialize(snapshot.data() ?? {}) };
}

async function getWorkerJob(user: WorkerUser, jobId: string, workerId: string) {
  const worker = await getAdminDb().collection(developmentWorkersCollection).doc(workerId).get();
  if (!worker.exists || worker.data()?.userId !== user.uid) throw new Error("Workerが見つかりません。");
  const ref = getAdminDb().collection(developmentJobsCollection).doc(jobId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.assignedWorkerId !== workerId) throw new Error("Jobが見つからないか、このWorkerに割り当てられていません。");
  return { ref, data: snapshot.data() ?? {} };
}

async function updateRunForJob(runId: string, patch: Record<string, unknown>) {
  await getAdminDb().collection(agentRunsCollection).doc(runId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

function hasCapabilities(workerCapabilities: string[], required: string[]) {
  return required.every((capability) => workerCapabilities.includes(capability));
}

function jobResultCard(jobId: string, workerId: string, result: Record<string, unknown>, success: boolean) {
  return {
    id: jobId,
    type: "summary",
    title: success ? "実装完了" : "開発Job失敗",
    subtitle: `Worker: ${workerId}`,
    tone: success ? "success" : "error",
    meta: [
      { label: "Branch", value: stringValue(result.branchName) || "未設定" },
      { label: "変更ファイル", value: `${arrayValue(result.changedFiles).length}` },
      { label: "差分", value: `+${numberValue(result.insertions)} / -${numberValue(result.deletions)}` },
      { label: "Commit", value: stringValue(result.commitSha) || "未作成" }
    ]
  };
}

function formatChangeSummary(result: Record<string, unknown>) {
  return [
    stringValue(result.summary),
    `Branch: ${stringValue(result.branchName) || "未設定"}`,
    `Commit: ${stringValue(result.commitSha) || "未作成"}`,
    `Changed files: ${arrayValue(result.changedFiles).join(", ") || "なし"}`,
    `Diff: +${numberValue(result.insertions)} / -${numberValue(result.deletions)}`
  ].filter(Boolean).join("\n");
}

function formatValidationSummary(result: Record<string, unknown>) {
  const rows = arrayValue(result.validationResults);
  if (!rows.length) return "検証コマンドは未実行です。";
  return rows.map((row) => {
    const data = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return `${stringValue(data.command)}: ${data.status === "success" ? "success" : "error"}`;
  }).join("\n");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const next = stringValue(value);
  return next || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function dateOrNow(value: unknown): Timestamp {
  if (value instanceof Timestamp) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return Timestamp.fromDate(date);
  }
  return Timestamp.now();
}

function serialize(data: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeValue(value)]));
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") return serialize(value as DocumentData);
  return value;
}
