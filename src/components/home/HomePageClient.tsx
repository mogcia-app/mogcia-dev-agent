"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { Building2, CalendarDays, CheckCircle2, Clock3, ListChecks, MessageSquareText, Plus } from "lucide-react";
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
import { subscribeTasks } from "@/lib/tasks";
import { getUserDisplayName, getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent } from "@/types/calendar";
import type { Company, CompanyActivityLog } from "@/types/company";
import type { Task, TaskProgressLog } from "@/types/task";

type TaskLogItem = {
  id: string;
  taskId: string;
  taskTitle: string;
  companyName?: string | null;
  assigneeName?: string;
  createdByName?: string;
  log: TaskProgressLog;
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

function formatDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}

function canSeeTask(task: Task, user: User | null): boolean {
  if (!user) return false;
  if (isAdminUser(user.uid)) return true;
  return task.assigneeId === user.uid || task.createdBy === user.uid;
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

export function HomePageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyLogs, setCompanyLogs] = useState<CompanyActivityLog[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
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

    return () => {
      unsubscribeTasks();
      unsubscribeEvents();
      unsubscribeCompanies();
      unsubscribeLogs();
    };
  }, [user]);

  const dashboard = useMemo(() => {
    const weekStart = startOfToday();
    const weekEnd = endOfWeek();
    const visibleTasks = tasks.filter((task) => canSeeTask(task, user));
    const visibleEvents = events.filter((event) => canSeeEvent(event, user));
    const companyNameMap = new Map(companies.map((company) => [company.id, company.name]));
    const openTasks = visibleTasks.filter(isOpenTask);

    const weekEvents = visibleEvents
      .filter((event) => {
        const start = event.startAt.toDate();
        return start >= weekStart && start <= weekEnd;
      })
      .sort((left, right) => left.startAt.toMillis() - right.startAt.toMillis())
      .slice(0, 8);

    const weekTasks = sortTasks(
      openTasks.filter((task) => {
        const due = task.dueDate?.toDate();
        return due && due >= weekStart && due <= weekEnd;
      }),
      "dueAsc"
    ).slice(0, 8);

    const visibleCompanyLogs = companyLogs
      .filter((log) => log.source !== "system" && log.type !== "status_change")
      .slice(0, 8);

    const taskLogs = visibleTasks
      .flatMap((task) => (task.progressLogs ?? []).map((log) => ({ id: `${task.id}-${log.id}`, taskId: task.id, taskTitle: task.title, companyName: task.companyName, assigneeName: task.assigneeName, createdByName: task.createdByName, log })))
      .sort((left, right) => right.log.createdAt.toMillis() - left.log.createdAt.toMillis())
      .slice(0, 8);

    return {
      weekEvents,
      weekTasks,
      visibleCompanyLogs,
      taskLogs,
      companyNameMap,
      stats: {
        weekEvents: weekEvents.length,
        weekTasks: weekTasks.length,
        openTasks: openTasks.length,
        overdueTasks: openTasks.filter(isTaskOverdue).length
      }
    };
  }, [companies, companyLogs, events, tasks, user]);

  const companyLookup = useMemo(() => {
    const activeCompanies = companies.filter((company) => !company.archivedAt);
    const keyword = companyQuery.trim().toLowerCase();
    const matches = activeCompanies
      .filter((company) => !keyword || [company.name, company.industry, company.primaryContactName].filter(Boolean).join(" ").toLowerCase().includes(keyword))
      .slice(0, 8);
    const selected = activeCompanies.find((company) => company.id === selectedCompanyId) ?? matches[0] ?? null;
    return { matches, selected };
  }, [companies, companyQuery, selectedCompanyId]);

  return (
    <section>
      <PageHeader
        title="Home"
        description={`${getUserDisplayName(user)}さんの今週の予定、タスク、営業ログをまとめています。`}
        actions={
          <Link className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(236,111,139,0.18)] transition hover:bg-[#E65C7C]" href={"/tasks" as Route}>
            <Plus className="h-4 w-4" />
            新しいタスク
          </Link>
        }
      />

      <div className="mt-5"><StatusBanner message={error} type="error" /></div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <MetricCard label="今週の予定" value={dashboard.stats.weekEvents} icon={CalendarDays} />
        <MetricCard label="今週のタスク" value={dashboard.stats.weekTasks} icon={ListChecks} />
        <MetricCard label="未完了タスク" value={dashboard.stats.openTasks} icon={Clock3} />
        <MetricCard label="期限切れ" value={dashboard.stats.overdueTasks} icon={CheckCircle2} />
      </div>

      <div className="mt-5">
        <Panel icon={Building2} title="会社確認">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <label className="block text-sm font-semibold text-[#655D62]">会社名で検索</label>
              <input className="task-input mt-2 h-12" placeholder="会社名を入力" value={companyQuery} onChange={(event) => { setCompanyQuery(event.target.value); setSelectedCompanyId(""); }} />
              <div className="mt-3 grid max-h-72 gap-2 overflow-auto">
                {companyLookup.matches.map((company) => (
                  <button className={`rounded-none border px-3 py-2 text-left text-sm font-semibold ${companyLookup.selected?.id === company.id ? "border-[#EC6F8B] bg-[#FFF0F3] text-[#2B2B2B]" : "border-[#F0E7E9] bg-white text-[#6F676B]"}`} key={company.id} onClick={() => setSelectedCompanyId(company.id)} type="button">
                    <span className="block truncate">{company.name}</span>
                    {company.industry ? <span className="mt-1 block truncate text-xs text-[#8A8186]">{company.industry}</span> : null}
                  </button>
                ))}
                {!loading && companyLookup.matches.length === 0 ? <EmptyLine text="該当する会社がありません。" /> : null}
              </div>
            </div>
            <CompanyActionSummary company={companyLookup.selected} />
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel icon={CalendarDays} title="今週の予定">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && dashboard.weekEvents.length === 0 ? <EmptyLine text="今週の予定はまだありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.weekEvents.map((event) => (
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

        <Panel icon={ListChecks} title="今週のタスク">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && dashboard.weekTasks.length === 0 ? <EmptyLine text="今週が期限のタスクはありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.weekTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel icon={Building2} title="会社の活動ログ">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && dashboard.visibleCompanyLogs.length === 0 ? <EmptyLine text="会社の活動ログはまだありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.visibleCompanyLogs.map((log) => (
              <CompanyLogRow
                companyName={dashboard.companyNameMap.get(log.companyId) ?? "会社未設定"}
                key={log.id}
                log={log}
              />
            ))}
          </div>
        </Panel>

        <Panel icon={MessageSquareText} title="タスク進捗ログ">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && dashboard.taskLogs.length === 0 ? <EmptyLine text="タスクの進捗ログはまだありません。" /> : null}
          <div className="grid gap-3">
            {dashboard.taskLogs.map((item) => (
              <TaskLogRow item={item} key={item.id} />
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CalendarDays }) {
  return (
    <div className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-[0_14px_34px_rgba(31,31,34,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#777]">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-none bg-[#FFF0F3] text-[#EC6F8B]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-[#2B2B2B]">{value}</p>
    </div>
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

function CompanyActionSummary({ company }: { company: Company | null }) {
  if (!company) return <div className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-6 text-sm font-semibold text-[#8A8186]">会社を選択すると、最終接触日と次回アクションを確認できます。</div>;
  return (
    <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-[#2B2B2B]">{company.name}</h3>
          {company.industry ? <p className="mt-1 text-sm font-medium text-[#777]">{company.industry}</p> : null}
        </div>
        <Link className="inline-flex h-9 shrink-0 items-center justify-center rounded-none border border-[#F0E7E9] bg-white px-3 text-xs font-semibold text-[#EC6F8B]" href={`/sales/companies?id=${company.id}&tab=overview` as Route}>会社詳細</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CompanyFact label="最終接触日" value={company.lastContactAt ? formatDateTime(company.lastContactAt.toDate()) : "未接触"} />
        <CompanyFact label="次回アクション" value={company.nextActionTitle || "未設定"} />
      </div>
      {company.nextActionAt ? <p className="mt-3 rounded-none bg-white px-3 py-2 text-sm font-semibold text-[#6F676B]">予定日: {formatDateTime(company.nextActionAt.toDate())}</p> : null}
    </div>
  );
}

function CompanyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-white p-3 ring-1 ring-[#F0E7E9]">
      <p className="text-xs font-semibold text-[#8A8186]">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-base font-semibold text-[#2B2B2B]">{value}</p>
    </div>
  );
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

function CompanyLogRow({ log, companyName }: { log: CompanyActivityLog; companyName: string }) {
  const actor = log.actorNames?.join(" / ") || log.userName || getUserDisplayNameById(log.userId);
  return (
    <Link className="grid gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={toCompanyHref(log.companyId)}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold text-[#EC6F8B]">{companyName}</span>
        <span className="shrink-0 text-xs font-medium text-[#999]">{formatDateTime(log.occurredAt.toDate())}</span>
      </div>
      <p className="truncate font-semibold text-[#2B2B2B]">{log.title || "活動ログ"}</p>
      <p className="truncate text-sm font-medium text-[#777]">{actor}</p>
    </Link>
  );
}

function TaskLogRow({ item }: { item: TaskLogItem }) {
  const actor = item.log.userName || getUserDisplayNameById(item.log.userId);
  return (
    <Link className="grid gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={"/tasks" as Route}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold text-[#EC6F8B]">{item.taskTitle}</span>
        <span className="shrink-0 text-xs font-medium text-[#999]">{formatDateTime(item.log.createdAt.toDate())}</span>
      </div>
      <p className="truncate font-semibold text-[#2B2B2B]">{item.log.title}</p>
      <p className="truncate text-sm font-medium text-[#777]">{[actor, item.companyName, item.assigneeName ? `担当: ${item.assigneeName}` : ""].filter(Boolean).join(" / ")}</p>
    </Link>
  );
}
