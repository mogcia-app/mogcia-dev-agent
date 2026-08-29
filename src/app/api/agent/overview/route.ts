import { Timestamp } from "firebase-admin/firestore";
import { authenticateBusinessRequest, businessFailure, businessSuccess, serializeDoc } from "@/lib/server/business/api";
import { listAgentNotifications } from "@/lib/server/agent/repository";

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
      auth.db.collection("companies").orderBy("updatedAt", "desc").limit(8).get(),
      auth.db.collection("tasks").where("assigneeId", "==", auth.userId).orderBy("createdAt", "desc").limit(12).get(),
      auth.db.collection("calendarEvents").where("startAt", ">=", Timestamp.fromDate(todayStart)).where("startAt", "<=", Timestamp.fromDate(todayEnd)).orderBy("startAt", "asc").limit(12).get(),
      listAgentNotifications(auth.userId, 20)
    ]);
    return businessSuccess({
      syncedAt: new Date().toISOString(),
      companies: companies.docs.map((entry) => serializeDoc(entry.id, entry.data())),
      tasks: tasks.docs.map((entry) => serializeDoc(entry.id, entry.data())),
      calendarEvents: calendar.docs.map((entry) => serializeDoc(entry.id, entry.data())),
      notifications
    });
  } catch (error) {
    return businessFailure(error);
  }
}
