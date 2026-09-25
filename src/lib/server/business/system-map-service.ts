import "server-only";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { BusinessApiError, optionalString, requireString, type BusinessAuth } from "@/lib/server/business/api";
import type { SystemMapCellStatus } from "@/types/system-map";

const MAPS = "systemMaps";
// Existing node documents are intentionally retained and interpreted as cells.
const CELLS = "systemMapNodes";
const statuses: SystemMapCellStatus[] = ["not_started", "considering", "in_progress", "reviewing", "confirmed", "on_hold"];

export async function listSystemMaps(auth: BusinessAuth) {
  const [maps, cells] = await Promise.all([auth.db.collection(MAPS).orderBy("updatedAt", "desc").limit(500).get(), auth.db.collection(CELLS).limit(2000).get()]);
  return { maps: maps.docs.map((entry) => mapRecord(entry.id, entry.data())), cells: cells.docs.map((entry) => cellRecord(entry.id, entry.data())) };
}

export async function createSystemMapEntity(auth: BusinessAuth, body: Record<string, unknown>) {
  if (body.entity === "cell") return createCell(auth, body);
  const projectId = requireString(body.projectId, "プロジェクト", 160);
  const project = await auth.db.collection("projects").doc(projectId).get();
  if (!project.exists) throw new BusinessApiError("NOT_FOUND", "プロジェクトが見つかりません。", 404);
  const duplicate = await auth.db.collection(MAPS).where("projectId", "==", projectId).limit(1).get();
  if (!duplicate.empty) throw new BusinessApiError("DUPLICATE", "このプロジェクトのマップは作成済みです。", 409);
  const projectData = project.data() ?? {};
  const ref = await auth.db.collection(MAPS).add({ projectId, title: optionalString(body.title, 200) || String(projectData.name ?? "無題のプロジェクト"), description: optionalString(body.description, 3000) || String(projectData.description ?? ""), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: auth.userId, updatedBy: auth.userId });
  return { id: ref.id };
}

async function createCell(auth: BusinessAuth, body: Record<string, unknown>) {
  const mapId = requireString(body.mapId, "マップID", 160); await assertMap(auth, mapId);
  const ref = await auth.db.collection(CELLS).add({ mapId, title: requireString(body.title, "セル名", 200), content: "", x: integer(body.x, 0, 11, 0), y: integer(body.y, 0, 200, 0), width: 4, height: 3, status: null, tags: [], includeInProgress: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: auth.userId, updatedBy: auth.userId });
  await touchMap(auth, mapId); return { id: ref.id };
}

export async function updateSystemMapEntity(auth: BusinessAuth, body: Record<string, unknown>) {
  const id = requireString(body.id, "ID", 160);
  if (body.entity === "cell") {
    const ref = auth.db.collection(CELLS).doc(id); const snapshot = await ref.get();
    if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "セルが見つかりません。", 404);
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.userId };
    if (body.title !== undefined) patch.title = requireString(body.title, "セル名", 200);
    if (body.content !== undefined) patch.content = optionalString(body.content, 30000);
    if (body.x !== undefined) patch.x = integer(body.x, 0, 11, 0);
    if (body.y !== undefined) patch.y = integer(body.y, 0, 200, 0);
    if (body.width !== undefined) patch.width = integer(body.width, 2, 12, 4);
    if (body.height !== undefined) patch.height = integer(body.height, 2, 20, 3);
    if (body.status !== undefined) patch.status = body.status === null || body.status === "" ? null : statuses.includes(body.status as SystemMapCellStatus) ? body.status : null;
    if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 20) : [];
    if (body.includeInProgress !== undefined) patch.includeInProgress = body.includeInProgress === true;
    await ref.set(patch, { merge: true }); await touchMap(auth, String(snapshot.data()?.mapId ?? "")); return { ok: true as const };
  }
  const ref = auth.db.collection(MAPS).doc(id); if (!(await ref.get()).exists) throw new BusinessApiError("NOT_FOUND", "マップが見つかりません。", 404);
  await ref.set({ ...(body.title !== undefined ? { title: requireString(body.title, "マップ名", 200) } : {}), ...(body.description !== undefined ? { description: optionalString(body.description, 3000) } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.userId }, { merge: true });
  return { ok: true as const };
}

export async function deleteSystemMapEntity(auth: BusinessAuth, body: Record<string, unknown>) {
  if (body.entity !== "cell") throw new BusinessApiError("VALIDATION_ERROR", "削除対象が不正です。", 400);
  const id = requireString(body.id, "ID", 160); const snapshot = await auth.db.collection(CELLS).doc(id).get();
  await snapshot.ref.delete(); if (snapshot.exists) await touchMap(auth, String(snapshot.data()?.mapId ?? "")); return { ok: true as const };
}

async function assertMap(auth: BusinessAuth, mapId: string) { if (!(await auth.db.collection(MAPS).doc(mapId).get()).exists) throw new BusinessApiError("NOT_FOUND", "マップが見つかりません。", 404); }
async function touchMap(auth: BusinessAuth, mapId: string) { if (mapId) await auth.db.collection(MAPS).doc(mapId).set({ updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.userId }, { merge: true }); }
function integer(value: unknown, min: number, max: number, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback; }
function iso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : new Date(0).toISOString(); }
function legacyStatus(value: unknown): SystemMapCellStatus | null { const map: Record<string, SystemMapCellStatus> = { designing: "considering", implementing: "in_progress", completed: "confirmed" }; return statuses.includes(value as SystemMapCellStatus) ? value as SystemMapCellStatus : map[String(value)] ?? null; }
function mapRecord(id: string, data: DocumentData) { return { id, projectId: String(data.projectId ?? ""), title: String(data.title ?? ""), description: String(data.description ?? ""), createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) }; }
function cellRecord(id: string, data: DocumentData) {
  const x = data.x === undefined ? Math.max(0, Math.min(11, Math.round(Number(data.positionX ?? 0) / 100))) : integer(data.x, 0, 11, 0);
  const y = data.y === undefined ? Math.max(0, Math.round(Number(data.positionY ?? 0) / 72)) : integer(data.y, 0, 200, 0);
  return { id, mapId: String(data.mapId ?? ""), title: String(data.title ?? ""), content: String(data.content ?? data.memo ?? data.description ?? ""), x, y, width: integer(data.width, 2, 12, 4), height: integer(data.height, 2, 20, 3), status: legacyStatus(data.status), tags: Array.isArray(data.tags) ? data.tags.map(String) : [], includeInProgress: data.includeInProgress === true, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) };
}
