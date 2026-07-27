"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { draftToTaskPayload } from "@/lib/task-utils";
import type { MemberOption, Task, TaskDraft } from "@/types/task";

const TASKS_COLLECTION = "tasks";

function fallbackTimestamp(): Timestamp {
  return Timestamp.now();
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
    createdBy: String(data.createdBy ?? ""),
    createdByName: typeof data.createdByName === "string" ? data.createdByName : "",
    companyId: data.companyId ?? null,
    companyName: data.companyName ?? null,
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
    meetingId: data.meetingId ?? null,
    meetingTitle: data.meetingTitle ?? null,
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate : null,
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
    checklist: Array.isArray(data.checklist) ? data.checklist : [],
    comments: typeof data.comments === "string" ? data.comments : "",
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
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");

  await addDoc(collection(db, TASKS_COLLECTION), {
    ...draftToTaskPayload(draft, currentUser),
    createdBy: currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null
  });
}

export async function updateTask(taskId: string, draft: TaskDraft, currentUser: MemberOption): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");

  const statusPatch = draft.status === "completed" ? { completedAt: serverTimestamp() } : { completedAt: null };
  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    ...draftToTaskPayload(draft, currentUser),
    ...statusPatch,
    updatedAt: serverTimestamp()
  });
}

export async function setTaskCompleted(task: Task, completed: boolean): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");

  await updateDoc(doc(db, TASKS_COLLECTION, task.id), {
    status: completed ? "completed" : "todo",
    completedAt: completed ? serverTimestamp() : null,
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
    createdBy: currentUser.uid,
    createdByName: currentUser.name,
    companyId: task.companyId ?? null,
    companyName: task.companyName ?? null,
    projectId: task.projectId ?? null,
    projectName: task.projectName ?? null,
    meetingId: task.meetingId ?? null,
    meetingTitle: task.meetingTitle ?? null,
    dueDate: task.dueDate ?? null,
    checklist: task.checklist ?? [],
    comments: task.comments ?? "",
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
