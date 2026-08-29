"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { businessApi, toJsonBody } from "@/lib/business-api-client";
import { draftToTaskPayload } from "@/lib/task-utils";
import type { MemberOption, Task, TaskDraft, TaskProgressLog, TaskProgressLogType } from "@/types/task";

const TASKS_COLLECTION = "tasks";

function fallbackTimestamp(): Timestamp {
  return Timestamp.now();
}

function normalizeProgressLogs(value: unknown): TaskProgressLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const data = entry as Record<string, unknown>;
      return [{
        id: typeof data.id === "string" ? data.id : `log-${crypto.randomUUID()}`,
        type: isProgressLogType(data.type) ? data.type : "progress",
        title: typeof data.title === "string" ? data.title : "進捗更新",
        content: typeof data.content === "string" ? data.content : "",
        userId: typeof data.userId === "string" ? data.userId : "",
        userName: typeof data.userName === "string" ? data.userName : "未設定",
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt : fallbackTimestamp()
      }];
    });
}

function isProgressLogType(value: unknown): value is TaskProgressLogType {
  return value === "created" || value === "progress" || value === "status" || value === "assignee" || value === "completed" || value === "reopened";
}

function createProgressLog(type: TaskProgressLogType, title: string, currentUser: MemberOption, content = ""): TaskProgressLog {
  return {
    id: `log-${crypto.randomUUID()}`,
    type,
    title,
    content,
    userId: currentUser.id,
    userName: currentUser.name,
    createdAt: Timestamp.now()
  };
}

function normalizeTask(id: string, data: DocumentData): Task {
  return {
    id,
    title: String(data.title ?? ""),
    description: typeof data.description === "string" ? data.description : "",
    status: data.status === "completed" || data.status === "in_progress" || data.status === "waiting" || data.status === "cancelled" ? data.status : "todo",
    priority: data.priority === "high" || data.priority === "low" ? data.priority : "medium",
    source: data.source === "ai" || data.source === "automation" ? data.source : "manual",
    aiGenerated: Boolean(data.aiGenerated),
    aiReason: typeof data.aiReason === "string" ? data.aiReason : "",
    sourceType: data.sourceType,
    sourceId: data.sourceId ?? null,
    assigneeId: String(data.assigneeId ?? ""),
    assigneeName: typeof data.assigneeName === "string" ? data.assigneeName : "",
    collaboratorIds: Array.isArray(data.collaboratorIds) ? data.collaboratorIds.filter((value) => typeof value === "string") : [],
    collaboratorNames: Array.isArray(data.collaboratorNames) ? data.collaboratorNames.filter((value) => typeof value === "string") : [],
    createdBy: String(data.createdBy ?? ""),
    createdByName: typeof data.createdByName === "string" ? data.createdByName : "",
    companyId: data.companyId ?? null,
    companyName: data.companyName ?? null,
    leadId: data.leadId ?? null,
    leadName: data.leadName ?? null,
    productId: data.productId ?? null,
    productName: data.productName ?? null,
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
    meetingId: data.meetingId ?? null,
    meetingTitle: data.meetingTitle ?? null,
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate : null,
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
    checklist: [],
    comments: typeof data.comments === "string" ? data.comments : "",
    progressLogs: normalizeProgressLogs(data.progressLogs),
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : fallbackTimestamp(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : fallbackTimestamp()
  };
}

export function subscribeTasks(onNext: (tasks: Task[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;

  const tasksQuery = query(collection(db, TASKS_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    tasksQuery,
    (snapshot) => {
      onNext(snapshot.docs.map((entry) => normalizeTask(entry.id, entry.data())));
    },
    onError
  );
}

export async function createTask(draft: TaskDraft, currentUser: MemberOption & { uid: string }): Promise<void> {
  const progressLogs = [
    createProgressLog("created", "タスクを作成しました", currentUser),
    ...(draft.assigneeId && draft.assigneeId !== currentUser.uid ? [createProgressLog("assignee", `${draft.assigneeName || "選択したメンバー"}さんに依頼しました`, currentUser)] : []),
    ...(draft.comments.trim() ? [createProgressLog("progress", "進捗状況を追加しました", currentUser, draft.comments.trim())] : [])
  ];

  const result = await businessApi<{ id: string; taskId?: string }>("/api/business/tasks", {
    method: "POST",
    body: toJsonBody({
      ...draftToTaskPayload(draft, currentUser),
      createdBy: currentUser.uid,
      progressLogs,
      completedAt: null
    })
  });
  const taskId = result.taskId ?? result.id;

  if (draft.assigneeId && draft.assigneeId !== currentUser.uid) {
    await notifyTaskAssignee({
      taskId,
      taskTitle: draft.title.trim(),
      taskDescription: draft.description.trim(),
      assigneeId: draft.assigneeId,
      assigneeName: draft.assigneeName,
      actorName: currentUser.name,
      companyName: draft.companyName,
      productName: draft.productName,
      dueDate: draft.dueDate,
      dueTime: draft.dueTime,
      reason: "created"
    });
  }
}

export async function updateTask(taskId: string, draft: TaskDraft, currentUser: MemberOption): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");

  const taskRef = doc(db, TASKS_COLLECTION, taskId);
  const snapshot = await getDoc(taskRef);
  const currentData = snapshot.exists() ? snapshot.data() : {};
  const progressLogs = normalizeProgressLogs(currentData.progressLogs);
  const previousComments = typeof currentData.comments === "string" ? currentData.comments.trim() : "";
  const previousStatus = typeof currentData.status === "string" ? currentData.status : "";
  const previousAssigneeId = typeof currentData.assigneeId === "string" ? currentData.assigneeId : "";
  const nextLogs = [...progressLogs];
  const nextComments = draft.comments.trim();

  if (nextComments && nextComments !== previousComments) {
    nextLogs.push(createProgressLog("progress", "進捗状況を更新しました", currentUser, nextComments));
  }
  if (draft.assigneeId && draft.assigneeId !== previousAssigneeId) {
    nextLogs.push(createProgressLog("assignee", `${draft.assigneeName || "選択したメンバー"}さんへ担当を変更しました`, currentUser));
  }
  if (draft.status !== previousStatus) {
    const statusTitle = draft.status === "completed" ? "タスクを完了しました" : "ステータスを更新しました";
    nextLogs.push(createProgressLog(draft.status === "completed" ? "completed" : "status", statusTitle, currentUser, statusLabel(draft.status)));
  }

  await businessApi<{ task: Task }>("/api/business/tasks", {
    method: "PATCH",
    body: toJsonBody({
      ...draftToTaskPayload(draft, currentUser),
      id: taskId,
      progressLogs: nextLogs,
      completedAt: draft.status === "completed" ? Timestamp.now() : null
    })
  });

  if (draft.assigneeId && draft.assigneeId !== previousAssigneeId) {
    await notifyTaskAssignee({
      taskId,
      taskTitle: draft.title.trim(),
      taskDescription: draft.description.trim(),
      assigneeId: draft.assigneeId,
      assigneeName: draft.assigneeName,
      actorName: currentUser.name,
      companyName: draft.companyName,
      productName: draft.productName,
      dueDate: draft.dueDate,
      dueTime: draft.dueTime,
      reason: "reassigned"
    });
  }
}

export async function setTaskCompleted(task: Task, completed: boolean): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");

  await updateDoc(doc(db, TASKS_COLLECTION, task.id), {
    status: completed ? "completed" : "todo",
    completedAt: completed ? serverTimestamp() : null,
    progressLogs: [
      ...(task.progressLogs ?? []),
      createProgressLog(completed ? "completed" : "reopened", completed ? "タスクを完了しました" : "未完了に戻しました", { id: task.assigneeId, name: task.assigneeName || "担当者" })
    ],
    updatedAt: serverTimestamp()
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await deleteDoc(doc(db, TASKS_COLLECTION, taskId));
}

export async function duplicateTask(task: Task, currentUser: MemberOption & { uid: string }): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");

  await addDoc(collection(db, TASKS_COLLECTION), {
    title: `${task.title} のコピー`,
    description: task.description ?? "",
    status: "todo",
    priority: task.priority,
    source: task.source,
    aiGenerated: task.aiGenerated,
    aiReason: task.aiReason ?? "",
    sourceType: task.sourceType ?? null,
    sourceId: task.sourceId ?? null,
    assigneeId: currentUser.uid,
    assigneeName: currentUser.name,
    collaboratorIds: [],
    collaboratorNames: [],
    createdBy: currentUser.uid,
    createdByName: currentUser.name,
    companyId: task.companyId ?? null,
    companyName: task.companyName ?? null,
    leadId: task.leadId ?? null,
    leadName: task.leadName ?? null,
    productId: task.productId ?? null,
    productName: task.productName ?? null,
    projectId: task.projectId ?? null,
    projectName: task.projectName ?? null,
    meetingId: task.meetingId ?? null,
    meetingTitle: task.meetingTitle ?? null,
    dueDate: task.dueDate ?? null,
    checklist: task.checklist ?? [],
    comments: task.comments ?? "",
    progressLogs: [createProgressLog("created", "コピーとしてタスクを作成しました", currentUser)],
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function statusLabel(status: Task["status"]): string {
  if (status === "todo") return "未着手";
  if (status === "in_progress") return "進行中";
  if (status === "waiting") return "待機中";
  if (status === "completed") return "完了";
  return "キャンセル";
}

async function notifyTaskAssignee(input: {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  assigneeId: string;
  assigneeName: string;
  actorName: string;
  companyName: string;
  productName: string;
  dueDate: string;
  dueTime: string;
  reason: "created" | "reassigned";
}): Promise<void> {
  const token = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!token) return;

  try {
    const response = await fetch("/api/tasks/assignment-notification", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const result = await response.json().catch(() => null) as { sent?: boolean; skipped?: boolean; reason?: string; error?: string } | null;
    if (!response.ok || !result?.sent) {
      console.warn("Task assignment notification was not sent.", {
        status: response.status,
        reason: result?.reason,
        error: result?.error,
        skipped: result?.skipped
      });
    }
  } catch (error) {
    console.warn("Failed to send task assignment notification.", error);
  }
}
