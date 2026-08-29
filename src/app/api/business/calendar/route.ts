import { Timestamp } from "firebase-admin/firestore";
import { arrayOfStrings, assertFreshUpdate, authenticateBusinessRequest, businessFailure, businessSuccess, BusinessApiError, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, withBusinessAudit, type BusinessAuth } from "@/lib/server/business/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const data = await withBusinessAudit(auth, "business_calendar_read", async () => {
      const snapshot = await auth.db.collection("calendarEvents").orderBy("startAt", "asc").limit(500).get();
      return { events: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())) };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "予定タイトル");
    const startAt = parseDate(body.startAt);
    if (!startAt) throw new BusinessApiError("VALIDATION_ERROR", "開始日時を入力してください。", 400);
    const endAt = parseDate(body.endAt) ?? Timestamp.fromMillis(startAt.toMillis() + 60 * 60 * 1000);
    const force = body.force === true;
    const data = await withBusinessAudit(auth, "business_calendar_create", async () => {
      const duplicates = await findTimeDuplicates(auth.db, "calendarEvents", { title, companyId: nullableString(body.companyId), startsAt: startAt.toDate() });
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates };
      const ref = await auth.db.collection("calendarEvents").add(calendarPayload(auth, body, title, startAt, endAt));
      return { id: ref.id, calendarEventId: ref.id, requiresConfirmation: false };
    });
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const eventId = requireString(body.id ?? body.calendarEventId, "予定ID", 160);
    const ref = auth.db.collection("calendarEvents").doc(eventId);
    const data = await withBusinessAudit(auth, "business_calendar_update", async () => {
      const snapshot = await assertFreshUpdate(ref, body.updatedAt);
      const previous = snapshot.data() ?? {};
      const startAt = body.startAt === undefined ? previous.startAt ?? null : parseDate(body.startAt);
      await ref.set({
        ...cleanPatchBody(body, ["attendeeMemberNames"]),
        title: typeof body.title === "string" ? body.title.trim() : previous.title,
        description: optionalString(body.description ?? previous.description, 3000),
        eventType: optionalString(body.eventType ?? previous.eventType, 80) || "meeting",
        startAt,
        endAt: body.endAt === undefined ? previous.endAt ?? null : parseDate(body.endAt),
        allDay: body.allDay === undefined ? Boolean(previous.allDay) : Boolean(body.allDay),
        attendeeIds: body.attendeeIds === undefined ? Array.isArray(previous.attendeeIds) ? previous.attendeeIds : [] : arrayOfStrings(body.attendeeIds),
        attendeeNames: body.attendeeNames === undefined ? Array.isArray(previous.attendeeNames) ? previous.attendeeNames : [] : arrayOfStrings(body.attendeeNames),
        relatedEntity: relatedEntityFromBody(body, previous),
        relatedType: patchNullableString(body, previous, "relatedType", 40),
        relatedId: patchNullableString(body, previous, "relatedId", 160),
        relatedName: patchNullableString(body, previous, "relatedName", 200),
        relatedContactName: patchNullableString(body, previous, "relatedContactName", 120),
        companyId: patchNullableString(body, previous, "companyId", 160),
        companyName: patchNullableString(body, previous, "companyName", 200),
        productId: patchNullableString(body, previous, "productId", 160),
        productName: patchNullableString(body, previous, "productName", 200),
        ...updateBusinessFields(auth)
      }, { merge: true });
      const next = await ref.get();
      return { event: serializeDoc(next.id, next.data() ?? {}) };
    }, eventId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function calendarPayload(auth: BusinessAuth, body: Record<string, unknown>, title: string, startAt: Timestamp, endAt: Timestamp) {
  return {
    title,
    description: optionalString(body.description, 3000),
    eventType: optionalString(body.eventType, 80) || "meeting",
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
    companyId: nullableString(body.companyId, 160),
    companyName: nullableString(body.companyName, 200),
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 200),
    source: "manual",
    visibility: "team",
    ...defaultBusinessFields(auth)
  };
}

function relatedEntityFromBody(body: Record<string, unknown>, previous: Record<string, unknown> = {}) {
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

function patchNullableString(body: Record<string, unknown>, previous: Record<string, unknown>, key: string, maxLength: number) {
  return body[key] === undefined ? nullableString(previous[key], maxLength) : nullableString(body[key], maxLength);
}
