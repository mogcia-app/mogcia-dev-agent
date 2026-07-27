"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { AlertCircle, ArrowRight, Building2, CalendarDays, CheckCircle2, Clock3, ListChecks, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonCard, SkeletonList } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";
import { subscribeCalendarEvents } from "@/lib/calendar";
import { subscribeCompaniesMaster } from "@/lib/companies";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { formatTaskTime, isAdminUser, isSameDate, isTaskOverdue, sortTasks, startOfToday } from "@/lib/task-utils";
import { subscribeTasks } from "@/lib/tasks";
import type { CalendarEvent } from "@/types/calendar";
import type { Company } from "@/types/company";
import type { Task } from "@/types/task";

type RecentItem = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  at: Date;
  href: Route;
};

function userName(user: User | null): string {
  if (!user) return "ログインユーザー";
  return user.displayName || user.email?.split("@")[0] || "ログインユーザー";
}

function endOfToday(): Date {
  const end = startOfToday();
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
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

export function HomePageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
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

    const unsubscribeTasks = subscribeTasks(
      (nextTasks) => {
        setTasks(nextTasks);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
    const unsubscribeEvents = subscribeCalendarEvents(
      (nextEvents) => {
        setEvents(nextEvents);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
    const unsubscribeCompanies = subscribeCompaniesMaster(
      (nextCompanies) => {
        setCompanies(nextCompanies);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeTasks();
      unsubscribeEvents();
      unsubscribeCompanies();
    };
  }, [user]);

  const dashboard = useMemo(() => {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const visibleTasks = tasks.filter((task) => canSeeTask(task, user));
    const visibleEvents = events.filter((event) => canSeeEvent(event, user));
    const openTasks = visibleTasks.filter(isOpenTask);
    const todayTasks = sortTasks(openTasks.filter((task) => task.dueDate && isSameDate(task.dueDate.toDate(), todayStart)), "dueAsc").slice(0, 5);
    const overdueTasks = sortTasks(openTasks.filter(isTaskOverdue), "dueAsc");
    const todayEvents = visibleEvents
      .filter((event) => {
        const start = event.startAt.toDate();
        return start >= todayStart && start <= todayEnd;
      })
      .sort((left, right) => left.startAt.toMillis() - right.startAt.toMillis())
      .slice(0, 6);
    const nextCompanies = companies
      .filter((company) => !company.archivedAt && company.nextActionAt)
      .sort((left, right) => (left.nextActionAt?.toMillis() ?? 0) - (right.nextActionAt?.toMillis() ?? 0))
      .slice(0, 4);

    const recentItems: RecentItem[] = [
      ...visibleTasks.slice(0, 10).map((task) => ({
        id: `task-${task.id}`,
        label: "タスク",
        title: task.title,
        subtitle: task.companyName || task.assigneeName || "担当未設定",
        at: task.updatedAt.toDate(),
        href: "/tasks" as Route
      })),
      ...visibleEvents.slice(0, 10).map((event) => ({
        id: `event-${event.id}`,
        label: "予定",
        title: event.title,
        subtitle: event.companyName || event.assigneeName || "予定",
        at: event.updatedAt.toDate(),
        href: "/calendar" as Route
      })),
      ...companies.slice(0, 10).map((company) => ({
        id: `company-${company.id}`,
        label: "会社",
        title: company.name,
        subtitle: company.internalOwnerName || company.industry || "会社情報",
        at: company.updatedAt.toDate(),
        href: "/sales/companies" as Route
      }))
    ]
      .sort((left, right) => right.at.getTime() - left.at.getTime())
      .slice(0, 6);

    return {
      todayEvents,
      todayTasks,
      overdueTasks,
      nextCompanies,
      recentItems,
      stats: {
        todayEvents: todayEvents.length,
        openTasks: openTasks.length,
        attention: overdueTasks.length + nextCompanies.filter((company) => company.nextActionAt && company.nextActionAt.toDate() <= todayEnd).length,
        companies: companies.filter((company) => !company.archivedAt).length
      }
    };
  }, [companies, events, tasks, user]);

  const guidance = useMemo(() => {
    if (dashboard.overdueTasks.length > 0) return `期限切れのタスクが${dashboard.overdueTasks.length}件あります。まずここだけ片づけるのが良さそうです。`;
    if (dashboard.todayEvents.length > 0) return `今日の予定は${dashboard.todayEvents.length}件です。予定の前後にタスク確認の時間を置くと動きやすいです。`;
    if (dashboard.todayTasks.length > 0) return `今日のタスクは${dashboard.todayTasks.length}件です。上から順に終わらせていきましょう。`;
    return "今日はまだ予定や期限が少なめです。商材・会社・ナレッジの整理に使うと良さそうです。";
  }, [dashboard.overdueTasks.length, dashboard.todayEvents.length, dashboard.todayTasks.length]);

  return (
    <section className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader
        title="Home"
        description={`${userName(user)}さんの今日の予定、タスク、要対応をまとめています。`}
        actions={
          <Link className="inline-flex h-11 items-center gap-2 rounded-full bg-[#EC6F8B] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(236,111,139,0.22)] transition hover:bg-[#E65C7C]" href={"/tasks" as Route}>
            <Plus className="h-4 w-4" />
            新しいタスク
          </Link>
        }
      />

      <div className="mt-5"><StatusBanner message={error} type="error" /></div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <MetricCard label="今日の予定" value={dashboard.stats.todayEvents} icon={CalendarDays} />
        <MetricCard label="未完了タスク" value={dashboard.stats.openTasks} icon={ListChecks} />
        <MetricCard label="要対応" value={dashboard.stats.attention} icon={AlertCircle} />
        <MetricCard label="登録会社" value={dashboard.stats.companies} icon={Building2} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-5">
          <Panel
            actionHref={"/calendar" as Route}
            actionLabel="カレンダーへ"
            icon={CalendarDays}
            title="今日の予定"
          >
            {loading ? <SkeletonList count={3} media={false} /> : null}
            {!loading && dashboard.todayEvents.length === 0 ? <EmptyLine text="今日の予定はまだありません。" /> : null}
            <div className="grid gap-3">
              {dashboard.todayEvents.map((event) => (
                <ScheduleRow
                  key={event.id}
                  color={event.eventType === "meeting" ? "pink" : event.eventType === "appointment" ? "blue" : "green"}
                  description={event.companyName || event.location || event.assigneeName || "予定"}
                  time={event.allDay ? "終日" : formatTaskTime(event.startAt.toDate())}
                  title={event.title}
                />
              ))}
            </div>
          </Panel>

          <Panel actionHref={"/tasks" as Route} actionLabel="タスクへ" icon={ListChecks} title="今日のタスク">
            {loading ? <SkeletonList count={3} media /> : null}
            {!loading && dashboard.todayTasks.length === 0 ? <EmptyLine text="今日が期限のタスクはありません。" /> : null}
            <div className="grid gap-3">
              {dashboard.todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel icon={Sparkles} title="今日の進め方">
            <div className="rounded-lg border border-[#F7CAD2] bg-[#FFF0F3] p-4">
              <p className="text-sm font-bold leading-6 text-[#7A434D]">{guidance}</p>
            </div>
          </Panel>

          <Panel actionHref={"/sales/companies" as Route} actionLabel="会社一覧へ" icon={AlertCircle} title="要対応">
            {loading ? <SkeletonCard lines={3} /> : null}
            {!loading && dashboard.overdueTasks.length === 0 && dashboard.nextCompanies.length === 0 ? <EmptyLine text="急ぎの確認事項はありません。" /> : null}
            <div className="grid gap-3">
              {dashboard.overdueTasks.slice(0, 3).map((task) => (
                <AttentionRow href={"/tasks" as Route} key={task.id} label="期限切れ" title={task.title} />
              ))}
              {dashboard.nextCompanies.map((company) => (
                <AttentionRow
                  href={"/sales/companies" as Route}
                  key={company.id}
                  label={company.nextActionAt ? formatDateTime(company.nextActionAt.toDate()) : "次回"}
                  title={`${company.name} / ${company.nextActionTitle || "次回アクション"}`}
                />
              ))}
            </div>
          </Panel>

        </div>
      </div>

      <Panel actionHref={"/sales/companies" as Route} actionLabel="営業ページへ" className="mt-5" icon={Clock3} title="最近の動き">
        {!loading && dashboard.recentItems.length === 0 ? <EmptyLine text="最近の更新はまだありません。" /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.recentItems.map((item) => (
            <Link className="rounded-lg border border-[#F0E7E9] bg-white p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFFBFC]" href={item.href} key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]">{item.label}</span>
                <span className="text-xs font-semibold text-[#999]">{formatDateTime(item.at)}</span>
              </div>
              <h3 className="mt-3 truncate font-bold text-[#2B2B2B]">{item.title}</h3>
              <p className="mt-1 truncate text-sm font-semibold text-[#777]">{item.subtitle}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CalendarDays }) {
  return (
    <div className="rounded-lg border border-[#F0E7E9] bg-white p-4 shadow-[0_14px_34px_rgba(31,31,34,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#777]">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-md bg-[#FFF0F3] text-[#EC6F8B]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#2B2B2B]">{value}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, actionHref, actionLabel, className = "", children }: { title: string; icon: typeof CalendarDays; actionHref?: Route; actionLabel?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-lg border border-[#F0E7E9] bg-white p-5 shadow-[0_14px_44px_rgba(31,31,34,0.05)] ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#2B2B2B]">
          <Icon className="h-5 w-5 text-[#EC6F8B]" />
          {title}
        </h2>
        {actionHref && actionLabel ? (
          <Link className="inline-flex items-center gap-1 text-sm font-bold text-[#EC6F8B]" href={actionHref}>
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-5 text-center text-sm font-bold text-[#8A8186]">{text}</p>;
}

function ScheduleRow({ time, title, description, color }: { time: string; title: string; description: string; color: "pink" | "blue" | "green" }) {
  const tone = color === "blue" ? "bg-[#F1F7FF] text-[#4F78B4]" : color === "green" ? "bg-[#F4FAEF] text-[#70A55F]" : "bg-[#FFF0F3] text-[#EC6F8B]";
  return (
    <div className="grid gap-3 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4 sm:grid-cols-[72px_1fr]">
      <span className={`grid h-11 place-items-center rounded-md text-sm font-bold ${tone}`}>{time}</span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-[#2B2B2B]">{title}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-[#777]">{description}</span>
      </span>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const due = task.dueDate?.toDate();
  return (
    <Link className="flex items-center gap-3 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] hover:bg-white" href={"/tasks" as Route}>
      <span className="grid h-10 w-10 place-items-center rounded-md bg-white text-[#EC6F8B]">
        {task.status === "completed" ? <CheckCircle2 className="h-5 w-5" /> : <ListChecks className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-[#2B2B2B]">{task.title}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-[#777]">{task.companyName || task.assigneeName || "担当未設定"}</span>
      </span>
      <span className="rounded-full bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]">{due ? `${formatTaskTime(due)}まで` : "期限なし"}</span>
    </Link>
  );
}

function AttentionRow({ href, label, title }: { href: Route; label: string; title: string }) {
  return (
    <Link className="flex items-center gap-3 rounded-lg border border-[#F7CAD2] bg-[#FFF8F9] p-3 transition hover:bg-[#FFF0F3]" href={href}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-[#EC6F8B]">
        <AlertCircle className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-[#EC6F8B]">{label}</span>
        <span className="mt-1 block truncate text-sm font-bold text-[#2B2B2B]">{title}</span>
      </span>
    </Link>
  );
}
