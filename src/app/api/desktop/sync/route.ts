import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { startOfTokyoToday } from "@/lib/desktop/format";
import { listAgentNotifications } from "@/lib/server/agent/repository";
import { type BusinessAuth } from "@/lib/server/business/api";
import { listCalendarEvents, toDesktopSyncCalendarEvent } from "@/lib/server/business/calendar-service";
import { listCompanies, toDesktopCompanyPayload } from "@/lib/server/business/company-service";
import { listTasks, toDesktopTaskPayload } from "@/lib/server/business/task-service";
import { getUserDisplayNameById } from "@/lib/user-display";

type SyncItem = { key: string; label: string; success: boolean; data?: unknown; error?: string };
const CALENDAR_SYNC_DAYS = 7;
const CALENDAR_SYNC_LIMIT = 20;

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "sync", async () => {
      const items = await Promise.all([
        syncItem("calendar", "カレンダー", () => loadTodayCalendar(auth)),
        syncItem("tasks", "タスク", () => loadTasks(auth)),
        syncItem("notifications", "通知", async () => ({ notifications: await listAgentNotifications(auth.userId, 20) })),
        syncItem("companies", "会社", () => loadCompanies(auth)),
        syncItem("ai", "AI提案", () => loadAiSuggestions(auth))
      ]);
      return {
        syncedAt: new Date().toISOString(),
        items,
        calendarEvents: itemPayload<{ events: unknown[] }>(items, "calendar")?.events ?? [],
        tasks: itemPayload<{ tasks: unknown[] }>(items, "tasks")?.tasks ?? [],
        companies: itemPayload<{ companies: unknown[] }>(items, "companies")?.companies ?? [],
        notifications: itemPayload<{ notifications: unknown[] }>(items, "notifications")?.notifications ?? [],
        aiSuggestions: itemPayload<{ suggestions: unknown[] }>(items, "ai")?.suggestions ?? [],
        partialErrors: items
          .filter((item) => !item.success)
          .map((item) => ({ key: item.key, label: item.label, message: item.error ?? "読み込みに失敗しました" }))
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
  const startFrom = startOfTokyoToday();
  const startTo = new Date(startFrom.getTime() + CALENDAR_SYNC_DAYS * 24 * 60 * 60 * 1000 - 1);
  const events = (await listCalendarEvents(toBusinessAuth(auth), { limit: CALENDAR_SYNC_LIMIT, startFrom, startTo })).map(toDesktopSyncCalendarEvent);
  return { events };
}

async function loadCompanies(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  const companies = await listCompanies(toBusinessAuth(auth), { limit: 8 });
  return { companies: companies.map(toDesktopCompanyPayload) };
}

async function loadTasks(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  const tasks = await listTasks(toBusinessAuth(auth), { assigneeId: auth.userId, includeCompleted: false, limit: 20 });
  return { tasks: tasks.map(toDesktopTaskPayload) };
}

async function loadAiSuggestions(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  const companies = await listCompanies(toBusinessAuth(auth), { limit: 20 });
  const suggestions = companies.slice(0, 6).map((company) => {
    const companyId = String(company.id ?? "");
    const companyName = String(company.name ?? "");
    const nextActionTitle = String(company.nextActionTitle ?? "").trim();
    return {
      id: `company:${companyId}:next-action`,
      type: "company_next_action",
      title: nextActionTitle ? "次回対応を確認" : "次回対応を設定",
      message: nextActionTitle
        ? `${companyName}の「${nextActionTitle}」を確認しておくとよさそうです。`
        : `${companyName}の次回対応を設定しておくとよさそうです。`,
      companyId,
      companyName,
      targetURL: `/sales/companies?id=${companyId}&tab=overview`
    };
  });
  return { suggestions };
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
