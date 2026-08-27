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
    const tasks = tasksSnapshot.docs.map((entry) => entry.data()).filter((task) => openStatuses.has(String(task.status ?? "")));
    const overdue = tasks.filter((task) => timestampMillis(task.dueDate) > 0 && timestampMillis(task.dueDate) < now).length;
    const events: Array<Record<string, unknown> & { id: string }> = eventsSnapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }));
    const nextEvent = events
      .filter((event) => belongsToUser(event, user.uid) && timestampMillis(event.startAt) >= now)
      .sort((a, b) => timestampMillis(a.startAt) - timestampMillis(b.startAt))[0];
    const runs: Array<Record<string, unknown> & { id: string }> = runsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    const role = user.uid === adminUid ? "admin" : String(userDoc.data()?.role ?? "sales");
    return NextResponse.json({ success: true, data: {
      role,
      showDevelopment: developerRoles.has(role),
      tasks: { open: tasks.length, overdue },
      nextEvent: nextEvent ? {
        id: nextEvent.id,
        title: String(nextEvent.title ?? nextEvent.companyName ?? "予定"),
        productName: stringOrNull(nextEvent.productName),
        startAt: new Date(timestampMillis(nextEvent.startAt)).toISOString()
      } : null,
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
