import { authenticateBusinessRequest, businessFailure, businessSuccess } from "@/lib/server/business/api";
import { listAgentNotifications } from "@/lib/server/agent/repository";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { listCompanies } from "@/lib/server/business/company-service";
import { listTasks } from "@/lib/server/business/task-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const [companies, tasks, calendar, notifications] = await Promise.all([
      listCompanies(auth, { limit: 8 }),
      listTasks(auth, { assigneeId: auth.userId, includeCompleted: true, limit: 12 }),
      listCalendarEvents(auth, { startFrom: todayStart, startTo: todayEnd, limit: 12 }),
      listAgentNotifications(auth.userId, 20)
    ]);
    return businessSuccess({
      syncedAt: new Date().toISOString(),
      companies,
      tasks,
      calendarEvents: calendar,
      notifications
    });
  } catch (error) {
    return businessFailure(error);
  }
}
