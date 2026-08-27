import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type RecommendationPriority = "urgent" | "today" | "info";
export type RecommendationStatus = "unread" | "read" | "dismissed" | "done";
export type Recommendation = {
  id: string; type: string; priority: RecommendationPriority; title: string; message: string;
  targetURL: string; leadId: string | null; companyId: string | null; taskId: string | null;
  status: RecommendationStatus; createdAt: string; expiresAt: string | null;
};

const openStatuses = new Set(["todo", "open", "pending", "in_progress"]);
const activeLeadStatuses = new Set(["new", "contacting", "document_sent", "appointment", "meeting", "considering", "hold"]);

export async function listRecommendations(userId: string): Promise<Recommendation[]> {
  const db = getAdminDb(); const now = Date.now(); const todayEnd = endOfDay(now);
  const [tasksSnapshot, leadsSnapshot, eventsSnapshot, statesSnapshot] = await Promise.all([
    db.collection("tasks").where("assigneeId", "==", userId).get(),
    db.collection("leads").orderBy("updatedAt", "desc").limit(200).get(),
    db.collection("calendarEvents").orderBy("startAt", "asc").limit(100).get(),
    db.collection("recommendationStates").where("userId", "==", userId).limit(500).get()
  ]);
  const states = new Map(statesSnapshot.docs.map((entry) => [entry.id, String(entry.data().status ?? "unread") as RecommendationStatus]));
  const rows: Recommendation[] = [];
  for (const document of tasksSnapshot.docs) {
    const task = document.data(); if (!openStatuses.has(String(task.status ?? ""))) continue;
    const due = timestampMillis(task.dueDate); if (!due || due > todayEnd) continue;
    const overdue = due < now;
    rows.push(make(userId, `task:${document.id}:${dayKey(due)}`, "task_due", overdue ? "urgent" : "today",
      overdue ? "期限を過ぎたタスクがあります" : "今日が期限のタスクです", String(task.title ?? "未完了タスク"),
      `/tasks?taskId=${document.id}`, { taskId: document.id }, states));
  }
  for (const document of eventsSnapshot.docs) {
    const event = document.data(); if (!belongsToUser(event, userId)) continue;
    const start = timestampMillis(event.startAt); if (start < now || start > todayEnd) continue;
    const minutes = Math.floor((start - now) / 60_000); const urgent = minutes <= 30;
    rows.push(make(userId, `event:${document.id}:${dayKey(start)}`, "appointment_reminder", urgent ? "urgent" : "today",
      urgent ? `あと${Math.max(0, minutes)}分で予定があります` : "今日の予定", String(event.title ?? event.companyName ?? "予定"),
      "/calendar", {}, states, new Date(start + 3_600_000).toISOString()));
  }
  for (const document of leadsSnapshot.docs) {
    const lead = document.data(); if (!activeLeadStatuses.has(String(lead.status ?? ""))) continue;
    if (lead.assignedUserId && lead.assignedUserId !== userId) continue;
    if (!lead.assignedUserId && lead.createdBy && lead.createdBy !== userId) continue;
    const last = timestampMillis(lead.lastActivityAt) || timestampMillis(lead.createdAt); if (!last) continue;
    const inactiveDays = Math.floor((now - last) / 86_400_000); if (inactiveDays < 14) continue;
    rows.push(make(userId, `lead:${document.id}:inactive:${dayKey(now)}`, "lead_follow_up", "today",
      String(lead.companyName ?? "見込み客"), `最後の営業Activityから${inactiveDays}日経っています。そろそろフォローしませんか？`,
      `/leads?leadId=${document.id}`, { leadId: document.id, companyId: nullableString(lead.companyId) }, states, new Date(todayEnd).toISOString()));
  }
  return rows.filter((row) => row.status !== "dismissed" && row.status !== "done")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 20);
}

export async function updateRecommendationState(userId: string, id: string, status: RecommendationStatus, snoozedUntil?: string | null) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Recommendation IDが不正です。");
  await getAdminDb().collection("recommendationStates").doc(id).set({
    userId, status, snoozedUntil: snoozedUntil ? new Date(snoozedUntil) : null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { id, status };
}

function make(userId: string, sourceKey: string, type: string, priority: RecommendationPriority, title: string, message: string, targetURL: string,
  links: { leadId?: string; companyId?: string | null; taskId?: string }, states: Map<string, RecommendationStatus>, expiresAt: string | null = null): Recommendation {
  const id = createHash("sha256").update(`${userId}\u0000${sourceKey}`).digest("hex");
  return { id, type, priority, title, message, targetURL, leadId: links.leadId ?? null, companyId: links.companyId ?? null,
    taskId: links.taskId ?? null, status: states.get(id) ?? "unread", createdAt: new Date().toISOString(), expiresAt };
}
function timestampMillis(value: unknown): number { if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis(); if (typeof value === "string" || typeof value === "number") return new Date(value).getTime() || 0; return 0; }
function belongsToUser(event: DocumentData, uid: string) { if (event.userId === uid || event.ownerId === uid || event.assigneeId === uid) return true; return [event.participantIds, event.userIds, event.attendeeIds].some((value) => Array.isArray(value) && value.includes(uid)); }
function nullableString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function endOfDay(now: number) { const date = new Date(now); date.setHours(23, 59, 59, 999); return date.getTime(); }
function dayKey(value: number) { return new Date(value).toISOString().slice(0, 10); }
function priorityRank(value: RecommendationPriority) { return value === "urgent" ? 0 : value === "today" ? 1 : 2; }
