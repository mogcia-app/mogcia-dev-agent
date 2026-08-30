"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, Bot, Building2, CalendarDays, Clock3, History, ListChecks, MessageSquareText, Plus, UploadCloud } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { SkeletonList } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";
import { subscribeAgentRuns } from "@/lib/agent";
import { subscribeCalendarEvents } from "@/lib/calendar";
import { eventToCalendarItem, taskToCalendarItem } from "@/lib/calendar-item-mapper";
import { subscribeCompaniesMaster, subscribeRecentCompanyActivityLogsByCompany } from "@/lib/companies";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { formatTimeRange, getCategoryMeta, getMeetingMethodLabel } from "@/lib/calendar-utils";
import { leadStatusLabels, leadStatusTone } from "@/lib/lead-utils";
import { subscribeLeads } from "@/lib/leads";
import { getDueBadgeTone, isAdminUser, isSameDate, isTaskOverdue, sortTasks, startOfToday } from "@/lib/task-utils";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import { setTaskCompleted, subscribeTasks } from "@/lib/tasks";
import { getUserDisplayName, getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent, CalendarItem } from "@/types/calendar";
import type { AgentRun } from "@/types/agent";
import type { Company, CompanyActivityLog } from "@/types/company";
import type { Lead } from "@/types/lead";
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
  return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
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
  const [leads, setLeads] = useState<Lead[]>([]);
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

    const onError = (source: string) => (nextError: Error) => {
      setError(`${source}: ${nextError.message}`);
      setLoading(false);
    };
    const unsubscribeTasks = subscribeTasks((nextTasks) => {
      setTasks(nextTasks);
      setLoading(false);
    }, onError("tasks"));
    const unsubscribeEvents = subscribeCalendarEvents(user, (nextEvents) => {
      setEvents(nextEvents);
      setLoading(false);
    }, onError("calendar"));
    const unsubscribeLeads = subscribeLeads((nextLeads) => {
      setLeads(nextLeads);
      setLoading(false);
    }, onError("leads"));

    return () => {
      unsubscribeTasks();
      unsubscribeEvents();
      unsubscribeLeads();
    };
  }, [user]);

  const home = useMemo(() => {
    const todayStart = startOfToday();
    const todayEnd = endOfDay(todayStart);
    const weekEnd = endOfHomeWeek(todayStart);
    const visibleTasks = tasks.filter((task) => canSeeTask(task, user));
    const visibleEvents = events.filter((event) => canSeeEvent(event, user));
    const openTasks = visibleTasks.filter(isOpenTask);
    const calendarItems = visibleEvents.map(eventToCalendarItem).filter((item) => item.status !== "cancelled");
    const todayEvents = calendarItems
      .filter((item) => item.startAt >= todayStart && item.startAt <= todayEnd)
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime())
      .slice(0, 5);
    const todayTasks = sortTasks(
      openTasks.filter((task) => {
        const due = task.dueDate?.toDate();
        return due && due >= todayStart && due <= todayEnd;
      }),
      "dueAsc"
    ).slice(0, 6);
    const overdueTasks = openTasks.filter((task) => {
      const due = task.dueDate?.toDate();
      return Boolean(due && due < todayStart);
    });
    const tomorrowTasks = openTasks.filter((task) => {
      const due = task.dueDate?.toDate();
      return Boolean(due && due >= startOfTomorrow() && due <= endOfTomorrow());
    });
    const weekEvents = calendarItems
      .filter((item) => item.startAt >= todayStart && item.startAt <= weekEnd)
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
    const recommendations = buildRecommendations(leads).slice(0, 5);
    return { todayStart, weekEnd, todayEvents, todayTasks, overdueTasks, tomorrowTasks, weekEvents, recommendations };
  }, [events, leads, tasks, user]);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-6 pt-2 sm:px-6 sm:pt-3">
      <Greeting user={user} />
      <div className="mt-5"><StatusBanner message={error} type="error" /></div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HomeMetric href="/calendar" icon={CalendarDays} label="今日の予定" tone="pink" value={`${home.todayEvents.length}件`} detail={home.todayEvents[0] ? formatTimeRange(home.todayEvents[0].startAt, home.todayEvents[0].endAt, home.todayEvents[0].allDay) : "予定なし"} />
        <HomeMetric href="/tasks" icon={ListChecks} label="今日のタスク" tone="green" value={`${home.todayTasks.length}件`} detail={home.todayTasks[0]?.title || "期限今日のタスクなし"} />
        <HomeMetric href="/tasks" icon={Clock3} label="期限切れ" tone="orange" value={`${home.overdueTasks.length}件`} detail={home.overdueTasks.length ? "先に確認してください" : "遅れはありません"} />
        <HomeMetric href="/leads" icon={MessageSquareText} label="要対応" tone="blue" value={`${home.recommendations.length}件`} detail={home.recommendations[0]?.lead.companyName || "営業状況は安定しています"} />
      </div>

      <HomeSection action={<Link className="text-sm font-medium text-[#EC6F8B]" href={"/calendar" as Route}>カレンダーを見る</Link>} className="mt-6" description={`${formatDate(home.todayStart)} - ${formatDate(home.weekEnd)}`} icon={CalendarDays} title="今週の予定">
        {loading ? <SkeletonList count={4} media={false} /> : null}
        {!loading && home.weekEvents.length === 0 ? <CompactEmpty action="/calendar" actionLabel="＋ 予定を追加" text="今週の予定はありません" /> : null}
        {!loading && home.weekEvents.length ? <WeekSchedule start={home.todayStart} events={home.weekEvents} /> : null}
      </HomeSection>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <HomeSection action={<Link className="text-sm font-medium text-[#EC6F8B]" href={"/calendar" as Route}>カレンダーを見る</Link>} count={home.todayEvents.length} icon={CalendarDays} title="今日の予定">
          {loading ? <SkeletonList count={3} media={false} /> : null}
          {!loading && home.todayEvents.length === 0 ? <CompactEmpty action="/calendar" actionLabel="＋ 予定を追加" text="今日の予定はありません" /> : null}
          <div className="divide-y divide-[#F0E7E9]">
            {home.todayEvents.map((item) => <TodayEventRow item={item} key={item.id} />)}
          </div>
        </HomeSection>

        <HomeSection action={<Link className="text-sm font-medium text-[#EC6F8B]" href={"/tasks" as Route}>タスク一覧を見る</Link>} count={home.todayTasks.length} icon={ListChecks} title="今日のタスク">
          {loading ? <SkeletonList count={4} media={false} /> : null}
          {!loading && home.todayTasks.length === 0 ? <CompactEmpty action="/tasks" actionLabel="＋ タスクを追加" text="今日のタスクはありません" /> : null}
          <div className="divide-y divide-[#F0E7E9]">
            {home.todayTasks.map((task) => <TodayTaskRow key={task.id} task={task} />)}
          </div>
        </HomeSection>
      </div>

      <div className="mt-6">
        <HomeSection description="今日動いた方がよさそうな営業先をまとめました。" icon={Bot} title="AIおすすめアクション">
          {loading ? <SkeletonList count={3} media={false} /> : null}
          {!loading && home.recommendations.length === 0 ? <CompactEmpty text="今すぐおすすめする対応はありません。営業状況は順調です。" /> : null}
          <div className="divide-y divide-[#F0E7E9]">
            {home.recommendations.map((item) => <RecommendationRow item={item} key={item.lead.id} />)}
          </div>
        </HomeSection>
      </div>
    </section>
  );
}

type HomeRecommendation = {
  lead: Lead;
  priority: "優先" | "おすすめ" | "余裕があれば";
  reason: string;
  actionLabel: string;
};

function Greeting({ user }: { user: User | null }) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "お疲れさまです";
  const name = user ? `${getUserDisplayName(user)}さん、` : "";
  return (
    <header className="rounded-lg border border-[#E8E3E1] bg-white p-5 shadow-[0_10px_28px_rgba(31,31,34,0.04)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Image alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-[#F0E7E9]" height={56} src="/m-dev-agent.png" width={56} />
          <div className="min-w-0">
            <p className="truncate text-xl font-medium tracking-normal text-[#222]">{name}{greeting}</p>
            <p className="mt-2 text-sm font-medium text-[#7A7176]">{formatDate(now)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" href={"/calendar" as Route}><Plus className="h-4 w-4" />予定を追加</Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#374151]" href={"/tasks" as Route}><ListChecks className="h-4 w-4 text-[#16A34A]" />タスク</Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#374151]" href={"/leads" as Route}><Building2 className="h-4 w-4 text-[#2563EB]" />営業リスト</Link>
        </div>
      </div>
    </header>
  );
}

function HomeSection({ title, icon: Icon, count, action, description, className = "", children }: { title: string; icon: typeof CalendarDays; count?: number; action?: React.ReactNode; description?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-lg border border-[#E8E3E1] bg-white p-5 shadow-[0_10px_28px_rgba(31,31,34,0.04)] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium text-[#2B2B2B]"><Icon className="h-5 w-5 text-[#EC6F8B]" />{title}{typeof count === "number" ? <span className="ml-1 text-sm font-medium text-[#9A9296]">{count}件</span> : null}</h2>
          {description ? <p className="mt-1 text-sm font-medium leading-6 text-[#8A8186]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HomeMetric({ href, icon: Icon, label, value, detail, tone }: { href: string; icon: typeof CalendarDays; label: string; value: string; detail: string; tone: "pink" | "green" | "orange" | "blue" }) {
  const toneClass = tone === "pink" ? "bg-[#FFF0F3] text-[#EC6F8B]" : tone === "green" ? "bg-[#ECFDF3] text-[#16A34A]" : tone === "orange" ? "bg-[#FFF7ED] text-[#EA580C]" : "bg-[#EFF6FF] text-[#2563EB]";
  return (
    <Link className="group rounded-lg border border-[#E8E3E1] bg-white p-4 shadow-[0_8px_24px_rgba(31,31,34,0.04)] transition hover:border-[#F7CAD2]" href={href as Route}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClass}`}><Icon className="h-5 w-5" /></span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#C7BFC3] transition group-hover:translate-x-0.5 group-hover:text-[#EC6F8B]" />
      </div>
      <p className="mt-4 text-sm font-medium text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-normal text-[#111827]">{value}</p>
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-[#7A7176]">{detail}</p>
    </Link>
  );
}

function TodayEventRow({ item }: { item: CalendarItem }) {
  const meta = getCategoryMeta(item.category);
  const title = [item.companyName || item.relatedName, item.productName || item.title].filter(Boolean).join("｜") || item.title || "無題の予定";
  return (
    <Link className="grid gap-3 py-3 transition hover:bg-[#FFFBFC] sm:grid-cols-[112px_1fr_auto]" href={"/calendar" as Route}>
      <span className="text-sm font-semibold text-[#2B2B2B]">{formatTimeRange(item.startAt, item.endAt, item.allDay)}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-xs font-semibold text-[#8A8186]"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{meta.label}{item.meetingMethod ? ` × ${getMeetingMethodLabel(item.meetingMethod)}` : ""}</span>
        <span className="mt-1 block truncate text-sm font-medium text-[#2B2B2B]">{title}</span>
      </span>
      {item.meetingUrl ? <a className="inline-flex h-8 items-center justify-center rounded-lg bg-[#EC6F8B] px-3 text-xs font-medium text-white" href={item.meetingUrl} rel="noreferrer" target="_blank">参加</a> : null}
    </Link>
  );
}

function TodayTaskRow({ task }: { task: Task }) {
  const completed = task.status === "completed";
  return (
    <div className="flex items-center gap-3 py-3">
      <button className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${completed ? "border-[#EC6F8B] bg-[#FFF2F5] text-[#EC6F8B]" : "border-[#CFC7CB] text-transparent"}`} onClick={() => void setTaskCompleted(task, !completed)} type="button" aria-label={completed ? "未完了に戻す" : "完了にする"}>
        <ListChecks className="h-3.5 w-3.5" />
      </button>
      <Link className="min-w-0 flex-1" href={"/tasks" as Route}>
        <span className={`block truncate text-sm font-medium ${completed ? "text-[#A9A1A5] line-through" : "text-[#2B2B2B]"}`}>{task.title || "タイトルなし"}</span>
        {[task.companyName, task.productName].filter(Boolean).length ? <span className="mt-1 block truncate text-xs font-semibold text-[#8A8186]">{[task.companyName, task.productName].filter(Boolean).join(" / ")}</span> : null}
      </Link>
    </div>
  );
}

function RecommendationRow({ item }: { item: HomeRecommendation }) {
  const lead = item.lead;
  return (
    <div className="grid gap-3 py-4 lg:grid-cols-[96px_minmax(0,1fr)_auto] lg:items-center">
      <span className={`w-fit rounded-lg px-3 py-1 text-xs font-semibold ${item.priority === "優先" ? "bg-[#EC6F8B] text-white" : "bg-[#FFF2F5] text-[#EC6F8B]"}`}>{item.priority}</span>
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-[#222]">{lead.companyName}</h3>
        <p className="mt-1 text-sm font-semibold leading-6 text-[#5F565B]">{item.reason}</p>
        <p className="mt-2 text-xs font-medium text-[#8A8186]">{[lead.productName, lead.lastActivityAt ? `最終接触 ${relativeDays(lead.lastActivityAt.toDate())}` : "最終接触 未登録", leadStatusLabels[lead.status]].filter(Boolean).join(" / ")}</p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {lead.phone ? <a className="inline-flex h-9 items-center rounded-lg border border-[#F7CAD2] px-3 text-xs font-medium text-[#EC6F8B]" href={`tel:${lead.phone}`}>電話する</a> : null}
        {lead.email ? <a className="inline-flex h-9 items-center rounded-lg border border-[#F7CAD2] px-3 text-xs font-medium text-[#EC6F8B]" href={`mailto:${lead.email}`}>メールする</a> : null}
        {item.actionLabel === "予定を設定" ? <Link className="inline-flex h-9 items-center rounded-lg border border-[#F7CAD2] px-3 text-xs font-medium text-[#EC6F8B]" href={"/calendar" as Route}>予定を設定</Link> : null}
        <Link className="inline-flex h-9 items-center rounded-lg bg-[#EC6F8B] px-3 text-xs font-medium text-white" href={`/leads?leadId=${lead.id}&tab=activity` as Route}>詳細</Link>
      </div>
    </div>
  );
}

function WeekSchedule({ start, events }: { start: Date; events: CalendarItem[] }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-7 gap-3">
        {days.map((day) => {
          const dayEvents = events.filter((item) => isSameDate(item.startAt, day));
          const today = isSameDate(day, new Date());
          return (
            <div className={`min-h-32 rounded-lg border p-3 ${today ? "border-[#F7CAD2] bg-[#FFF7F9]" : "border-[#F0E7E9] bg-[#FCFBFA]"}`} key={day.toISOString()}>
              <p className="text-xs font-semibold text-[#8A8186]">{day.toLocaleDateString("ja-JP", { weekday: "short" })} {day.getDate()}</p>
              <p className="mt-1 text-xs font-medium text-[#B0A7AB]">{dayEvents.length ? `${dayEvents.length}件` : "予定なし"}</p>
              <div className="mt-3 grid gap-2">
                {dayEvents.slice(0, 3).map((item) => {
                  const meta = getCategoryMeta(item.category);
                  return <Link className="min-w-0 border-l-2 bg-white px-2 py-1 text-xs font-medium text-[#2B2B2B]" href={"/calendar" as Route} key={item.id} style={{ borderLeftColor: dotColor(meta.dot) }}><span className="block truncate">{item.allDay ? "終日" : item.startAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} {item.companyName || item.relatedName || item.title}</span></Link>;
                })}
                {dayEvents.length > 3 ? <p className="text-xs font-medium text-[#EC6F8B]">＋{dayEvents.length - 3}件</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactEmpty({ text, action, actionLabel }: { text: string; action?: string; actionLabel?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#F0E7E9] bg-[#FFFBFC] px-4 py-4 text-sm font-medium text-[#8A8186]">
      <p>{text}</p>
      {action && actionLabel ? <Link className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#F7CAD2] bg-white px-3 text-xs font-semibold text-[#EC6F8B]" href={action as Route}>{actionLabel}</Link> : null}
    </div>
  );
}

function buildRecommendations(leads: Lead[]): HomeRecommendation[] {
  const now = Date.now();
  return leads
    .filter((lead) => lead.status !== "won" && lead.status !== "lost")
    .flatMap((lead): HomeRecommendation[] => {
      const last = lead.lastActivityAt?.toMillis() ?? lead.updatedAt.toMillis();
      const days = Math.floor((now - last) / 86400000);
      if (lead.nextActionAt && lead.nextActionAt.toMillis() > now) return [];
      if (lead.status === "appointment" && !lead.nextActionAt) return [{ lead, priority: "優先", actionLabel: "予定を設定", reason: "アポ獲得後、次回予定が設定されていません。今日中に日程調整の連絡がおすすめです。" }];
      if (lead.status === "document_sent" && days >= 7) return [{ lead, priority: "おすすめ", actionLabel: "フォロー", reason: `資料送付から${days}日経過しています。そろそろフォローしてみてもよさそうです。` }];
      if ((lead.status === "contacting" || lead.status === "hold") && days >= 5) return [{ lead, priority: "おすすめ", actionLabel: "フォロー", reason: `最終接触から${days}日経過しています。状況確認の連絡がおすすめです。` }];
      if (lead.status === "considering" && days >= 7) return [{ lead, priority: "優先", actionLabel: "フォロー", reason: `検討中のまま${days}日動きがありません。判断状況を確認するとよさそうです。` }];
      if (lead.nextActionAt && lead.nextActionAt.toMillis() <= now) return [{ lead, priority: "優先", actionLabel: "フォロー", reason: "次回対応の予定日を過ぎています。今日の対応候補に入れてください。" }];
      return [];
    })
    .sort((left, right) => recommendationWeight(right) - recommendationWeight(left));
}

function recommendationWeight(item: HomeRecommendation) {
  const base = item.priority === "優先" ? 100 : item.priority === "おすすめ" ? 60 : 20;
  return base + (item.lead.lastActivityAt ? Math.min(30, Math.floor((Date.now() - item.lead.lastActivityAt.toMillis()) / 86400000)) : 0);
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function endOfHomeWeek(start: Date): Date {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function relativeDays(date: Date) {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return "今日";
  return `${days}日前`;
}

function dotColor(className: string) {
  const match = className.match(/\[#([0-9A-Fa-f]{6})\]/);
  return match ? `#${match[1]}` : "#EC6F8B";
}

function LeadActionRow({ lead }: { lead: Lead }) {
  return (
    <Link className="flex items-center justify-between gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={`/leads?id=${lead.id}&tab=activity` as Route}>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`rounded-none px-2.5 py-1 text-xs font-semibold ${leadStatusTone(lead.status)}`}>{leadStatusLabels[lead.status]}</span>
          <span className="truncate font-semibold text-[#2B2B2B]">{lead.companyName}</span>
        </span>
        <span className="mt-1 block truncate text-sm font-medium text-[#777]">{[lead.contactName, lead.productName, lead.nextActionTitle].filter(Boolean).join(" / ") || "詳細を確認"}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-[#EC6F8B]">{lead.nextActionAt ? formatDateTime(lead.nextActionAt.toDate()) : "予定未設定"}</span>
    </Link>
  );
}

function AgentActivitySummary({ activity }: { activity: { running: number; approval: number; completedToday: number; recent: AgentRun[] } }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <AgentMetric label="実行中" value={activity.running} tone="text-[#4E76AA]" />
        <AgentMetric label="確認待ち" value={activity.approval} tone="text-[#9B7332]" />
        <AgentMetric label="本日完了" value={activity.completedToday} tone="text-[#5E9B61]" />
      </div>
      <div className="grid gap-3">
        {activity.recent.filter((run) => run.status === "running" || run.status === "requires_approval" || run.requiresApproval).slice(0, 2).map((run) => (
          <Link className="flex items-center justify-between gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]" href={`/agent?runId=${run.id}` as Route} key={run.id}>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[#2B2B2B]">{run.title}</span>
              <span className="mt-1 block truncate text-sm font-medium text-[#777]">{formatAgentStatus(run.status)} / {run.progress ?? 0}%</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[#EC6F8B]" />
          </Link>
        ))}
        {activity.running === 0 && activity.approval === 0 ? <EmptyLine text="確認が必要なAgent Runはありません。" /> : null}
      </div>
    </div>
  );
}

function AgentMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Link className="flex items-center justify-between rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-4 py-3 transition hover:border-[#F7CAD2]" href={"/agent" as Route}>
      <span className="text-sm font-semibold text-[#6F676B]">{label}</span>
      <span className={`text-base font-semibold ${tone}`}>{value}<span className="ml-1 text-xs font-semibold text-[#9A8F94]">件</span></span>
    </Link>
  );
}

function formatAgentStatus(status: AgentRun["status"]): string {
  if (status === "running") return "実行中";
  if (status === "requires_approval") return "確認待ち";
  if (status === "completed") return "完了";
  if (status === "error") return "エラー";
  if (status === "cancelled") return "キャンセル";
  return "受付済み";
}

function Panel({ title, icon: Icon, bodyClassName = "", children }: { title: string; icon: typeof CalendarDays; bodyClassName?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-[0_14px_44px_rgba(31,31,34,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#2B2B2B]">
          <Icon className="h-5 w-5 text-[#EC6F8B]" />
          {title}
        </h2>
      </div>
      <div className={bodyClassName}>{children}</div>
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
          <span className={`text-base font-semibold ${tone}`}>{count}<span className="ml-1 text-xs font-semibold text-[#9A8F94]">件</span></span>
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
          <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6 text-[#2B2B2B]">{company.name}</h3>
          <p className="mt-1 truncate text-sm font-medium text-[#777]">{[company.industry, company.primaryContactName].filter(Boolean).join(" / ") || "詳細未設定"}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#EC6F8B] transition group-hover:translate-x-0.5" />
      </div>

      <div className="grid gap-2 text-sm font-semibold text-[#6F676B]">
        <CompanyFact label="次回予定" value={company.nextActionTitle || "未設定"} />
        <CompanyFact label="最新ログ" value={latestLog?.title || "未登録"} />
      </div>

      <p className="mt-auto text-xs font-semibold text-[#9A8F94]">
        {company.nextActionAt ? `予定日時: ${formatDateTime(company.nextActionAt.toDate())}` : company.lastContactAt ? `最終接触: ${formatDateTime(company.lastContactAt.toDate())}` : latestLog ? `ログ: ${formatDateTime(latestLog.occurredAt.toDate())}` : "日付未設定"}
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
  if (nextActionAt && nextActionAt <= now) return { label: "次回予定あり", tone: "bg-[#EC6F8B] text-white" };
  if (nextActionAt) return { label: "予定あり", tone: "bg-white text-[#EC6F8B] ring-1 ring-[#F0E7E9]" };
  if (latestLog) return { label: "最近の活動", tone: "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]" };
  return { label: "要確認", tone: "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]" };
}

function ScheduleRow({ item }: { item: CalendarItem }) {
  const meta = getCategoryMeta(item.category);
  const href = item.sourceCollection === "tasks" ? "/tasks" : "/calendar";
  const description = [item.companyName, item.projectName, item.location, item.assigneeName].filter(Boolean).join(" / ") || meta.label;
  return (
    <Link className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] sm:grid-cols-[116px_1fr]" href={href as Route}>
      <span className={`grid min-h-12 place-items-center rounded-none px-2 text-center text-xs font-semibold ${meta.soft} ${meta.text}`}>
        <span>{formatDate(item.startAt)}</span>
        {item.allDay ? <span>終日</span> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
          <span className="block truncate font-semibold text-[#2B2B2B]">{item.title || "無題の予定"}</span>
        </span>
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
      <span className={`shrink-0 rounded-none border px-3 py-1 text-xs font-semibold ${getDueBadgeTone(task)}`}>{due ? formatDateTime(due) : "期限なし"}</span>
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
