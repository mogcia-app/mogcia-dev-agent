import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { BusinessApiError, optionalString, requireString, type BusinessAuth } from "@/lib/server/business/api";

const COLLECTION = "userMemos";

export async function listMemos(auth: BusinessAuth) {
  const snapshot = await auth.db.collection(COLLECTION).where("createdBy", "==", auth.userId).limit(500).get();
  return snapshot.docs.map((entry) => record(entry.id, entry.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createMemo(auth: BusinessAuth, body: Record<string, unknown>) {
  const ref = await auth.db.collection(COLLECTION).add({ title: optionalString(body.title, 200) || "無題のメモ", content: optionalString(body.content, 100000), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: auth.userId, updatedBy: auth.userId });
  return { id: ref.id };
}

export async function updateMemo(auth: BusinessAuth, body: Record<string, unknown>) {
  const id = requireString(body.id, "メモID", 160); const ref = auth.db.collection(COLLECTION).doc(id); const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.createdBy !== auth.userId) throw new BusinessApiError("NOT_FOUND", "メモが見つかりません。", 404);
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.userId };
  if (body.title !== undefined) patch.title = requireString(body.title, "タイトル", 200);
  if (body.content !== undefined) patch.content = optionalString(body.content, 100000);
  await ref.set(patch, { merge: true }); return { ok: true as const };
}

export async function deleteMemo(auth: BusinessAuth, body: Record<string, unknown>) {
  const id = requireString(body.id, "メモID", 160); const ref = auth.db.collection(COLLECTION).doc(id); const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.createdBy !== auth.userId) throw new BusinessApiError("NOT_FOUND", "メモが見つかりません。", 404);
  await ref.delete(); return { ok: true as const };
}

function record(id: string, data: DocumentData) { const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : new Date(0).toISOString(); return { id, title: String(data.title ?? ""), content: String(data.content ?? ""), createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) }; }
