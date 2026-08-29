import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

const openStatuses = new Set(["todo", "open", "pending", "in_progress"]);
const developerRoles = new Set(["developer", "admin", "owner"]);
const adminUid = "TjDadmBAdVYaPEvG3ppfBLS4HGN2";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const db = getAdminDb();
    const now = Date.now();
    const [userDoc, tasksSnapshot, eventsSnapshot, runsSnapshot] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("tasks").where("assigneeId", "==", user.uid).get(),
      db.collection("calendarEvents").orderBy("startAt", "asc").limit(100).get(),
      db.collection("agentRuns").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(40).get()
    ]);
    const tasks: Array<Record<string, unknown> & { id: string }> = tasksSnapshot.docs
      .map<Record<string, unknown> & { id: string }>((entry) => ({ id: entry.id, ...entry.data() }))
      .filter((task) => openStatuses.has(String(task.status ?? "")));
    const overdue = tasks.filter((task) => timestampMillis(task.dueDate) > 0 && timestampMillis(task.dueDate) < now).length;
    const events: Array<Record<string, unknown> & { id: string }> = eventsSnapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }));
    const nextEvent = events
      .filter((event) => belongsToUser(event, user.uid) && timestampMillis(event.startAt) >= now)
      .sort((a, b) => timestampMillis(a.startAt) - timestampMillis(b.startAt))[0];
    const upcomingEvents = events
      .filter((event) => belongsToUser(event, user.uid) && timestampMillis(event.startAt) >= now)
      .sort((a, b) => timestampMillis(a.startAt) - timestampMillis(b.startAt))
      .slice(0, 12)
      .map((event) => ({ id: event.id, title: String(event.title ?? event.companyName ?? "予定"), productName: stringOrNull(event.productName), startAt: new Date(timestampMillis(event.startAt)).toISOString() }));
    const runs: Array<Record<string, unknown> & { id: string }> = runsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    const role = user.uid === adminUid ? "admin" : String(userDoc.data()?.role ?? "sales");
    return NextResponse.json({ success: true, data: {
      role,
      showDevelopment: developerRoles.has(role),
      tasks: {
        open: tasks.length, overdue,
        today: tasks.filter((task) => {
          const due = timestampMillis(task.dueDate); if (!due) return false;
          const date = new Date(due); const current = new Date(now);
          return date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth() && date.getDate() === current.getDate();
        }).sort((a, b) => timestampMillis(a.dueDate) - timestampMillis(b.dueDate)).slice(0, 5).map((task) => ({
          id: String(task.id ?? ""), title: String(task.title ?? "未完了タスク"), dueDate: new Date(timestampMillis(task.dueDate)).toISOString()
        }))
      },
      nextEvent: nextEvent ? {
        id: nextEvent.id,
        title: String(nextEvent.title ?? nextEvent.companyName ?? "予定"),
        productName: stringOrNull(nextEvent.productName),
        startAt: new Date(timestampMillis(nextEvent.startAt)).toISOString()
      } : null,
      upcomingEvents,
      development: {
        running: runs.filter((run) => ["queued", "running"].includes(String(run.status))).length,
        awaitingApproval: runs.filter((run) => run.status === "requires_approval").length
      }
    } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "概要を取得できませんでした。" } }, { status: 400 });
  }
}

function timestampMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string" || typeof value === "number") return new Date(value).getTime() || 0;
  return 0;
}
function belongsToUser(event: Record<string, unknown>, uid: string): boolean {
  if (event.userId === uid || event.ownerId === uid || event.assigneeId === uid) return true;
  return [event.participantIds, event.userIds, event.attendeeIds].some((value) => Array.isArray(value) && value.includes(uid));
}
function stringOrNull(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
