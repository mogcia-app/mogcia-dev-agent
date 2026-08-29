import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { endOfTokyoToday, startOfTokyoToday, timestampToIso } from "@/lib/desktop/format";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "calendar_read", async () => {
      const snapshot = await auth.db.collection("calendarEvents").get();
      const start = startOfTokyoToday().getTime();
      const end = endOfTokyoToday().getTime();
      const events = snapshot.docs
        .map((entry) => ({ id: entry.id, data: entry.data() }))
        .filter(({ data }) => data.createdBy === auth.userId || data.assigneeId === auth.userId || (Array.isArray(data.attendeeIds) && data.attendeeIds.includes(auth.userId)))
        .filter(({ data }) => {
          const eventStart = data.startAt?.toDate?.()?.getTime();
          const eventEnd = data.endAt?.toDate?.()?.getTime() ?? eventStart;
          return typeof eventStart === "number" && eventStart <= end && typeof eventEnd === "number" && eventEnd >= start;
        })
        .sort((left, right) => (left.data.startAt?.toDate?.()?.getTime() ?? 0) - (right.data.startAt?.toDate?.()?.getTime() ?? 0))
        .map(({ id, data }) => ({ id, title: String(data.title ?? ""), startAt: timestampToIso(data.startAt), endAt: timestampToIso(data.endAt), allDay: Boolean(data.allDay), companyName: typeof data.companyName === "string" ? data.companyName : null, location: typeof data.location === "string" ? data.location : null, eventType: String(data.eventType ?? "meeting") }));
      return { events };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
