import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { optionalString, type BusinessAuth } from "@/lib/server/business/api";
import type { HomeQuickTodo, HomeWorkspace } from "@/types/home";

const COLLECTION = "homeWorkspaces";

export async function getHomeWorkspace(auth: BusinessAuth): Promise<HomeWorkspace> {
  const snapshot = await auth.db.collection(COLLECTION).doc(auth.userId).get();
  const data = snapshot.data() ?? {};
  return {
    currentWork: String(data.currentWork ?? ""),
    remember: String(data.remember ?? ""),
    todos: normalizeTodos(data.todos),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : null
  };
}

export async function updateHomeWorkspace(auth: BusinessAuth, body: Record<string, unknown>): Promise<HomeWorkspace> {
  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: auth.userId,
    updatedByName: auth.userName
  };
  if (body.currentWork !== undefined) patch.currentWork = optionalString(body.currentWork, 20_000);
  if (body.remember !== undefined) patch.remember = optionalString(body.remember, 20_000);
  if (body.todos !== undefined) patch.todos = normalizeTodos(body.todos);
  await auth.db.collection(COLLECTION).doc(auth.userId).set(patch, { merge: true });
  return getHomeWorkspace(auth);
}

function normalizeTodos(value: unknown): HomeQuickTodo[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content.trim().slice(0, 500) : "";
    if (!content) return [];
    return [{
      id: typeof record.id === "string" && record.id ? record.id.slice(0, 100) : crypto.randomUUID(),
      content,
      dueDate: typeof record.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.dueDate) ? record.dueDate : null,
      completed: record.completed === true
    }];
  });
}
