import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, updateCalendarEvent } from "@/lib/server/business/calendar-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const data = await withBusinessAudit(auth, "business_calendar_read", async () => {
      return { events: await listCalendarEvents(auth, { limit: 500 }) };
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
    const data = await withBusinessAudit(auth, "business_calendar_create", async () => {
      return createCalendarEvent(auth, body);
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
    const data = await withBusinessAudit(auth, "business_calendar_update", async () => {
      return updateCalendarEvent(auth, body);
    }, eventId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const eventId = requireString(body.id ?? body.calendarEventId, "予定ID", 160);
    const data = await withBusinessAudit(auth, "business_calendar_delete", () => deleteCalendarEvent(auth, eventId), eventId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
