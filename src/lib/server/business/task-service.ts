import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { timestampToIso } from "@/lib/desktop/format";
import { arrayOfStrings, assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";
import type { TaskPriority, TaskProgressLogType, TaskStatus } from "@/types/task";

const COLLECTION = "tasks";
const taskStatuses = ["todo", "in_progress", "waiting", "completed", "cancelled"] as const;
const priorities = ["high", "medium", "low"] as const;

export type TaskListOptions = {
  limit?: number;
  assigneeId?: string;
  includeCompleted?: boolean;
  from?: Date;
  to?: Date;
};

export async function listTasks(auth: BusinessAuth, options: TaskListOptions = {}) {
  const limit = options.limit ?? 500;
  const snapshot = options.assigneeId
    ? await auth.db.collection(COLLECTION).where("assigneeId", "==", options.assigneeId).limit(limit).get()
    : await auth.db.collection(COLLECTION).orderBy("createdAt", "desc").limit(limit).get();
  return snapshot.docs
    .map((entry): DocumentData => ({ id: entry.id, ...entry.data() }))
    .filter((task) => options.includeCompleted || (task.status !== "completed" && task.status !== "cancelled"))
    .filter((task) => {
      const due = timestampMillis(task.dueDate);
      if (options.from && due && due < options.from.getTime()) return false;
      if (options.to && due && due > options.to.getTime()) return false;
      return true;
    })
    .map((task) => serializeTask(String(task.id), task));
}

export async function listTodayActionTasks(auth: BusinessAuth, start: Date, end: Date) {
  const tasks = await listTasks(auth, { assigneeId: auth.userId, includeCompleted: false, limit: 500 });
  return tasks
    .filter((task) => {
      const due = timestampMillis(task.dueDate);
      return due > 0 && (due <= end.getTime() || due < start.getTime());
    })
    .sort((left, right) => {
      const leftDue = timestampMillis(left.dueDate) || Number.MAX_SAFE_INTEGER;
      const rightDue = timestampMillis(right.dueDate) || Number.MAX_SAFE_INTEGER;
      const leftOverdue = leftDue < start.getTime();
      const rightOverdue = rightDue < start.getTime();
      if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
      return priorityWeight(right.priority) - priorityWeight(left.priority) || leftDue - rightDue;
    });
}

export async function getTaskById(auth: BusinessAuth, taskId: string) {
  const snapshot = await auth.db.collection(COLLECTION).doc(taskId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "タスクが見つかりません。", 404);
  return serializeTask(snapshot.id, snapshot.data() ?? {});
}

export async function searchTasks(auth: BusinessAuth, query: string, options: TaskListOptions = {}) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];
  return (await listTasks(auth, { ...options, includeCompleted: options.includeCompleted ?? true }))
    .filter((task) => Object.values(task).some((value) => String(value ?? "").toLowerCase().includes(keyword)))
    .slice(0, options.limit ?? 20);
}

export async function createTask(auth: BusinessAuth, body: Record<string, unknown>) {
  const title = requireString(body.title, "タスクタイトル");
  const force = body.force === true;
  const dueDate = parseDate(body.dueDate);
  const companyId = nullableString(body.companyId, 160);
  const duplicates = await findTimeDuplicates(auth.db, COLLECTION, { title, companyId, dueDate: dueDate?.toDate() ?? null });
  if (duplicates.length && !force) return { id: null, taskId: null, requiresConfirmation: true, duplicates };
  const payload = await buildTaskPayload(auth, body, title, dueDate);
  const ref = await auth.db.collection(COLLECTION).add(payload);
  return { id: ref.id, taskId: ref.id, requiresConfirmation: false };
}

export async function updateTask(auth: BusinessAuth, body: Record<string, unknown>) {
  const taskId = requireString(body.id ?? body.taskId, "タスクID", 160);
  const ref = auth.db.collection(COLLECTION).doc(taskId);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  const status = normalizeTaskStatus(body.status, previous.status);
  const patch = {
    ...cleanPatchBody(body, ["action", "progressLogs"]),
    title: typeof body.title === "string" ? body.title.trim() : previous.title,
    description: optionalString(body.description ?? previous.description, 3000),
    status,
    priority: normalizeTaskPriority(body.priority, previous.priority),
    source: normalizeTaskSource(body.source, previous.source),
    aiGenerated: body.aiGenerated === undefined ? Boolean(previous.aiGenerated) : Boolean(body.aiGenerated),
    aiReason: optionalString(body.aiReason ?? previous.aiReason, 1000),
    sourceType: patchNullableString(body, previous, "sourceType", 80),
    sourceId: patchNullableString(body, previous, "sourceId", 160),
    assigneeId: patchNullableString(body, previous, "assigneeId", 160) ?? auth.userId,
    assigneeName: patchNullableString(body, previous, "assigneeName", 160) ?? auth.userName,
    collaboratorIds: body.collaboratorIds === undefined ? arrayOfStrings(previous.collaboratorIds) : arrayOfStrings(body.collaboratorIds),
    collaboratorNames: body.collaboratorNames === undefined ? arrayOfStrings(previous.collaboratorNames) : arrayOfStrings(body.collaboratorNames),
    companyId: patchNullableString(body, previous, "companyId", 160),
    companyName: patchNullableString(body, previous, "companyName", 200),
    leadId: patchNullableString(body, previous, "leadId", 160),
    leadName: patchNullableString(body, previous, "leadName", 200),
    productId: patchNullableString(body, previous, "productId", 160),
    productName: patchNullableString(body, previous, "productName", 200),
    projectId: patchNullableString(body, previous, "projectId", 160),
    projectName: patchNullableString(body, previous, "projectName", 200),
    meetingId: patchNullableString(body, previous, "meetingId", 160),
    meetingTitle: patchNullableString(body, previous, "meetingTitle", 200),
    dueDate: body.dueDate === undefined ? previous.dueDate ?? null : parseDate(body.dueDate),
    checklist: Array.isArray(body.checklist) ? body.checklist : Array.isArray(previous.checklist) ? previous.checklist : [],
    comments: optionalString(body.comments ?? previous.comments, 3000),
    progressLogs: body.progressLogs === undefined ? normalizeProgressLogs(previous.progressLogs, auth) : normalizeProgressLogs(body.progressLogs, auth),
    completedAt: status === "completed" ? previous.completedAt ?? FieldValue.serverTimestamp() : null,
    id: FieldValue.delete(),
    taskId: FieldValue.delete(),
    ...updateBusinessFields(auth)
  };
  await ref.set(patch, { merge: true });
  const next = await ref.get();
  return { task: serializeTask(next.id, next.data() ?? {}) };
}

export async function deleteTask(auth: BusinessAuth, taskId: string) {
  const ref = auth.db.collection(COLLECTION).doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "タスクが見つかりません。", 404);
  await ref.delete();
  return { id: taskId, deleted: true };
}

export async function completeTask(auth: BusinessAuth, taskId: string) {
  return changeTaskStatus(auth, taskId, "completed", "タスクを完了しました", "completed");
}

export async function reopenTask(auth: BusinessAuth, taskId: string) {
  return changeTaskStatus(auth, taskId, "todo", "未完了に戻しました", "reopened");
}

export async function changeTaskDueDate(auth: BusinessAuth, taskId: string, dueDate: unknown) {
  return updateTask(auth, { id: taskId, dueDate });
}

export async function changeTaskPriority(auth: BusinessAuth, taskId: string, priority: unknown) {
  return updateTask(auth, { id: taskId, priority });
}

export function serializeTask(id: string, data: DocumentData): DocumentData {
  return {
    ...serializeDoc(id, data),
    status: normalizeTaskStatus(data.status, "todo"),
    priority: normalizeTaskPriority(data.priority, "medium")
  };
}

export function toDesktopTaskPayload(task: DocumentData) {
  return {
    id: task.id,
    title: String(task.title ?? ""),
    description: typeof task.description === "string" ? task.description : "",
    status: String(task.status ?? "todo"),
    priority: String(task.priority ?? "medium"),
    source: String(task.source ?? "manual"),
    companyId: task.companyId ?? null,
    companyName: task.companyName ?? null,
    dueDate: isoDate(task.dueDate)
  };
}

export function normalizeTaskStatus(value: unknown, fallback: unknown = "todo"): TaskStatus {
  if (taskStatuses.includes(value as TaskStatus)) return value as TaskStatus;
  if (taskStatuses.includes(fallback as TaskStatus)) return fallback as TaskStatus;
  return "todo";
}

export function normalizeTaskPriority(value: unknown, fallback: unknown = "medium"): TaskPriority {
  if (priorities.includes(value as TaskPriority)) return value as TaskPriority;
  if (priorities.includes(fallback as TaskPriority)) return fallback as TaskPriority;
  return "medium";
}

async function buildTaskPayload(auth: BusinessAuth, body: Record<string, unknown>, title: string, dueDate: Timestamp | null) {
  const companyId = nullableString(body.companyId, 160);
  const companySnapshot = companyId ? await auth.db.collection("companies").doc(companyId).get() : null;
  if (companyId && !companySnapshot?.exists) throw new BusinessApiError("NOT_FOUND", "会社が見つかりません。", 404);
  const status = normalizeTaskStatus(body.status, "todo");
  return {
    title,
    description: optionalString(body.description, 3000),
    status,
    priority: normalizeTaskPriority(body.priority, "medium"),
    source: normalizeTaskSource(body.source, "manual"),
    aiGenerated: Boolean(body.aiGenerated),
    aiReason: optionalString(body.aiReason, 1000),
    sourceType: nullableString(body.sourceType, 80),
    sourceId: nullableString(body.sourceId, 160),
    assigneeId: nullableString(body.assigneeId, 160) ?? auth.userId,
    assigneeName: nullableString(body.assigneeName, 160) ?? auth.userName,
    collaboratorIds: arrayOfStrings(body.collaboratorIds),
    collaboratorNames: arrayOfStrings(body.collaboratorNames),
    companyId,
    companyName: companySnapshot?.data()?.name ?? nullableString(body.companyName, 200),
    leadId: nullableString(body.leadId, 160),
    leadName: nullableString(body.leadName, 200),
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 200),
    projectId: nullableString(body.projectId, 160),
    projectName: nullableString(body.projectName, 200),
    meetingId: nullableString(body.meetingId, 160),
    meetingTitle: nullableString(body.meetingTitle, 200),
    dueDate,
    completedAt: status === "completed" ? FieldValue.serverTimestamp() : null,
    checklist: Array.isArray(body.checklist) ? body.checklist : [],
    comments: optionalString(body.comments, 3000),
    progressLogs: normalizeProgressLogs(body.progressLogs, auth),
    ...defaultBusinessFields(auth)
  };
}

async function changeTaskStatus(auth: BusinessAuth, taskId: string, status: TaskStatus, title: string, logType: TaskProgressLogType) {
  const current = await getTaskById(auth, taskId);
  return updateTask(auth, {
    id: taskId,
    status,
    progressLogs: [
      ...normalizeProgressLogs(current.progressLogs, auth),
      createProgressLog(auth, logType, title)
    ]
  });
}

function normalizeProgressLogs(value: unknown, auth: BusinessAuth) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const data = entry as Record<string, unknown>;
    return [{
      id: typeof data.id === "string" && data.id.trim() ? data.id : `log-${crypto.randomUUID()}`,
      type: normalizeProgressLogType(data.type),
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 200) : "進捗更新",
      content: typeof data.content === "string" ? data.content.trim().slice(0, 3000) : "",
      userId: typeof data.userId === "string" && data.userId.trim() ? data.userId : auth.userId,
      userName: typeof data.userName === "string" && data.userName.trim() ? data.userName : auth.userName,
      createdAt: parseDate(data.createdAt) ?? Timestamp.now()
    }];
  });
}

function createProgressLog(auth: BusinessAuth, type: TaskProgressLogType, title: string) {
  return {
    id: `log-${crypto.randomUUID()}`,
    type,
    title,
    content: "",
    userId: auth.userId,
    userName: auth.userName,
    createdAt: Timestamp.now()
  };
}

function normalizeProgressLogType(value: unknown): TaskProgressLogType {
  return value === "created" || value === "progress" || value === "status" || value === "assignee" || value === "completed" || value === "reopened" ? value : "progress";
}

function normalizeTaskSource(value: unknown, fallback: unknown) {
  if (value === "ai" || value === "automation" || value === "manual") return value;
  if (fallback === "ai" || fallback === "automation" || fallback === "manual") return fallback;
  return "manual";
}

function patchNullableString(body: Record<string, unknown>, previous: Record<string, unknown>, key: string, maxLength: number) {
  return body[key] === undefined ? nullableString(previous[key], maxLength) : nullableString(body[key], maxLength);
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return date.getTime();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

function isoDate(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return timestampToIso(value);
}

function priorityWeight(priority: unknown): number {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}
