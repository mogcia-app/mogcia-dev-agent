import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AgentRunStep, AgentSource, CreateDevelopmentProjectInput } from "@/types/agent";

export const agentRequestsCollection = "agentRequests";
export const agentRunsCollection = "agentRuns";
export const agentNotificationsCollection = "agentNotifications";
export const developmentProjectsCollection = "developmentProjects";

const defaultRunSteps = [
  { type: "plan", status: "waiting", message: "依頼内容を整理します。" },
  { type: "execute", status: "waiting", message: "管理画面・Desktop Agent・CLI向けの実行処理を接続します。" },
  { type: "codex", status: "waiting", message: "Codex連携は次フェーズで接続します。" },
  { type: "review", status: "waiting", message: "変更内容の確認を行います。" },
  { type: "build", status: "waiting", message: "TypeScript / lint / buildを確認します。" },
  { type: "preview", status: "waiting", message: "Preview確認を行います。" },
  { type: "complete", status: "waiting", message: "完了状態を記録します。" }
];

export async function createAgentRequestForUser(input: {
  userId: string;
  rawMessage: string;
  source?: AgentSource;
  intent?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  projectId?: string | null;
}) {
  const db = getAdminDb();
  const rawMessage = input.rawMessage.trim();
  if (!rawMessage) throw new Error("依頼内容を入力してください。");
  const source = input.source ?? "web";

  const requestRef = await db.collection(agentRequestsCollection).add({
    userId: input.userId,
    rawMessage,
    status: "queued",
    source,
    intent: input.intent ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    projectId: input.projectId ?? null,
    createdAt: FieldValue.serverTimestamp()
  });

  const runRef = await db.collection(agentRunsCollection).add({
    userId: input.userId,
    requestId: requestRef.id,
    title: createRunTitle(rawMessage),
    status: "queued",
    source,
    intent: input.intent ?? null,
    projectId: input.projectId ?? null,
    leadId: null,
    companyId: null,
    taskId: null,
    productId: null,
    analysisId: null,
    currentStep: "plan",
    progress: 0,
    requiresApproval: false,
    createdAt: FieldValue.serverTimestamp(),
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    steps: defaultRunSteps,
    logs: [`${sourceLabel(source)}から依頼を受け付けました。`],
    changeSummary: null,
    reviewSummary: null,
    buildSummary: null,
    previewUrl: null
  });

  await createAgentNotification({
    userId: input.userId,
    title: "Agent依頼を受け付けました",
    message: createRunTitle(rawMessage),
    type: "info",
    runId: runRef.id,
    projectId: input.projectId ?? null,
    targetUrl: `/agent?runId=${runRef.id}`
  });

  return { requestId: requestRef.id, runId: runRef.id };
}

export async function listAgentRuns(userId: string, count = 80) {
  const snapshot = await getAdminDb().collection(agentRunsCollection).where("userId", "==", userId).orderBy("createdAt", "desc").limit(count).get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...serializeTimestamps(entry.data()) }));
}

export async function getAgentRun(userId: string, runId: string) {
  const snapshot = await getAdminDb().collection(agentRunsCollection).doc(runId).get();
  if (!snapshot.exists || snapshot.data()?.userId !== userId) return null;
  return { id: snapshot.id, ...serializeTimestamps(snapshot.data() ?? {}) };
}

export async function updateAgentRunForUser(userId: string, runId: string, patch: Record<string, unknown>) {
  const ref = getAdminDb().collection(agentRunsCollection).doc(runId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== userId) throw new Error("Agent Runが見つかりません。");
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  return getAgentRun(userId, runId);
}

export async function getAgentRunForExecution(userId: string, runId: string): Promise<(Record<string, unknown> & { id: string }) | null> {
  const snapshot = await getAdminDb().collection(agentRunsCollection).doc(runId).get();
  if (!snapshot.exists || snapshot.data()?.userId !== userId) return null;
  return { id: snapshot.id, ...(snapshot.data() ?? {}) };
}

export async function updateAgentRequestForUser(userId: string, requestId: string, patch: Record<string, unknown>) {
  const ref = getAdminDb().collection(agentRequestsCollection).doc(requestId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== userId) throw new Error("Agent Requestが見つかりません。");
  await ref.update(patch);
}

export async function patchAgentRunForExecution(userId: string, runId: string, patch: Record<string, unknown>) {
  const ref = getAdminDb().collection(agentRunsCollection).doc(runId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== userId) throw new Error("Agent Runが見つかりません。");
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
}

export function markStep(steps: AgentRunStep[] | undefined, type: string, status: string, message?: string): AgentRunStep[] {
  const now = Timestamp.now() as unknown as AgentRunStep["startedAt"];
  const nextSteps = Array.isArray(steps) && steps.length ? steps : defaultRunSteps as AgentRunStep[];
  return nextSteps.map((step) => {
    if (step.type !== type) return step;
    return {
      ...step,
      status: status === "running" || status === "success" || status === "error" ? status : "waiting",
      message: message ?? step.message,
      startedAt: status === "running" && !step.startedAt ? now : step.startedAt ?? null,
      completedAt: status === "success" || status === "error" ? now : step.completedAt ?? null
    };
  });
}

export async function createAgentNotification(input: {
  userId: string;
  title: string;
  message: string;
  type?: string;
  runId?: string | null;
  projectId?: string | null;
  targetUrl?: string | null;
}) {
  const ref = await getAdminDb().collection(agentNotificationsCollection).add({
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type ?? "info",
    runId: input.runId ?? null,
    projectId: input.projectId ?? null,
    targetUrl: input.targetUrl ?? null,
    read: false,
    createdAt: FieldValue.serverTimestamp()
  });
  return { id: ref.id };
}

export async function listAgentNotifications(userId: string, count = 40) {
  const snapshot = await getAdminDb().collection(agentNotificationsCollection).where("userId", "==", userId).orderBy("createdAt", "desc").limit(count).get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...serializeTimestamps(entry.data()) }));
}

export async function listDevelopmentProjects() {
  const snapshot = await getAdminDb().collection(developmentProjectsCollection).orderBy("updatedAt", "desc").get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...serializeTimestamps(entry.data()) }));
}

export async function createDevelopmentProject(input: CreateDevelopmentProjectInput) {
  const ref = await getAdminDb().collection(developmentProjectsCollection).add({
    ...input,
    name: input.name.trim(),
    slug: input.slug.trim(),
    isActive: input.isActive ?? true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  await ref.collection("memory").doc("default").set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id: ref.id };
}

export async function getProjectMemory(projectId: string) {
  const snapshot = await getAdminDb().collection(developmentProjectsCollection).doc(projectId).collection("memory").doc("default").get();
  return { projectId, ...serializeTimestamps(snapshot.data() ?? {}) };
}

export async function saveProjectMemory(projectId: string, memory: Record<string, unknown>) {
  await getAdminDb().collection(developmentProjectsCollection).doc(projectId).collection("memory").doc("default").set(
    {
      productOverview: stringOrEmpty(memory.productOverview),
      architecture: stringOrEmpty(memory.architecture),
      designRules: stringOrEmpty(memory.designRules),
      codingRules: stringOrEmpty(memory.codingRules),
      decisions: stringOrEmpty(memory.decisions),
      notes: stringOrEmpty(memory.notes),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  return getProjectMemory(projectId);
}

function createRunTitle(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 42 ? `${compact.slice(0, 42)}...` : compact;
}

function sourceLabel(source: AgentSource): string {
  if (source === "desktop") return "Desktop Agent";
  if (source === "cli") return "CLI";
  return "管理画面";
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function serializeTimestamps(data: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeValue(value)]));
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") return serializeTimestamps(value as DocumentData);
  return value;
}
