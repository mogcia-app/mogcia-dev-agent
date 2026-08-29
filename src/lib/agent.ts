"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type {
  AgentNotification,
  AgentPendingAction,
  AgentPendingSelection,
  AgentRequest,
  AgentResultCard,
  AgentRun,
  AgentRunStatus,
  AgentRunStep,
  AgentSource,
  AgentStepStatus,
  AgentStepType,
  CreateAgentRequestInput,
  CreateDevelopmentProjectInput,
  DevelopmentProject,
  AgentIntent,
  AgentTargetType,
  ProjectMemory
} from "@/types/agent";

export const agentRequestsCollection = "agentRequests";
export const agentRunsCollection = "agentRuns";
export const agentNotificationsCollection = "agentNotifications";
export const developmentProjectsCollection = "developmentProjects";

const defaultRunSteps: AgentRunStep[] = [
  { type: "plan", status: "waiting", message: "依頼内容を整理します。" },
  { type: "execute", status: "waiting", message: "管理画面・Desktop Agent・CLI向けの実行処理を接続します。" },
  { type: "codex", status: "waiting", message: "Codex連携は次フェーズで接続します。" },
  { type: "review", status: "waiting", message: "変更内容の確認を行います。" },
  { type: "build", status: "waiting", message: "TypeScript / lint / buildを確認します。" },
  { type: "preview", status: "waiting", message: "Preview確認を行います。" },
  { type: "complete", status: "waiting", message: "完了状態を記録します。" }
];

function fallbackTimestamp(): Timestamp {
  return Timestamp.now();
}

function timestamp(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : fallbackTimestamp();
}

function nullableTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeStep(value: unknown): AgentRunStep | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const type = isStepType(data.type) ? data.type : null;
  if (!type) return null;
  return {
    type,
    status: isStepStatus(data.status) ? data.status : "waiting",
    message: optionalString(data.message) ?? undefined,
    startedAt: nullableTimestamp(data.startedAt),
    completedAt: nullableTimestamp(data.completedAt)
  };
}

function isStepType(value: unknown): value is AgentStepType {
  return value === "plan" || value === "execute" || value === "codex" || value === "review" || value === "build" || value === "preview" || value === "complete";
}

function isStepStatus(value: unknown): value is AgentStepStatus {
  return value === "waiting" || value === "running" || value === "success" || value === "error";
}

function isRunStatus(value: unknown): value is AgentRunStatus {
  return value === "queued" || value === "running" || value === "requires_approval" || value === "completed" || value === "error" || value === "cancelled";
}

function normalizeIntent(value: unknown): AgentIntent | null {
  return isAgentIntent(value) ? value : null;
}

function normalizeTargetType(value: unknown): AgentTargetType | null {
  return value === "lead" || value === "company" || value === "task" || value === "product" || value === "analysis" || value === "project" || value === "calendar" || value === "activity" || value === "none" ? value : null;
}

function isAgentIntent(value: unknown): value is AgentIntent {
  return value === "search_leads"
    || value === "search_companies"
    || value === "get_company_summary"
    || value === "get_lead_summary"
    || value === "get_today_tasks"
    || value === "get_upcoming_tasks"
    || value === "get_calendar"
    || value === "create_task"
    || value === "update_task"
    || value === "get_analysis"
    || value === "get_meeting_history"
    || value === "create_activity"
    || value === "search_products"
    || value === "development_request"
    || value === "general";
}

function normalizeCards(value: unknown): AgentResultCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const data = entry as Record<string, unknown>;
    const title = optionalString(data.title);
    if (!title) return [];
    return [{
      id: optionalString(data.id) ?? undefined,
      type: typeof data.type === "string" ? data.type as AgentResultCard["type"] : "summary",
      title,
      subtitle: optionalString(data.subtitle),
      body: optionalString(data.body),
      href: optionalString(data.href),
      tone: data.tone === "success" || data.tone === "warning" || data.tone === "error" ? data.tone : "default",
      meta: Array.isArray(data.meta)
        ? data.meta.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const meta = item as Record<string, unknown>;
          return typeof meta.label === "string" && typeof meta.value === "string" ? [{ label: meta.label, value: meta.value }] : [];
        })
        : []
    }];
  });
}

function normalizePendingAction(value: unknown): AgentPendingAction | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const type = data.type === "create_task" || data.type === "update_task" || data.type === "create_activity" ? data.type : null;
  const title = optionalString(data.title);
  if (!type || !title) return null;
  return {
    type,
    title,
    description: optionalString(data.description),
    payload: data.payload && typeof data.payload === "object" ? data.payload as Record<string, unknown> : {},
    preview: normalizeCards(data.preview)
  };
}

function normalizePendingSelection(value: unknown): AgentPendingSelection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const title = optionalString(data.title);
  const targetType = data.targetType === "lead" || data.targetType === "company" || data.targetType === "task" || data.targetType === "product" || data.targetType === "project" ? data.targetType : null;
  const intent = normalizeIntent(data.intent);
  if (!title || !targetType || !intent) return null;
  return {
    title,
    description: optionalString(data.description),
    targetType,
    intent,
    entities: data.entities && typeof data.entities === "object" ? data.entities as Record<string, string> : {},
    candidates: normalizeCards(data.candidates)
  };
}

function normalizeToolLogs(value: unknown): AgentRun["toolLogs"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const data = entry as Record<string, unknown>;
    const toolName = optionalString(data.toolName);
    if (!toolName) return [];
    return [{
      toolName,
      status: data.status === "error" ? "error" as const : "success" as const,
      summary: optionalString(data.summary) ?? "",
      targetType: normalizeTargetType(data.targetType),
      targetId: optionalString(data.targetId),
      executedAt: timestamp(data.executedAt),
      errorMessage: optionalString(data.errorMessage)
    }];
  });
}

function normalizeRequest(id: string, data: DocumentData): AgentRequest {
  return {
    id,
    userId: String(data.userId ?? ""),
    rawMessage: String(data.rawMessage ?? ""),
    status: data.status === "running" || data.status === "requires_approval" || data.status === "completed" || data.status === "error" || data.status === "cancelled" ? data.status : "queued",
    source: data.source === "desktop" || data.source === "cli" ? data.source : "web",
    intent: normalizeIntent(data.intent),
    targetType: normalizeTargetType(data.targetType),
    targetId: optionalString(data.targetId),
    projectId: optionalString(data.projectId),
    createdAt: timestamp(data.createdAt)
  };
}

export function normalizeAgentRun(id: string, data: DocumentData): AgentRun {
  return {
    id,
    userId: String(data.userId ?? ""),
    requestId: String(data.requestId ?? ""),
    title: String(data.title ?? "Agent Run"),
    status: isRunStatus(data.status) ? data.status : "queued",
    source: data.source === "desktop" || data.source === "cli" ? data.source : "web",
    intent: normalizeIntent(data.intent),
    projectId: optionalString(data.projectId),
    leadId: optionalString(data.leadId),
    companyId: optionalString(data.companyId),
    taskId: optionalString(data.taskId),
    productId: optionalString(data.productId),
    analysisId: optionalString(data.analysisId),
    currentStep: isStepType(data.currentStep) ? data.currentStep : null,
    progress: typeof data.progress === "number" ? data.progress : 0,
    requiresApproval: Boolean(data.requiresApproval),
    createdAt: timestamp(data.createdAt),
    startedAt: nullableTimestamp(data.startedAt),
    completedAt: nullableTimestamp(data.completedAt),
    errorMessage: optionalString(data.errorMessage),
    steps: Array.isArray(data.steps) ? data.steps.map(normalizeStep).filter((step): step is AgentRunStep => Boolean(step)) : defaultRunSteps,
    logs: Array.isArray(data.logs) ? data.logs.filter((entry) => typeof entry === "string") : [],
    answer: optionalString(data.answer),
    cards: normalizeCards(data.cards),
    pendingAction: normalizePendingAction(data.pendingAction),
    pendingSelection: normalizePendingSelection(data.pendingSelection),
    toolLogs: normalizeToolLogs(data.toolLogs),
    entities: data.entities && typeof data.entities === "object" ? data.entities as Record<string, unknown> : null,
    changeSummary: optionalString(data.changeSummary),
    reviewSummary: optionalString(data.reviewSummary),
    buildSummary: optionalString(data.buildSummary),
    previewUrl: optionalString(data.previewUrl)
  };
}

function normalizeProject(id: string, data: DocumentData): DevelopmentProject {
  return {
    id,
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    description: optionalString(data.description) ?? undefined,
    repositoryUrl: optionalString(data.repositoryUrl) ?? undefined,
    repositoryOwner: optionalString(data.repositoryOwner) ?? undefined,
    repositoryName: optionalString(data.repositoryName) ?? undefined,
    defaultBranch: optionalString(data.defaultBranch) ?? undefined,
    projectKey: optionalString(data.projectKey) ?? undefined,
    requiredCapabilities: Array.isArray(data.requiredCapabilities) ? data.requiredCapabilities.filter((item): item is string => typeof item === "string") : [],
    validationCommands: Array.isArray(data.validationCommands) ? data.validationCommands.filter((item): item is string => typeof item === "string") : [],
    framework: optionalString(data.framework) ?? undefined,
    packageManager: optionalString(data.packageManager) ?? undefined,
    productionUrl: optionalString(data.productionUrl) ?? undefined,
    previewUrl: optionalString(data.previewUrl) ?? undefined,
    isActive: data.isActive !== false,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt)
  };
}

function normalizeProjectMemory(projectId: string, data: DocumentData | undefined): ProjectMemory {
  return {
    projectId,
    productOverview: optionalString(data?.productOverview) ?? "",
    architecture: optionalString(data?.architecture) ?? "",
    designRules: optionalString(data?.designRules) ?? "",
    codingRules: optionalString(data?.codingRules) ?? "",
    decisions: optionalString(data?.decisions) ?? "",
    notes: optionalString(data?.notes) ?? "",
    updatedAt: timestamp(data?.updatedAt)
  };
}

function normalizeNotification(id: string, data: DocumentData): AgentNotification {
  return {
    id,
    userId: String(data.userId ?? ""),
    title: String(data.title ?? ""),
    message: String(data.message ?? ""),
    type: data.type === "success" || data.type === "warning" || data.type === "error" || data.type === "approval" ? data.type : "info",
    source: data.source === "desktop" || data.source === "cli" ? data.source : "web",
    environment: data.environment === "test" || data.environment === "development" ? data.environment : "production",
    runId: optionalString(data.runId),
    projectId: optionalString(data.projectId),
    targetUrl: optionalString(data.targetUrl),
    read: Boolean(data.read),
    completed: Boolean(data.completed),
    createdAt: timestamp(data.createdAt),
    updatedAt: nullableTimestamp(data.updatedAt)
  };
}

export function subscribeAgentRuns(userId: string, onNext: (runs: AgentRun[]) => void, onError: (error: FirestoreError) => void, count = 80): Unsubscribe {
  const db = getFirebaseDb();
  if (!db || !userId) return () => undefined;
  return onSnapshot(
    query(collection(db, agentRunsCollection), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(count)),
    (snapshot) => onNext(snapshot.docs.map((entry) => normalizeAgentRun(entry.id, entry.data()))),
    onError
  );
}

export function subscribeAgentRequests(userId: string, onNext: (requests: AgentRequest[]) => void, onError: (error: FirestoreError) => void, count = 80): Unsubscribe {
  const db = getFirebaseDb();
  if (!db || !userId) return () => undefined;
  return onSnapshot(
    query(collection(db, agentRequestsCollection), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(count)),
    (snapshot) => onNext(snapshot.docs.map((entry) => normalizeRequest(entry.id, entry.data()))),
    onError
  );
}

export function subscribeAgentNotifications(userId: string, onNext: (notifications: AgentNotification[]) => void, onError: (error: FirestoreError) => void, count = 40): Unsubscribe {
  const db = getFirebaseDb();
  if (!db || !userId) return () => undefined;
  return onSnapshot(
    query(collection(db, agentNotificationsCollection), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(count)),
    (snapshot) => onNext(snapshot.docs.map((entry) => normalizeNotification(entry.id, entry.data())).filter((notification) => notification.environment !== "test")),
    onError
  );
}

export function subscribeDevelopmentProjects(onNext: (projects: DevelopmentProject[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, developmentProjectsCollection), orderBy("updatedAt", "desc")),
    (snapshot) => onNext(snapshot.docs.map((entry) => normalizeProject(entry.id, entry.data()))),
    onError
  );
}

export async function getProjectMemory(projectId: string): Promise<ProjectMemory> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const snapshot = await getDoc(doc(db, developmentProjectsCollection, projectId, "memory", "default"));
  return normalizeProjectMemory(projectId, snapshot.data());
}

export async function saveProjectMemory(projectId: string, memory: Omit<ProjectMemory, "projectId" | "updatedAt">): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await setDoc(doc(db, developmentProjectsCollection, projectId, "memory", "default"), { ...memory, updatedAt: serverTimestamp() }, { merge: true });
}

export async function createDevelopmentProject(input: CreateDevelopmentProjectInput): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const ref = await addDoc(collection(db, developmentProjectsCollection), {
    ...input,
    name: input.name.trim(),
    slug: input.slug.trim(),
    isActive: input.isActive ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, developmentProjectsCollection, ref.id, "memory", "default"), { updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function createAgentRequest(input: CreateAgentRequestInput, user: { uid: string }): Promise<{ requestId: string; runId: string }> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const rawMessage = input.rawMessage.trim();
  if (!rawMessage) throw new Error("依頼内容を入力してください。");

  const requestRef = await addDoc(collection(db, agentRequestsCollection), {
    userId: user.uid,
    rawMessage,
    status: "queued",
    source: "web" satisfies AgentSource,
    intent: input.intent ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    projectId: input.projectId ?? null,
    createdAt: serverTimestamp()
  });

  const runRef = await addDoc(collection(db, agentRunsCollection), {
    userId: user.uid,
    requestId: requestRef.id,
    title: createRunTitle(rawMessage),
    status: "queued",
    source: "web" satisfies AgentSource,
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
    createdAt: serverTimestamp(),
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    steps: defaultRunSteps,
    logs: ["管理画面から依頼を受け付けました。"],
    changeSummary: null,
    reviewSummary: null,
    buildSummary: null,
    previewUrl: null
  });

  await addDoc(collection(db, agentNotificationsCollection), {
    userId: user.uid,
    title: "Agent依頼を受け付けました",
    message: createRunTitle(rawMessage),
    type: "info",
    source: "web" satisfies AgentSource,
    environment: process.env.NEXT_PUBLIC_MOGCIA_ENV === "test" ? "test" : "production",
    runId: runRef.id,
    projectId: input.projectId ?? null,
    targetUrl: `/agent?runId=${runRef.id}`,
    read: false,
    completed: false,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });

  return { requestId: requestRef.id, runId: runRef.id };
}

export async function updateAgentRun(runId: string, patch: Partial<Pick<AgentRun, "status" | "progress" | "requiresApproval" | "currentStep" | "errorMessage" | "steps" | "logs" | "changeSummary" | "reviewSummary" | "buildSummary" | "previewUrl">>): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, agentRunsCollection, runId), patch);
}

function createRunTitle(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 42 ? `${compact.slice(0, 42)}...` : compact;
}
