import { DesktopApiError, desktopFailure, desktopSuccess, parseIsoDate } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { BusinessApiError, type BusinessAuth } from "@/lib/server/business/api";
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, toDesktopCalendarEvent, updateCalendarEvent } from "@/lib/server/business/calendar-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const url = new URL(request.url);
    const startFrom = parseIsoDate(url.searchParams.get("from"), "取得開始日時") ?? undefined;
    const startTo = parseIsoDate(url.searchParams.get("to"), "取得終了日時") ?? undefined;
    if (startFrom && startTo && startFrom > startTo) throw new DesktopApiError("VALIDATION_ERROR", "取得開始日時は終了日時以前にしてください", 400);
    const limit = readLimit(url.searchParams.get("limit")) ?? (startFrom || startTo ? 500 : 120);
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "calendar_read", async () => {
      const events = (await listCalendarEvents(toBusinessAuth(auth), { limit, startFrom, startTo })).map(toDesktopCalendarEvent);
      return { events };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const eventId = requiredId(body.id ?? body.calendarEventId);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "calendar_update", async () => {
      const result = await updateCalendarEvent(toBusinessAuth(auth), { ...body, id: eventId });
      return { event: toDesktopCalendarEvent(result.event) };
    }, eventId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const eventId = requiredId(body.id ?? body.calendarEventId);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "calendar_delete", () => deleteCalendarEvent(toBusinessAuth(auth), eventId), eventId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit(context, "calendar_create", async () => {
      const created = await createCalendarEvent(toBusinessAuth(auth), body);
      return {
        calendarEventId: created.calendarEventId,
        requiresConfirmation: created.requiresConfirmation,
        duplicates: created.duplicates
      };
    });
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>): BusinessAuth {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop",
    deviceId: auth.device.id
  };
}

function toDesktopError(error: unknown) {
  if (error instanceof BusinessApiError) return new DesktopApiError(error.code === "CONFLICT" ? "DUPLICATE" : error.code, error.message, error.status);
  return error;
}

function requiredId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new DesktopApiError("VALIDATION_ERROR", "予定IDを入力してください", 400);
  return value.trim();
}

function readLimit(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 1000) : null;
}
