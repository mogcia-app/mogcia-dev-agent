"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, Building2, CalendarDays, Clock3, History, ListChecks, MessageSquareText, Plus, UploadCloud } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";
import { subscribeCalendarEvents } from "@/lib/calendar";
import { subscribeCompaniesMaster, subscribeRecentCompanyActivityLogs } from "@/lib/companies";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { formatTaskTime, isAdminUser, isTaskOverdue, sortTasks, startOfToday } from "@/lib/task-utils";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import { subscribeTasks } from "@/lib/tasks";
import { getUserDisplayName, getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent } from "@/types/calendar";
import type { Company, CompanyActivityLog } from "@/types/company";
import type { Task, TaskProgressLog } from "@/types/task";
import type { TeleapoRecord } from "@/types/teleapo";

type TaskLogItem = {
  id: string;
  taskId: string;
  taskTitle: string;
  companyName?: string | null;
  assigneeName?: string;
  createdByName?: string;
  log: TaskProgressLog;
};

type RecentActivityItem =
  | { id: string; kind: "company"; occurredAt: Date; title: string; subtitle: string; href: Route }
  | { id: string; kind: "task"; occurredAt: Date; title: string; subtitle: string; href: Route }
  | { id: string; kind: "upload"; occurredAt: Date; title: string; subtitle: string; href: Route };

type RecentPageItem = {
  href: string;
  label: string;
  visitedAt: number;
};

function endOfWeek(): Date {
  const start = startOfToday();
  const end = new Date(start);
  const day = end.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function endOfToday(): Date {
  const end = startOfToday();
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfTomorrow(): Date {
  const tomorrow = startOfToday();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function endOfTomorrow(): Date {
  const tomorrow = startOfTomorrow();
  tomorrow.setHours(23, 59, 59, 999);
  return tomorrow;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}

function canSeeTask(task: Task, user: User | null): boolean {
  if (!user) return false;
  if (isAdminUser(user.uid)) return true;
  return task.assigneeId === user.uid || task.createdBy === user.uid || Boolean(task.collaboratorIds?.includes(user.uid));
}

function canSeeEvent(event: CalendarEvent, user: User | null): boolean {
  if (!user) return false;
  if (isAdminUser(user.uid)) return true;
  return event.assigneeId === user.uid || event.createdBy === user.uid || (event.attendeeIds ?? []).includes(user.uid);
}

function isOpenTask(task: Task): boolean {
  return task.status !== "completed" && task.status !== "cancelled";
}

function toCompanyHref(companyId: string): Route {
  return `/sales/companies?id=${companyId}&tab=timeline` as Route;
}

function canSeeTeleapoRecord(record: TeleapoRecord, user: User | null): boolean {
  if (!user) return false;
  return isAdminUser(user.uid) || record.userId === user.uid;
}

export function HomePageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyLogs, setCompanyLogs] = useState<CompanyActivityLog[]>([]);
  const [teleapoRecords, setTeleapoRecords] = useState<TeleapoRecord[]>([]);
  const [recentPages, setRecentPages] = useState<RecentPageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      window.setTimeout(() => {
        setError("Firebaseが未設定です。");
        setLoading(false);
      }, 0);
      return undefined;
    }

    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    window.setTimeout(() => setLoading(true), 0);

    const onError = (nextError: Error) => {
      setError(nextError.message);
      setLoading(false);
    };
    const unsubscribeTasks = subscribeTasks((nextTasks) => {
      setTasks(nextTasks);
      setLoading(false);
    }, onError);
    const unsubscribeEvents = subscribeCalendarEvents((nextEvents) => {
      setEvents(nextEvents);
      setLoading(false);
    }, onError);
    const unsubscribeCompanies = subscribeCompaniesMaster((nextCompanies) => {
      setCompanies(nextCompanies);
      setLoading(false);
    }, onError);
    const unsubscribeLogs = subscribeRecentCompanyActivityLogs(30, (nextLogs) => {
      setCompanyLogs(nextLogs);
      setLoading(false);
    }, () => {
      setCompanyLogs([]);
      setLoading(false);
    });
    const unsubscribeTeleapo = subscribeTeleapoRecords((nextRecords) => {
      setTeleapoRecords(nextRecords);
      setLoading(false);
    }, onError);

    return () => {
      unsubscribeTasks();
      unsubscribeEvents();
      unsubscribeCompanies();
      unsubscribeLogs();
      unsubscribeTeleapo();
    };
  }, [user]);

  useEffect(() => {
    const readRecentPages = () => {
      try {
        const next = JSON.parse(window.localStorage.getItem("mogcia-recent-pages") || "[]") as RecentPageItem[];
        setRecentPages(next.filter((item) => item.href && item.label).slice(0, 6));
      } catch {
        setRecentPages([]);
      }
    };
    readRecentPages();
    window.addEventListener("focus", readRecentPages);
    return () => window.removeEventListener("focus", readRecentPages);
  }, []);

  const dashboard = useMemo(() => {
    const weekStart = startOfToday();
    const todayEnd = endOfToday();
    const tomorrowStart = startOfTomorrow();
    const tomorrowEnd = endOfTomorrow();
    const weekEnd = endOfWeek();
    const visibleTasks = tasks.filter((task) => canSeeTask(task, user));
    const visibleEvents = events.filter((event) => canSeeEvent(event, user));
    const visibleTeleapoRecords = teleapoRecords.filter((record) => canSeeTeleapoRecord(record, user));
    const companyNameMap = new Map(companies.map((company) => [company.id, company.name]));
    const openTasks = visibleTasks.filter(isOpenTask);

    const weekEvents = visibleEvents
      .filter((event) => {
        const start = event.startAt.toDate();
        return start >= weekStart && start <= weekEnd;
      })
      .sort((left, right) => left.startAt.toMillis() - right.startAt.toMillis())
      .slice(0, 8);

    const todayEvents = weekEvents.filter((event) => event.startAt.toDate() <= todayEnd).slice(0, 6);

    const weekTasks = sortTasks(
      openTasks.filter((task) => {
        const due = task.dueDate?.toDate();
        return due && due >= weekStart && due <= weekEnd;
      }),
      "dueAsc"
    ).slice(0, 8);

    const todayTasks = weekTasks.filter((task) => {
      const due = task.dueDate?.toDate();
      return due && due <= todayEnd;
    }).slice(0, 6);

    const dueSummary = {
      today: openTasks.filter((task) => {
        const due = task.dueDate?.toDate();
        return due && due >= weekStart && due <= todayEnd;
      }).length,
      tomorrow: openTasks.filter((task) => {
        const due = task.dueDate?.toDate();
        return due && due >= tomorrowStart && due <= tomorrowEnd;
      }).length,
      overdue: openTasks.filter(isTaskOverdue).length
    };

    const visibleCompanyLogs = companyLogs
      .filter((log) => log.source !== "system" && log.type !== "status_change")
      .slice(0, 8);

    const taskLogs = visibleTasks
      .flatMap((task) => (task.progressLogs ?? []).map((log) => ({ id: `${task.id}-${log.id}`, taskId: task.id, taskTitle: task.title, companyName: task.companyName, assigneeName: task.assigneeName, createdByName: task.createdByName, log })))
      .sort((left, right) => right.log.createdAt.toMillis() - left.log.createdAt.toMillis())
      .slice(0, 8);

    const recentActivities: RecentActivityItem[] = [
      ...visibleCompanyLogs.map((log) => ({
        id: `company-${log.id}`,
        kind: "company" as const,
        occurredAt: log.occurredAt.toDate(),
        title: log.title || "活動ログ",
        subtitle: [companyNameMap.get(log.companyId) ?? "会社未設定", log.actorNames?.join(" / ") || log.userName || getUserDisplayNameById(log.userId)].filter(Boolean).join(" / "),
        href: toCompanyHref(log.companyId)
      })),
      ...taskLogs.map((item) => ({
        id: `task-${item.id}`,
        kind: "task" as const,
        occurredAt: item.log.createdAt.toDate(),
        title: item.log.title,
        subtitle: [item.taskTitle, item.companyName, item.assigneeName ? `担当: ${item.assigneeName}` : ""].filter(Boolean).join(" / "),
        href: "/tasks" as Route
      })),
      ...visibleTeleapoRecords.slice(0, 8).map((record) => ({
        id: `upload-${record.id}`,
        kind: "upload" as const,
        occurredAt: record.updatedAt.toDate(),
        title: `${record.customerName || "会社未設定"} ${record.salesDomain === "meeting" ? "商談アップロード" : "音声アップロード"}`,
        subtitle: [record.productName, getAnalysisStatusLabel(record)].filter(Boolean).join(" / "),
        href: `/sales/analysis?dealId=${createDealId(record)}` as Route
      }))
    ]
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 10);

    return {
      weekEvents,
      todayEvents,
      weekTasks,
      todayTasks,
      visibleCompanyLogs,
      taskLogs,
      recentActivities,
      recentAnalyses: visibleTeleapoRecords
        .sort((left, right) => right.updatedAt.toMillis() - left.updatedAt.toMillis())
        .slice(0, 5),
      companyNameMap,
      dueSummary,
      overdueTasks: openTasks.filter(isTaskOverdue).slice(0, 6)
    };
  }, [companies, companyLogs, events, tasks, teleapoRecords, user]);

  const companyCheckItems = useMemo(() => {
    const activeCompanies = companies.filter((company) => !company.archivedAt);
    const latestLogByCompany = new Map<string, CompanyActivityLog>();
    companyLogs
      .filter((log) => log.source !== "system" && log.type !== "status_change")
      .forEach((log) => {
        const current = latestLogByCompany.get(log.companyId);
        if (!current || log.occurredAt.toMillis() > current.occurredAt.toMillis()) latestLogByCompany.set(log.companyId, log);
      });

    return activeCompanies
      .map((company) => ({ company, latestLog: latestLogByCompany.get(company.id) ?? null }))
      .filter((item) => item.company.nextActionAt || item.company.lastContactAt || item.latestLog)
      .sort((left, right) => getCompanyPriority(right.company, right.latestLog) - getCompanyPriority(left.company, left.latestLog))
      .slice(0, 6);
  }, [companies, companyLogs]);

  return (
    <section>
      <PageHeader
        title="Home"
        description={`${getUserDisplayName(user)}さんの今日の予定、タスク、確認する会社をまとめています。`}
        actions={
          <Link className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(236,111,139,0.18)] transition hover:bg-[#E65C7C]" href={"/tasks" as Route}>
            <Plus className="h-4 w-4" />
            新しいタスク
          </Link>
        }
      />

      <div className="mt-5"><StatusBanner message={error} type="error" /></div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr_0.8fr]">
        <Panel icon={ListChecks} title="今日やること">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && dashboard.todayTasks.length === 0 ? <EmptyLine text="今日のタスクはありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.todayTasks.map((task) => <TaskRow key={task.id} task={task} />)}
          </div>
        </Panel>

        <Panel icon={CalendarDays} title="今日の予定">
          {loading ? <SkeletonList count={3} media={false} /> : null}
          {!loading && dashboard.todayEvents.length === 0 ? <EmptyLine text="今日の予定はありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.todayEvents.map((event) => (
              <ScheduleRow
                key={event.id}
                color={event.eventType === "meeting" ? "pink" : event.eventType === "appointment" ? "blue" : "green"}
                date={formatDate(event.startAt.toDate())}
                description={event.companyName || event.location || event.assigneeName || "予定"}
                time={event.allDay ? "終日" : formatTaskTime(event.startAt.toDate())}
                title={event.title}
              />
            ))}
          </div>
        </Panel>

        <Panel icon={Clock3} title="期限が近いタスク">
          {loading ? <SkeletonList count={3} media={false} /> : null}
          {!loading ? <DueSummary summary={dashboard.dueSummary} /> : null}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel icon={Building2} title="最近動いた会社">
          {loading ? <SkeletonList count={3} media={false} /> : null}
          {!loading && companyCheckItems.length === 0 ? <EmptyLine text="最近動いた会社はありません。" /> : null}
          <div className="grid gap-3">
            {companyCheckItems.map((item) => <RecentCompanyRow company={item.company} key={item.company.id} latestLog={item.latestLog} />)}
          </div>
        </Panel>

        <Panel icon={UploadCloud} title="最近アップロードした分析">
          {loading ? <SkeletonList count={3} media={false} /> : null}
          {!loading && dashboard.recentAnalyses.length === 0 ? <EmptyLine text="最近のアップロードはありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.recentAnalyses.map((record) => <RecentAnalysisRow key={record.id} record={record} />)}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel icon={MessageSquareText} title="最近の動き">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && dashboard.recentActivities.length === 0 ? <EmptyLine text="最近の動きはまだありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.recentActivities.map((item) => <RecentActivityRow item={item} key={item.id} />)}
          </div>
        </Panel>

        <Panel icon={History} title="最近開いたページ">
          {recentPages.length === 0 ? <RecentPageFallback /> : null}
          <div className="grid gap-2">
            {recentPages.map((page) => <RecentPageRow key={page.href} page={page} />)}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof CalendarDays; children: React.ReactNode }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-[0_14px_44px_rgba(31,31,34,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#2B2B2B]">
          <Icon className="h-5 w-5 text-[#EC6F8B]" />
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-5 text-center text-sm font-semibold text-[#8A8186]">{text}</p>;
}

function DueSummary({ summary }: { summary: { today: number; tomorrow: number; overdue: number } }) {
  const rows = [
    ["今日", summary.today, "text-[#EC6F8B]"],
    ["明日", summary.tomorrow, "text-[#6F676B]"],
    ["期限切れ", summary.overdue, "text-[#D94F6E]"]
  ] as const;
  return (
    <div className="grid gap-3">
      {rows.map(([label, count, tone]) => (
        <Link className="flex items-center justify-between rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-4 py-3 transition hover:border-[#F7CAD2]" href={"/tasks" as Route} key={label}>
          <span className="text-sm font-semibold text-[#6F676B]">{label}</span>
          <span className={`text-2xl font-semibold ${tone}`}>{count}<span className="ml-1 text-xs font-semibold text-[#9A8F94]">件</span></span>
        </Link>
      ))}
    </div>
  );
}

function RecentCompanyRow({ company, latestLog }: { company: Company; latestLog: CompanyActivityLog | null }) {
  const subtitle = latestLog?.title || company.nextActionTitle || company.industry || "詳細を確認";
  return (
    <Link className="flex items-center justify-between gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={`/sales/companies?id=${company.id}&tab=timeline` as Route}>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#2B2B2B]">{company.name}</span>
        <span className="mt-1 block truncate text-sm font-medium text-[#777]">{subtitle}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#EC6F8B]" />
    </Link>
  );
}

function RecentAnalysisRow({ record }: { record: TeleapoRecord }) {
  return (
    <Link className="flex items-center justify-between gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={`/sales/analysis?dealId=${createDealId(record)}` as Route}>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#2B2B2B]">{record.customerName || "会社名未設定"}</span>
        <span className="mt-1 block truncate text-sm font-medium text-[#777]">{record.productName || record.meetingTitle || "商材未設定"}</span>
      </span>
      <span className="shrink-0 rounded-none bg-white px-2.5 py-1 text-xs font-semibold text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{getAnalysisStatusLabel(record)}</span>
    </Link>
  );
}

function RecentPageRow({ page }: { page: RecentPageItem }) {
  return (
    <Link className="flex items-center justify-between gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-4 py-3 text-sm font-semibold text-[#2B2B2B] transition hover:border-[#F7CAD2]" href={page.href as Route}>
      <span className="truncate">{page.label}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#EC6F8B]" />
    </Link>
  );
}

function RecentPageFallback() {
  const pages: RecentPageItem[] = [
    { href: "/sales/companies", label: "会社一覧", visitedAt: 0 },
    { href: "/products", label: "商材管理", visitedAt: 0 },
    { href: "/sales/analysis", label: "分析済み一覧", visitedAt: 0 },
    { href: "/tasks", label: "タスク", visitedAt: 0 }
  ];
  return (
    <div className="grid gap-2">
      {pages.map((page) => <RecentPageRow key={page.href} page={page} />)}
    </div>
  );
}

function CompanyCheckCard({ company, latestLog }: { company: Company; latestLog: CompanyActivityLog | null }) {
  const status = getCompanyCheckStatus(company, latestLog);
  return (
    <Link className="group grid min-h-52 gap-4 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFF0F3]" href={`/sales/companies?id=${company.id}&tab=timeline` as Route}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded-none px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
          <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-6 text-[#2B2B2B]">{company.name}</h3>
          <p className="mt-1 truncate text-sm font-medium text-[#777]">{[company.industry, company.primaryContactName].filter(Boolean).join(" / ") || "詳細未設定"}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#EC6F8B] transition group-hover:translate-x-0.5" />
      </div>

      <div className="grid gap-2 text-sm font-semibold text-[#6F676B]">
        <CompanyFact label="次回" value={company.nextActionTitle || "未設定"} />
        <CompanyFact label="最新ログ" value={latestLog?.title || "未登録"} />
      </div>

      <p className="mt-auto text-xs font-semibold text-[#9A8F94]">
        {company.nextActionAt ? `次回予定: ${formatDateTime(company.nextActionAt.toDate())}` : company.lastContactAt ? `最終接触: ${formatDateTime(company.lastContactAt.toDate())}` : latestLog ? `ログ: ${formatDateTime(latestLog.occurredAt.toDate())}` : "日付未設定"}
      </p>
    </Link>
  );
}

function getAnalysisStatusLabel(record: TeleapoRecord): string {
  if (record.aiAdviceStatus === "completed") return "分析済み";
  if (record.transcriptionStatus === "completed") return "文字起こし完了";
  if (record.transcriptionStatus === "failed" || record.aiAdviceStatus === "failed") return "確認が必要";
  if (record.transcriptionStatus === "uploaded" || record.transcriptionStatus === "extracting" || record.transcriptionStatus === "transcribing" || record.transcriptionStatus === "diarizing") return "処理中";
  return "分析待ち";
}

function createDealId(record: TeleapoRecord): string {
  return [record.companyId || record.customerName || "unknown-company", record.productId || record.productName || "unknown-product"].map(encodeURIComponent).join("__");
}

function CompanyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-white px-3 py-2 ring-1 ring-[#F0E7E9]">
      <p className="text-xs font-semibold text-[#8A8186]">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[#2B2B2B]">{value}</p>
    </div>
  );
}

function getCompanyPriority(company: Company, latestLog: CompanyActivityLog | null): number {
  const now = Date.now();
  const nextActionAt = company.nextActionAt?.toMillis();
  if (nextActionAt && nextActionAt <= now) return 10000 - Math.min((now - nextActionAt) / 86400000, 365);
  if (nextActionAt) return 8000 - Math.min((nextActionAt - now) / 86400000, 365);
  if (latestLog) return 5000 + latestLog.occurredAt.toMillis() / 1000000000000;
  if (company.lastContactAt) return 3000 + company.lastContactAt.toMillis() / 1000000000000;
  return 0;
}

function getCompanyCheckStatus(company: Company, latestLog: CompanyActivityLog | null): { label: string; tone: string } {
  const now = Date.now();
  const nextActionAt = company.nextActionAt?.toMillis();
  if (nextActionAt && nextActionAt <= now) return { label: "次回アクションあり", tone: "bg-[#EC6F8B] text-white" };
  if (nextActionAt) return { label: "予定あり", tone: "bg-white text-[#EC6F8B] ring-1 ring-[#F0E7E9]" };
  if (latestLog) return { label: "最近の活動", tone: "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]" };
  return { label: "要確認", tone: "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]" };
}

function ScheduleRow({ date, time, title, description, color }: { date: string; time: string; title: string; description: string; color: "pink" | "blue" | "green" }) {
  const tone = color === "blue" ? "bg-[#F1F7FF] text-[#4F78B4]" : color === "green" ? "bg-[#F4FAEF] text-[#70A55F]" : "bg-[#FFF0F3] text-[#EC6F8B]";
  return (
    <Link className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] sm:grid-cols-[116px_1fr]" href={"/calendar" as Route}>
      <span className={`grid min-h-12 place-items-center rounded-none px-2 text-center text-xs font-semibold ${tone}`}>
        <span>{date}</span>
        <span>{time}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#2B2B2B]">{title}</span>
        <span className="mt-1 block truncate text-sm font-medium text-[#777]">{description}</span>
      </span>
    </Link>
  );
}

function TaskRow({ task }: { task: Task }) {
  const due = task.dueDate?.toDate();
  const assignee = getUserDisplayNameById(task.assigneeId, task.assigneeName);
  return (
    <Link className="flex items-center gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={"/tasks" as Route}>
      <span className={`h-12 w-1 shrink-0 rounded-none ${task.status === "completed" ? "bg-[#B8B8B8]" : task.aiGenerated ? "bg-[#EC6F8B]" : "bg-[#7EA0D6]"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-[#2B2B2B]">{task.title}</span>
        <span className="mt-1 block truncate text-sm font-medium text-[#777]">{[task.companyName, assignee].filter(Boolean).join(" / ")}</span>
      </span>
      <span className="rounded-none bg-white px-3 py-1 text-xs font-semibold text-[#EC6F8B]">{due ? formatDateTime(due) : "期限なし"}</span>
    </Link>
  );
}

function RecentActivityRow({ item }: { item: RecentActivityItem }) {
  return (
    <Link className="grid gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={item.href}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold text-[#EC6F8B]">{item.kind === "company" ? "会社" : item.kind === "upload" ? "アップロード" : "タスク"}</span>
        <span className="shrink-0 text-xs font-medium text-[#999]">{formatDateTime(item.occurredAt)}</span>
      </div>
      <p className="truncate font-semibold text-[#2B2B2B]">{item.title}</p>
      <p className="truncate text-sm font-medium text-[#777]">{item.subtitle}</p>
    </Link>
  );
}
