import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { normalizeCalendarEventFields } from "@/lib/calendar-normalization";
import { timestampToIso } from "@/lib/desktop/format";
import { getActiveCalendarMemberIds, isVisibleCalendarEventForMemberGroup } from "@/lib/server/calendar-access";
import { arrayOfStrings, assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";

const COLLECTION = "calendarEvents";
const DEFAULT_DURATION_MINUTES = 60;

export type CalendarListOptions = {
  limit?: number;
  visibleOnly?: boolean;
  startFrom?: Date;
  startTo?: Date;
};

export async function listCalendarEvents(auth: BusinessAuth, options: CalendarListOptions = {}) {
  const limit = options.limit ?? 500;
  const memberIds = options.visibleOnly === false ? null : await getActiveCalendarMemberIds(auth.userId);
  const snapshot = await auth.db.collection(COLLECTION).orderBy("startAt", "asc").limit(limit).get();
  return snapshot.docs
    .map((entry): DocumentData => ({ id: entry.id, ...entry.data() }))
    .filter((event) => {
      const startsAt = timestampMillis(event.startAt);
      if (options.startFrom && startsAt < options.startFrom.getTime()) return false;
      if (options.startTo && startsAt > options.startTo.getTime()) return false;
      return memberIds ? isVisibleCalendarEventForMemberGroup(event, memberIds, auth.userId) : true;
    })
    .map((event) => serializeCalendarEvent(String(event.id), event));
}

export async function getCalendarEventById(auth: BusinessAuth, eventId: string) {
  const snapshot = await auth.db.collection(COLLECTION).doc(eventId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "予定が見つかりません。", 404);
  return serializeCalendarEvent(snapshot.id, snapshot.data() ?? {});
}

export async function createCalendarEvent(auth: BusinessAuth, body: Record<string, unknown>) {
  const title = requireString(body.title, "予定タイトル");
  const startAt = parseDate(body.startAt);
  if (!startAt) throw new BusinessApiError("VALIDATION_ERROR", "開始日時を入力してください。", 400);
  const endAt = parseDate(body.endAt) ?? Timestamp.fromMillis(startAt.toMillis() + DEFAULT_DURATION_MINUTES * 60 * 1000);
  const force = body.force === true;
  const duplicates = await findTimeDuplicates(auth.db, COLLECTION, { title, companyId: nullableString(body.companyId), startsAt: startAt.toDate() });
  if (duplicates.length && !force) return { id: null, calendarEventId: null, requiresConfirmation: true, duplicates };
  const payload = await buildCalendarPayload(auth, body, title, startAt, endAt);
  const ref = await auth.db.collection(COLLECTION).add(payload);
  return { id: ref.id, calendarEventId: ref.id, requiresConfirmation: false };
}

export async function updateCalendarEvent(auth: BusinessAuth, body: Record<string, unknown>) {
  const eventId = requireString(body.id ?? body.calendarEventId, "予定ID", 160);
  const ref = auth.db.collection(COLLECTION).doc(eventId);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  const startAt = body.startAt === undefined ? previous.startAt ?? null : parseDate(body.startAt);
  const endAt = body.endAt === undefined ? previous.endAt ?? null : parseDate(body.endAt);
  const normalizedFields = normalizeCalendarEventFields({
    eventType: body.eventType ?? previous.eventType,
    meetingMethod: body.meetingMethod ?? previous.meetingMethod,
    meetingUrl: body.meetingUrl ?? previous.meetingUrl
  });
  await ref.set({
    ...cleanPatchBody(body, ["attendeeMemberNames"]),
    title: typeof body.title === "string" ? body.title.trim() : previous.title,
    description: optionalString(body.description ?? previous.description, 3000),
    eventType: normalizedFields.eventType,
    meetingMethod: normalizedFields.meetingMethod,
    durationMinutes: resolveDurationMinutes(body.durationMinutes, startAt, endAt, previous.durationMinutes),
    startAt,
    endAt,
    allDay: body.allDay === undefined ? Boolean(previous.allDay) : Boolean(body.allDay),
    assigneeId: body.assigneeId === undefined ? previous.assigneeId ?? auth.userId : nullableString(body.assigneeId, 160) ?? auth.userId,
    assigneeName: body.assigneeName === undefined ? previous.assigneeName ?? auth.userName : nullableString(body.assigneeName, 160) ?? auth.userName,
    attendeeIds: body.attendeeIds === undefined ? Array.isArray(previous.attendeeIds) ? previous.attendeeIds : [] : arrayOfStrings(body.attendeeIds),
    attendeeNames: body.attendeeNames === undefined ? Array.isArray(previous.attendeeNames) ? previous.attendeeNames : [] : arrayOfStrings(body.attendeeNames),
    relatedEntity: relatedEntityFromBody(body, previous),
    relatedType: patchNullableString(body, previous, "relatedType", 40),
    relatedId: patchNullableString(body, previous, "relatedId", 160),
    relatedName: patchNullableString(body, previous, "relatedName", 200),
    relatedContactName: patchNullableString(body, previous, "relatedContactName", 120),
    companyId: patchNullableString(body, previous, "companyId", 160),
    companyName: patchNullableString(body, previous, "companyName", 200),
    ...productFieldsFromBody(body, previous),
    location: patchNullableString(body, previous, "location", 500),
    meetingUrl: patchNullableString(body, previous, "meetingUrl", 500),
    ...updateBusinessFields(auth)
  }, { merge: true });
  const next = await ref.get();
  return { event: serializeCalendarEvent(next.id, next.data() ?? {}) };
}

export async function deleteCalendarEvent(auth: BusinessAuth, eventId: string) {
  const ref = auth.db.collection(COLLECTION).doc(eventId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "予定が見つかりません。", 404);
  await ref.delete();
  return { id: eventId, deleted: true };
}

export async function createCalendarEventFromDesktopDraft(auth: BusinessAuth, body: Record<string, unknown>) {
  const draftSource = valueObject(body.draft) ?? body;
  return createCalendarEvent(auth, { ...draftSource, force: body.force === true || draftSource.force === true });
}

export function serializeCalendarEvent(id: string, data: DocumentData): DocumentData {
  const normalizedFields = normalizeCalendarEventFields(data);
  return {
    ...serializeDoc(id, data),
    ...normalizedFields,
    ...productFieldsFromData(data),
    durationMinutes: resolveDurationMinutes(data.durationMinutes, data.startAt, data.endAt)
  };
}

export function toDesktopCalendarEvent(event: DocumentData) {
  return {
    id: event.id,
    title: String(event.title ?? ""),
    startAt: isoDate(event.startAt),
    endAt: isoDate(event.endAt),
    companyId: event.companyId ?? null,
    companyName: event.companyName ?? null,
    productId: event.productId ?? null,
    productName: event.productName ?? null,
    productIds: Array.isArray(event.productIds) ? event.productIds : event.productId ? [event.productId] : [],
    productNames: Array.isArray(event.productNames) ? event.productNames : event.productName ? [event.productName] : [],
    attendeeIds: Array.isArray(event.attendeeIds) ? event.attendeeIds : [],
    attendeeNames: Array.isArray(event.attendeeNames) ? event.attendeeNames : [],
    eventType: event.eventType,
    meetingMethod: event.meetingMethod,
    durationMinutes: resolveDurationMinutes(event.durationMinutes, event.startAt, event.endAt)
  };
}

export function toDesktopSyncCalendarEvent(event: DocumentData) {
  return {
    id: event.id,
    title: String(event.title ?? ""),
    startAt: isoDate(event.startAt),
    companyName: event.companyName ?? null,
    productId: event.productId ?? null,
    productName: event.productName ?? null,
    productIds: Array.isArray(event.productIds) ? event.productIds : event.productId ? [event.productId] : [],
    productNames: Array.isArray(event.productNames) ? event.productNames : event.productName ? [event.productName] : [],
    eventType: event.eventType,
    meetingMethod: event.meetingMethod
  };
}

async function buildCalendarPayload(auth: BusinessAuth, body: Record<string, unknown>, title: string, startAt: Timestamp, endAt: Timestamp) {
  const normalizedFields = normalizeCalendarEventFields(body);
  const companyId = nullableString(body.companyId, 160);
  const companySnapshot = companyId ? await auth.db.collection("companies").doc(companyId).get() : null;
  if (companyId && !companySnapshot?.exists) throw new BusinessApiError("NOT_FOUND", "会社が見つかりません。", 404);
  return {
    title,
    description: optionalString(body.description, 3000),
    eventType: normalizedFields.eventType,
    meetingMethod: normalizedFields.meetingMethod,
    durationMinutes: resolveDurationMinutes(body.durationMinutes, startAt, endAt),
    startAt,
    endAt,
    allDay: Boolean(body.allDay),
    assigneeId: nullableString(body.assigneeId, 160) ?? auth.userId,
    assigneeName: nullableString(body.assigneeName, 160) ?? auth.userName,
    attendeeIds: arrayOfStrings(body.attendeeIds),
    attendeeNames: arrayOfStrings(body.attendeeNames),
    relatedEntity: relatedEntityFromBody(body),
    relatedType: nullableString(body.relatedType, 40),
    relatedId: nullableString(body.relatedId, 160),
    relatedName: nullableString(body.relatedName, 200),
    relatedContactName: nullableString(body.relatedContactName, 120),
    companyId,
    companyName: companySnapshot?.data()?.name ?? nullableString(body.companyName, 200),
    ...productFieldsFromBody(body),
    projectId: nullableString(body.projectId, 160),
    projectName: nullableString(body.projectName, 200),
    meetingId: nullableString(body.meetingId, 160),
    location: nullableString(body.location, 500),
    meetingUrl: nullableString(body.meetingUrl, 500),
    source: body.source === "google_calendar" || body.source === "automation" ? body.source : "manual",
    visibility: body.visibility === "private" ? "private" : "team",
    externalCalendarId: nullableString(body.externalCalendarId, 160),
    externalEventId: nullableString(body.externalEventId, 160),
    reminderMinutes: Array.isArray(body.reminderMinutes) ? body.reminderMinutes.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [],
    recurrence: null,
    ...defaultBusinessFields(auth),
    updatedAt: FieldValue.serverTimestamp()
  };
}

function relatedEntityFromBody(body: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  const explicit = body.relatedEntity;
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    const entity = explicit as Record<string, unknown>;
    const type = nullableString(entity.type, 40);
    const id = nullableString(entity.id, 160);
    const name = nullableString(entity.name, 200);
    if ((type === "lead" || type === "company") && id && name) return { type, id, name, contactName: nullableString(entity.contactName, 120) };
  }
  const type = patchNullableString(body, previous, "relatedType", 40);
  const id = patchNullableString(body, previous, "relatedId", 160);
  const name = patchNullableString(body, previous, "relatedName", 200);
  if ((type !== "lead" && type !== "company") || !id || !name) return null;
  return {
    type,
    id,
    name,
    contactName: patchNullableString(body, previous, "relatedContactName", 120)
  };
}

function productFieldsFromBody(body: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  const shouldUsePreviousIds = body.productIds === undefined && body.productId === undefined;
  const shouldUsePreviousNames = body.productNames === undefined && body.productName === undefined;
  const productIds = shouldUsePreviousIds ? stringArrayFromUnknown(previous.productIds, previous.productId) : stringArrayFromUnknown(body.productIds, body.productId);
  const productNames = shouldUsePreviousNames ? stringArrayFromUnknown(previous.productNames, previous.productName) : stringArrayFromUnknown(body.productNames, body.productName);
  return {
    productId: productIds[0] ?? null,
    productName: productNames[0] ?? null,
    productIds,
    productNames
  };
}

function productFieldsFromData(data: DocumentData) {
  const productIds = stringArrayFromUnknown(data.productIds, data.productId);
  const productNames = stringArrayFromUnknown(data.productNames, data.productName);
  return {
    productId: productIds[0] ?? null,
    productName: productNames[0] ?? null,
    productIds,
    productNames
  };
}

function stringArrayFromUnknown(value: unknown, fallback?: unknown): string[] {
  const values = Array.isArray(value) ? value : fallback ? [fallback] : [];
  return Array.from(new Set(values.map((item) => nullableString(item, 200)).filter((item): item is string => Boolean(item))));
}

function patchNullableString(body: Record<string, unknown>, previous: Record<string, unknown>, key: string, maxLength: number) {
  return body[key] === undefined ? nullableString(previous[key], maxLength) : nullableString(body[key], maxLength);
}

function resolveDurationMinutes(value: unknown, startAt: unknown, endAt: unknown, fallback?: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return Math.round(fallback);
  const start = timestampMillis(startAt);
  const end = timestampMillis(endAt);
  if (start > 0 && end > start) return Math.max(1, Math.round((end - start) / 60000));
  return DEFAULT_DURATION_MINUTES;
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return date.getTime();
  }
  return 0;
}

function isoDate(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return timestampToIso(value);
}

function valueObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
