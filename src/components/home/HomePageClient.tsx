"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { Building2, CalendarDays, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { HomeTasksPanel } from "@/components/home/HomeTasksPanel";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";
import { subscribeCalendarEvents } from "@/lib/calendar";
import { eventToCalendarItem } from "@/lib/calendar-item-mapper";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getCategoryMeta } from "@/lib/calendar-utils";
import { isAdminUser, isSameDate, startOfToday } from "@/lib/task-utils";
import { getUserDisplayName } from "@/lib/user-display";
import type { CalendarEvent, CalendarItem } from "@/types/calendar";

export function HomePageClient({ initialTaskId }: { initialTaskId?: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) { window.setTimeout(() => { setError("Firebaseが未設定です。"); setLoading(false); }, 0); return undefined; }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeCalendarEvents(user, (nextEvents) => { setEvents(nextEvents); setLoading(false); }, (nextError) => { setError(nextError.message); setLoading(false); });
  }, [user]);

  const week = useMemo(() => {
    const start = startOfToday();
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    const items = events
      .filter((event) => canSeeEvent(event, user))
      .map(eventToCalendarItem)
      .filter((item) => item.status !== "cancelled" && item.startAt >= start && item.startAt <= end)
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
    return { start, end, items };
  }, [events, user]);

  return <section className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6">
    <HomeHeader user={user} />
    {error ? <div className="mt-4"><StatusBanner message={error} type="error" /></div> : null}

    <section className="mt-5 rounded-xl border border-[#E8E3E1] bg-white p-4 shadow-[0_10px_28px_rgba(31,31,34,0.04)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-base font-semibold text-[#25242A]"><CalendarDays className="h-5 w-5 text-[#EC6F8B]" />今週の予定</h2><p className="mt-1 text-sm text-[#8A8186]">{formatDate(week.start)} - {formatDate(week.end)}</p></div>
        <Link className="text-sm font-medium text-[#EC6F8B]" href={"/calendar" as Route}>カレンダーを開く →</Link>
      </div>
      {loading ? <SkeletonList count={4} media={false} /> : <WeekSchedule start={week.start} events={week.items} />}
    </section>

    <HomeTasksPanel initialTaskId={initialTaskId} key={initialTaskId ?? "tasks"} />
  </section>;
}

function HomeHeader({ user }: { user: User | null }) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "お疲れさまです";
  return <PageHeader
    title={`${user ? `${getUserDisplayName(user)}さん、` : ""}${greeting}`}
    description={formatDate(now)}
    actions={<div className="flex flex-wrap gap-2">
      <Link className="inline-flex h-11 items-center gap-2 bg-[#EC6F8B] px-5 text-sm font-medium text-white" href={"/calendar" as Route}><Plus className="h-4 w-4" />予定を追加</Link>
      <Link className="inline-flex h-11 items-center gap-2 border border-[#E5E7EB] bg-white px-4 text-sm text-[#374151]" href={"/home#tasks" as Route}><ListChecks className="h-4 w-4" />タスクを追加</Link>
      <Link className="inline-flex h-11 items-center gap-2 border border-[#E5E7EB] bg-white px-4 text-sm text-[#374151]" href={"/sales/companies" as Route}><Building2 className="h-4 w-4" />会社</Link>
    </div>}
  />;
}

function WeekSchedule({ start, events }: { start: Date; events: CalendarItem[] }) {
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return <div className="overflow-x-auto"><div className="grid min-w-[900px] grid-cols-7 overflow-hidden rounded-lg border border-[#E5E7EB]">
    {days.map((day) => { const dayEvents = events.filter((item) => isSameDate(item.startAt, day)); const today = isSameDate(day, new Date()); return <div className={`min-h-52 border-r border-[#E5E7EB] last:border-r-0 ${today ? "bg-[#FFF7F9]" : "bg-white"}`} key={day.toISOString()}>
      <div className={`border-b border-[#E5E7EB] px-3 py-2 text-center text-sm ${today ? "font-semibold text-[#EC6F8B]" : "text-[#6B7280]"}`}>{day.getDate()} <span className="text-xs">{day.toLocaleDateString("ja-JP", { weekday: "short" })}</span></div>
      <div className="space-y-2 p-2">{dayEvents.slice(0, 5).map((item) => { const meta = getCategoryMeta(item.category); return <Link className={`block rounded-md px-2 py-2 text-xs ${meta.soft} ${meta.text}`} href={"/calendar" as Route} key={item.id}><span className="block font-semibold">{item.allDay ? "終日" : item.startAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span><span className="mt-0.5 block truncate">{item.companyName || item.relatedName || item.title}</span></Link>; })}{dayEvents.length > 5 ? <p className="px-2 text-xs text-[#EC6F8B]">＋{dayEvents.length - 5}件</p> : null}</div>
    </div>; })}
  </div></div>;
}

function canSeeEvent(event: CalendarEvent, user: User | null): boolean {
  if (!user) return false;
  return isAdminUser(user.uid) || event.assigneeId === user.uid || event.createdBy === user.uid || (event.attendeeIds ?? []).includes(user.uid);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}
