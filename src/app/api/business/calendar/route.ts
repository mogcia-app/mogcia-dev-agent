import { Timestamp } from "firebase-admin/firestore";
import { assertFreshUpdate, authenticateBusinessRequest, businessFailure, businessSuccess, BusinessApiError, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, withBusinessAudit, type BusinessAuth } from "@/lib/server/business/api";

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
        ...cleanPatchBody(body),
        title: typeof body.title === "string" ? body.title.trim() : previous.title,
        description: optionalString(body.description ?? previous.description, 3000),
        eventType: optionalString(body.eventType ?? previous.eventType, 80) || "meeting",
        startAt,
        endAt: body.endAt === undefined ? previous.endAt ?? null : parseDate(body.endAt),
        allDay: body.allDay === undefined ? Boolean(previous.allDay) : Boolean(body.allDay),
        companyId: nullableString(body.companyId) ?? previous.companyId ?? null,
        companyName: nullableString(body.companyName) ?? previous.companyName ?? null,
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
    attendeeIds: [],
    attendeeNames: [],
    companyId: nullableString(body.companyId, 160),
    companyName: nullableString(body.companyName, 200),
    source: "manual",
    visibility: "team",
    ...defaultBusinessFields(auth)
  };
}
