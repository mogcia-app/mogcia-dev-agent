import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import type { DocumentData } from "firebase-admin/firestore";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { endOfTokyoToday, startOfTokyoToday, timestampToIso, toDesktopCompany, toDesktopTask } from "@/lib/desktop/format";
import { listAgentNotifications } from "@/lib/server/agent/repository";

type SyncItem = { key: string; label: string; success: boolean; data?: unknown; error?: string };

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "sync", async () => {
      const items = await Promise.all([
        syncItem("calendar", "カレンダー", () => loadTodayCalendar(auth)),
        syncItem("notifications", "通知", async () => ({ notifications: await listAgentNotifications(auth.userId, 20) })),
        syncItem("companies", "会社", () => loadCompanies(auth)),
        syncItem("ai", "AI提案", () => loadAiSuggestions(auth))
      ]);
      return {
        syncedAt: new Date().toISOString(),
        items,
        calendarEvents: itemPayload<{ events: unknown[] }>(items, "calendar")?.events ?? [],
        notifications: itemPayload<{ notifications: unknown[] }>(items, "notifications")?.notifications ?? []
      };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function itemPayload<T>(items: SyncItem[], key: string): T | null {
  const item = items.find((entry) => entry.key === key);
  return item?.success && item.data ? item.data as T : null;
}

async function syncItem(key: string, label: string, load: () => Promise<unknown>): Promise<SyncItem> {
  try {
    return { key, label, success: true, data: await load() };
  } catch (error) {
    return { key, label, success: false, error: error instanceof Error ? error.message : "読み込みに失敗しました" };
  }
}

async function loadTodayCalendar(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  const start = startOfTokyoToday().getTime();
  const end = endOfTokyoToday().getTime();
  const snapshot = await auth.db.collection("calendarEvents").orderBy("startAt", "asc").limit(120).get();
  const events = snapshot.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() })).filter((event) => {
    const startsAt = event.startAt?.toDate?.()?.getTime() ?? 0;
    return startsAt >= start && startsAt <= end && (event.createdBy === auth.userId || event.assigneeId === auth.userId || event.attendeeIds?.includes?.(auth.userId));
  }).map((event) => ({ id: event.id, title: String(event.title ?? ""), startAt: timestampToIso(event.startAt), companyName: event.companyName ?? null }));
  return { events };
}

async function loadCompanies(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  const snapshot = await auth.db.collection("companies").orderBy("updatedAt", "desc").limit(8).get();
  return { companies: snapshot.docs.map((entry) => toDesktopCompany(entry.id, entry.data())) };
}

async function loadAiSuggestions(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  const snapshot = await auth.db.collection("tasks").where("assigneeId", "==", auth.userId).orderBy("createdAt", "desc").limit(6).get();
  return { tasks: snapshot.docs.map((entry) => toDesktopTask(entry.id, entry.data())).filter((task) => task.status !== "completed") };
}
