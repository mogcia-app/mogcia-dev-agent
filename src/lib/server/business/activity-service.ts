import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { timestampToIso } from "@/lib/desktop/format";
import { assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";
import { getCompanyById, updateCompanyProfile } from "@/lib/server/business/company-service";
import { normalizeLeadStatus, updateLeadAfterActivity } from "@/lib/server/business/lead-service";
import type { ActivityType } from "@/types/lead";

const COLLECTION = "activities";
const activityTypes = ["call", "email", "document", "meeting", "telemarketing", "note", "status_change", "other"] as const;
const legacyActivityTypes = ["phone", "email", "chat", "visit", "meeting", "deal", "memo", "task_created", "task_completed", "file", "status_change", "ai_task", "other"] as const;

type ActivityListOptions = {
  limit?: number;
  companyId?: string | null;
  leadId?: string | null;
  includeLegacy?: boolean;
};

export type LegacyActivityLogType = (typeof legacyActivityTypes)[number];

export async function listActivities(auth: BusinessAuth, options: ActivityListOptions = {}) {
  let query: FirebaseFirestore.Query = auth.db.collection(COLLECTION);
  if (options.leadId) query = query.where("leadId", "==", options.leadId);
  if (options.companyId) query = query.where("companyId", "==", options.companyId);
  const snapshot = await query.orderBy("occurredAt", "desc").limit(options.limit ?? 500).get();
  const canonical = snapshot.docs.map((entry) => serializeActivity(entry.id, entry.data()));
  if (!options.includeLegacy || !options.companyId) return canonical;
  const legacy = await listLegacyOnlyCompanyLogs(auth, options.companyId, options.limit ?? 500, canonical);
  return [...canonical, ...legacy].sort(compareActivityDesc).slice(0, options.limit ?? 500);
}

export async function searchActivities(auth: BusinessAuth, queryText: string, options: ActivityListOptions = {}) {
  const keyword = queryText.trim().toLowerCase();
  if (!keyword) return [];
  return (await listActivities(auth, { ...options, limit: Math.max(options.limit ?? 20, 200) }))
    .filter((activity) => matchesActivity(activity, keyword))
    .slice(0, options.limit ?? 20);
}

export async function getActivityById(auth: BusinessAuth, activityId: string) {
  const snapshot = await auth.db.collection(COLLECTION).doc(activityId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "活動ログが見つかりません。", 404);
  return serializeActivity(snapshot.id, snapshot.data() ?? {});
}

export async function listActivitiesByCompanyId(auth: BusinessAuth, companyId: string, options: ActivityListOptions = {}) {
  return listActivities(auth, { ...options, companyId });
}

export async function listActivitiesByLeadId(auth: BusinessAuth, leadId: string, options: ActivityListOptions = {}) {
  return listActivities(auth, { ...options, leadId });
}

export async function createActivity(auth: BusinessAuth, body: Record<string, unknown>) {
  const title = requireString(body.title, "活動タイトル");
  const occurredAt = timestampFrom(body.occurredAt) ?? Timestamp.now();
  const force = body.force === true;
  const duplicates = await findTimeDuplicates(auth.db, COLLECTION, {
    title,
    companyId: nullableString(body.companyId, 160),
    occurredAt: occurredAt.toDate()
  });
  if (duplicates.length && !force) return { id: null, activityId: null, activityLogId: null, requiresConfirmation: true, duplicates };

  const payload = await buildActivityPayload(auth, body, title, occurredAt);
  const activityRef = auth.db.collection(COLLECTION).doc();
  const companyId = nullableString(payload.companyId, 160);
  const legacyId = nullableString(body.legacyCompanyActivityLogId, 160);
  const mirrorRef = companyId ? (legacyId ? auth.db.collection("companies").doc(companyId).collection("activityLogs").doc(legacyId) : auth.db.collection("companies").doc(companyId).collection("activityLogs").doc()) : null;
  const batch = auth.db.batch();
  batch.set(activityRef, {
    ...payload,
    ...(mirrorRef ? { legacyCompanyActivityLogId: mirrorRef.id } : {})
  });
  if (mirrorRef && companyId) batch.set(mirrorRef, buildLegacyMirrorPayload(auth, companyId, { ...payload, id: activityRef.id }, mirrorRef.id));
  await batch.commit();
  await updateRelatedRecords(auth, { ...payload, id: activityRef.id, legacyCompanyActivityLogId: mirrorRef?.id ?? null });
  return { id: activityRef.id, activityId: activityRef.id, activityLogId: mirrorRef?.id ?? null, requiresConfirmation: false };
}

export async function updateActivity(auth: BusinessAuth, body: Record<string, unknown>) {
  const activityId = requireString(body.id ?? body.activityId, "活動ログID", 160);
  const ref = auth.db.collection(COLLECTION).doc(activityId);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  const payload = await buildActivityUpdatePayload(auth, body, previous);
  await ref.set(payload, { merge: true });
  const nextSnapshot = await ref.get();
  const next = serializeActivity(nextSnapshot.id, nextSnapshot.data() ?? {});
  await syncLegacyMirror(auth, activityId, next);
  await updateRelatedRecords(auth, next);
  return { activity: next };
}

export async function deleteActivity(auth: BusinessAuth, activityId: string) {
  const activity = await getActivityById(auth, activityId);
  await deleteLegacyMirror(auth, activityId, activity);
  await auth.db.collection(COLLECTION).doc(activityId).delete();
  return { id: activityId, deleted: true };
}

export async function changeActivityType(auth: BusinessAuth, activityId: string, type: unknown) {
  return updateActivity(auth, { id: activityId, type });
}

export function normalizeActivityType(value: unknown, fallback: unknown = "note"): ActivityType {
  if (activityTypes.includes(value as ActivityType)) return value as ActivityType;
  const legacy = normalizeLegacyActivityType(value, null);
  if (legacy) return legacyToCommonActivityType(legacy);
  if (activityTypes.includes(fallback as ActivityType)) return fallback as ActivityType;
  return "note";
}

export function normalizeLegacyActivityType(value: unknown, fallback: LegacyActivityLogType | null = "other"): LegacyActivityLogType {
  if (legacyActivityTypes.includes(value as LegacyActivityLogType)) return value as LegacyActivityLogType;
  if (fallback && legacyActivityTypes.includes(fallback)) return fallback;
  return "other";
}

export async function buildActivityPayload(auth: BusinessAuth, body: Record<string, unknown>, title = requireString(body.title, "活動タイトル"), occurredAt = timestampFrom(body.occurredAt) ?? Timestamp.now()) {
  const companyId = nullableString(body.companyId, 160);
  const company = companyId ? await getCompanyById(auth, companyId).catch(() => null) : null;
  const companyName = nullableString(body.companyName, 200) ?? nullableString(company?.name, 200);
  const legacyType = legacyActivityTypes.includes((body.activityType ?? body.legacyType) as LegacyActivityLogType) ? body.activityType ?? body.legacyType : null;
  const type = normalizeActivityType(body.type ?? legacyType);
  return {
    leadId: nullableString(body.leadId, 160),
    companyId,
    companyName,
    dealId: nullableString(body.dealId, 160),
    type,
    activityType: legacyType ?? commonToLegacyActivityType(type),
    title,
    content: optionalString(body.content ?? body.description, 10000),
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 200),
    audioId: nullableString(body.audioId, 160),
    transcriptId: nullableString(body.transcriptId, 160),
    analysisId: nullableString(body.analysisId, 160),
    legacyCompanyActivityLogId: nullableString(body.legacyCompanyActivityLogId, 160),
    leadStatus: body.leadStatus ? normalizeLeadStatus(body.leadStatus) : null,
    nextActionAt: timestampFrom(body.nextActionAt),
    nextActionTitle: nullableString(body.nextActionTitle, 200),
    occurredAt,
    ...defaultBusinessFields(auth)
  };
}

export function serializeActivity(id: string, data: DocumentData): DocumentData {
  const legacyType = legacyActivityTypes.includes(data.activityType as LegacyActivityLogType) ? data.activityType : commonToLegacyActivityType(data.type);
  return {
    ...serializeDoc(id, data),
    type: normalizeActivityType(data.type),
    activityType: legacyType,
    leadId: nullableString(data.leadId, 160),
    companyId: nullableString(data.companyId, 160),
    companyName: nullableString(data.companyName, 200),
    productId: nullableString(data.productId, 160),
    productName: nullableString(data.productName, 200),
    leadStatus: data.leadStatus ? normalizeLeadStatus(data.leadStatus) : null,
    nextActionTitle: nullableString(data.nextActionTitle, 200),
    legacyCompanyActivityLogId: nullableString(data.legacyCompanyActivityLogId, 160)
  };
}

export function toDesktopActivityPayload(activity: DocumentData) {
  return {
    id: String(activity.id ?? ""),
    title: String(activity.title ?? ""),
    content: String(activity.content ?? ""),
    type: String(activity.type ?? "note"),
    activityType: String(activity.activityType ?? commonToLegacyActivityType(activity.type)),
    companyId: activity.companyId ?? null,
    companyName: activity.companyName ?? null,
    leadId: activity.leadId ?? null,
    productName: activity.productName ?? null,
    occurredAt: timestampToIso(activity.occurredAt),
    nextActionTitle: activity.nextActionTitle ?? null,
    nextActionAt: timestampToIso(activity.nextActionAt)
  };
}

async function buildActivityUpdatePayload(auth: BusinessAuth, body: Record<string, unknown>, previous: DocumentData) {
  const nextType = body.type !== undefined || body.activityType !== undefined ? normalizeActivityType(body.type ?? body.activityType, previous.type) : normalizeActivityType(previous.type);
  const legacyType = body.activityType !== undefined || body.type !== undefined ? normalizeLegacyActivityType(body.activityType ?? body.type, commonToLegacyActivityType(nextType)) : normalizeLegacyActivityType(previous.activityType ?? previous.type);
  const companyId = body.companyId !== undefined ? nullableString(body.companyId, 160) : nullableString(previous.companyId, 160);
  const company = companyId && (body.companyName !== undefined || !previous.companyName) ? await getCompanyById(auth, companyId).catch(() => null) : null;
  return {
    ...cleanPatchBody(body, ["action"]),
    ...(body.leadId !== undefined ? { leadId: nullableString(body.leadId, 160) } : {}),
    ...(body.companyId !== undefined ? { companyId } : {}),
    ...(body.companyName !== undefined || company ? { companyName: nullableString(body.companyName, 200) ?? nullableString(company?.name, 200) } : {}),
    ...(body.dealId !== undefined ? { dealId: nullableString(body.dealId, 160) } : {}),
    ...(body.type !== undefined || body.activityType !== undefined ? { type: nextType, activityType: legacyType } : {}),
    ...(body.title !== undefined ? { title: requireString(body.title, "活動タイトル") } : {}),
    ...(body.content !== undefined || body.description !== undefined ? { content: optionalString(body.content ?? body.description, 10000) } : {}),
    ...(body.productId !== undefined ? { productId: nullableString(body.productId, 160) } : {}),
    ...(body.productName !== undefined ? { productName: nullableString(body.productName, 200) } : {}),
    ...(body.audioId !== undefined ? { audioId: nullableString(body.audioId, 160) } : {}),
    ...(body.transcriptId !== undefined ? { transcriptId: nullableString(body.transcriptId, 160) } : {}),
    ...(body.analysisId !== undefined ? { analysisId: nullableString(body.analysisId, 160) } : {}),
    ...(body.leadStatus !== undefined ? { leadStatus: body.leadStatus ? normalizeLeadStatus(body.leadStatus) : null } : {}),
    ...(body.nextActionAt !== undefined ? { nextActionAt: timestampFrom(body.nextActionAt) } : {}),
    ...(body.nextActionTitle !== undefined ? { nextActionTitle: nullableString(body.nextActionTitle, 200) } : {}),
    ...(body.occurredAt !== undefined ? { occurredAt: timestampFrom(body.occurredAt) ?? previous.occurredAt ?? Timestamp.now() } : {}),
    id: FieldValue.delete(),
    activityId: FieldValue.delete(),
    ...updateBusinessFields(auth)
  };
}

async function updateRelatedRecords(auth: BusinessAuth, activity: DocumentData) {
  const occurredAt = timestampFrom(activity.occurredAt) ?? Timestamp.now();
  const nextActionAt = timestampFrom(activity.nextActionAt);
  const nextActionTitle = nullableString(activity.nextActionTitle, 200);
  const leadId = nullableString(activity.leadId, 160);
  const companyId = nullableString(activity.companyId, 160);
  if (leadId) await updateLeadAfterActivity(auth, leadId, { occurredAt, nextActionAt, nextActionTitle, status: activity.leadStatus });
  if (companyId) {
    await updateCompanyProfile(auth, companyId, {
      lastContactAt: occurredAt,
      ...(nextActionTitle || nextActionAt ? { nextActionAt, nextActionTitle } : {})
    }).catch(() => undefined);
  }
}

async function syncLegacyMirror(auth: BusinessAuth, activityId: string, activity: DocumentData) {
  const companyId = nullableString(activity.companyId, 160);
  if (!companyId) return;
  const mirrorRef = await findMirrorRef(auth, companyId, activityId, nullableString(activity.legacyCompanyActivityLogId, 160));
  if (!mirrorRef) return;
  await mirrorRef.set(buildLegacyMirrorPayload(auth, companyId, activity, mirrorRef.id), { merge: true });
}

async function deleteLegacyMirror(auth: BusinessAuth, activityId: string, activity: DocumentData) {
  const companyId = nullableString(activity.companyId, 160);
  if (!companyId) return;
  const mirrorRef = await findMirrorRef(auth, companyId, activityId, nullableString(activity.legacyCompanyActivityLogId, 160));
  if (mirrorRef) await mirrorRef.delete();
}

async function findMirrorRef(auth: BusinessAuth, companyId: string, activityId: string, legacyId: string | null) {
  const companyRef = auth.db.collection("companies").doc(companyId);
  if (legacyId) {
    const ref = companyRef.collection("activityLogs").doc(legacyId);
    const snapshot = await ref.get();
    if (snapshot.exists) return ref;
  }
  const [source, canonical] = await Promise.all([
    companyRef.collection("activityLogs").where("sourceActivityId", "==", activityId).limit(1).get(),
    companyRef.collection("activityLogs").where("canonicalActivityId", "==", activityId).limit(1).get()
  ]);
  return source.docs[0]?.ref ?? canonical.docs[0]?.ref ?? null;
}

function buildLegacyMirrorPayload(auth: BusinessAuth, companyId: string, activity: DocumentData, legacyId: string) {
  return {
    companyId,
    type: normalizeLegacyActivityType(activity.activityType ?? activity.type),
    title: String(activity.title ?? ""),
    content: String(activity.content ?? ""),
    occurredAt: timestampFrom(activity.occurredAt) ?? Timestamp.now(),
    userId: String(activity.createdBy ?? auth.userId),
    userName: String(activity.createdByName ?? auth.userName),
    attachments: Array.isArray(activity.attachments) ? activity.attachments : [],
    nextAction: activity.nextActionTitle || activity.nextActionAt ? { title: activity.nextActionTitle ?? "", dueAt: timestampFrom(activity.nextActionAt) } : null,
    aiTaskRequested: Boolean(activity.aiTaskRequested),
    aiTaskGeneratedIds: Array.isArray(activity.aiTaskGeneratedIds) ? activity.aiTaskGeneratedIds : [],
    source: "activities",
    sourceActivityId: String(activity.id ?? ""),
    canonicalActivityId: String(activity.id ?? ""),
    mirroredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: String(activity.createdBy ?? auth.userId),
    createdAt: activity.createdAt ?? FieldValue.serverTimestamp(),
    legacyCompanyActivityLogId: legacyId
  };
}

async function listLegacyOnlyCompanyLogs(auth: BusinessAuth, companyId: string, limit: number, canonical: DocumentData[]) {
  const snapshot = await auth.db.collection("companies").doc(companyId).collection("activityLogs").orderBy("occurredAt", "desc").limit(limit).get();
  const canonicalIds = new Set(canonical.map((activity) => String(activity.id ?? "")));
  const legacyIds = new Set(canonical.map((activity) => String(activity.legacyCompanyActivityLogId ?? "")).filter(Boolean));
  return snapshot.docs
    .filter((entry) => !legacyIds.has(entry.id))
    .filter((entry) => {
      const data = entry.data();
      return !canonicalIds.has(String(data.sourceActivityId ?? data.canonicalActivityId ?? ""));
    })
    .map((entry) => serializeLegacyCompanyLog(entry.id, companyId, entry.data()));
}

function serializeLegacyCompanyLog(id: string, companyId: string, data: DocumentData) {
  return serializeActivity(id, {
    ...data,
    id,
    companyId: data.companyId ?? companyId,
    type: legacyToCommonActivityType(data.type),
    activityType: normalizeLegacyActivityType(data.type),
    legacyCompanyActivityLogId: id,
    sourceCollection: "companies/activityLogs"
  });
}

function legacyToCommonActivityType(type: unknown): ActivityType {
  if (type === "phone") return "call";
  if (type === "email") return "email";
  if (type === "file") return "document";
  if (type === "visit" || type === "meeting" || type === "deal") return "meeting";
  if (type === "memo") return "note";
  if (type === "status_change") return "status_change";
  if (type === "chat" || type === "task_created" || type === "task_completed" || type === "ai_task") return "other";
  if (activityTypes.includes(type as ActivityType)) return type as ActivityType;
  return "other";
}

function commonToLegacyActivityType(type: unknown): LegacyActivityLogType {
  if (type === "call" || type === "telemarketing") return "phone";
  if (type === "email") return "email";
  if (type === "document") return "file";
  if (type === "meeting") return "meeting";
  if (type === "note") return "memo";
  if (type === "status_change") return "status_change";
  return "other";
}

function timestampFrom(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Timestamp.fromDate(value);
  return parseDate(value);
}

function compareActivityDesc(left: DocumentData, right: DocumentData) {
  return dateMillis(right.occurredAt) - dateMillis(left.occurredAt);
}

function dateMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

function matchesActivity(activity: DocumentData, keyword: string) {
  const fields = [activity.title, activity.content, activity.companyName, activity.leadName, activity.productName, activity.type, activity.activityType, activity.leadStatus, activity.nextActionTitle];
  return fields.some((value) => String(value ?? "").toLowerCase().includes(keyword));
}
