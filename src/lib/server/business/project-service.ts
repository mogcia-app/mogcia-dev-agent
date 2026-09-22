import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";
import type { ProjectStatus, ProjectType } from "@/types/project";

const COLLECTION = "projects";
const types: ProjectType[] = ["client", "product", "internal"];
const statuses: ProjectStatus[] = ["planning", "active", "paused", "completed", "archived"];

export async function listProjects(auth: BusinessAuth) {
  const snapshot = await auth.db.collection(COLLECTION).orderBy("name", "asc").limit(1000).get();
  return snapshot.docs.map((entry) => serializeProject(entry.id, entry.data()));
}

export async function createProject(auth: BusinessAuth, body: Record<string, unknown>) {
  const name = requireString(body.name, "プロジェクト名");
  const companyId = nullableString(body.companyId, 160);
  const ref = await auth.db.collection(COLLECTION).add({
    name,
    type: normalizeType(body.type, companyId ? "client" : "internal"),
    status: "active",
    phase: optionalString(body.phase, 200),
    companyId,
    companyName: companyId ? nullableString(body.companyName, 300) : null,
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 300),
    description: optionalString(body.description, 5000),
    startDate: parseDate(body.startDate),
    targetDate: parseDate(body.targetDate),
    ...defaultBusinessFields(auth)
  });
  return { id: ref.id };
}

export async function updateProject(auth: BusinessAuth, body: Record<string, unknown>) {
  const id = requireString(body.id, "プロジェクトID", 160);
  const ref = auth.db.collection(COLLECTION).doc(id);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  const companyId = body.companyId !== undefined ? nullableString(body.companyId, 160) : previous.companyId ?? null;
  await ref.set({
    ...cleanPatchBody(body),
    ...(body.name !== undefined ? { name: requireString(body.name, "プロジェクト名") } : {}),
    ...(body.type !== undefined ? { type: normalizeType(body.type, previous.type) } : {}),
    ...(body.status !== undefined ? { status: normalizeStatus(body.status, previous.status) } : {}),
    ...(body.phase !== undefined ? { phase: optionalString(body.phase, 200) } : {}),
    ...(body.companyId !== undefined ? { companyId } : {}),
    ...(body.companyName !== undefined || body.companyId !== undefined ? { companyName: companyId ? nullableString(body.companyName, 300) : null } : {}),
    ...(body.productId !== undefined ? { productId: nullableString(body.productId, 160) } : {}),
    ...(body.productName !== undefined ? { productName: nullableString(body.productName, 300) } : {}),
    ...(body.description !== undefined ? { description: optionalString(body.description, 5000) } : {}),
    ...(body.startDate !== undefined ? { startDate: parseDate(body.startDate) } : {}),
    ...(body.targetDate !== undefined ? { targetDate: parseDate(body.targetDate) } : {}),
    id: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: auth.userId,
    updatedByName: auth.userName
  }, { merge: true });
  const next = await ref.get();
  return { project: serializeProject(next.id, next.data() ?? {}) };
}

export async function deleteProject(auth: BusinessAuth, id: string) {
  const ref = auth.db.collection(COLLECTION).doc(id);
  if (!(await ref.get()).exists) throw new BusinessApiError("NOT_FOUND", "プロジェクトが見つかりません。", 404);
  const tasks = await auth.db.collection("tasks").where("projectId", "==", id).get();
  const batch = auth.db.batch();
  tasks.docs.forEach((task) => batch.set(task.ref, { projectId: null, projectName: null, ...updateBusinessFields(auth) }, { merge: true }));
  batch.delete(ref);
  await batch.commit();
  return { id, deleted: true, unlinkedTasks: tasks.size };
}

function normalizeType(value: unknown, fallback: unknown = "internal"): ProjectType { return types.includes(value as ProjectType) ? value as ProjectType : types.includes(fallback as ProjectType) ? fallback as ProjectType : "internal"; }
function normalizeStatus(value: unknown, fallback: unknown = "planning"): ProjectStatus { return statuses.includes(value as ProjectStatus) ? value as ProjectStatus : statuses.includes(fallback as ProjectStatus) ? fallback as ProjectStatus : "planning"; }
function serializeProject(id: string, data: DocumentData) { return { ...serializeDoc(id, data), name: String(data.name ?? ""), type: normalizeType(data.type, data.companyId ? "client" : "internal"), status: normalizeStatus(data.status), phase: String(data.phase ?? ""), companyId: data.companyId ?? null, companyName: data.companyName ?? null, productId: data.productId ?? null, productName: data.productName ?? null, description: String(data.description ?? "") }; }
