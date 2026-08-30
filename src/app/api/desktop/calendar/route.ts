import { DesktopApiError, desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { BusinessApiError, type BusinessAuth } from "@/lib/server/business/api";
import { createCalendarEvent, listCalendarEvents, toDesktopCalendarEvent } from "@/lib/server/business/calendar-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "calendar_read", async () => {
      const events = (await listCalendarEvents(toBusinessAuth(auth), { limit: 120 })).map(toDesktopCalendarEvent);
      return { events };
    });
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
