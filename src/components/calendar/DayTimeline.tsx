"use client";

import { AlertTriangle, CalendarDays } from "lucide-react";
import { AllDayEvents } from "@/components/calendar/AllDayEvents";
import { TimelineEventCard } from "@/components/calendar/TimelineEventCard";
import { formatShortDate, isSameCalendarDate, itemsForDate } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function DayTimeline({ selectedDate, items, onOpen }: { selectedDate: Date; items: CalendarItem[]; onOpen: (item: CalendarItem) => void }) {
  const dayItems = itemsForDate(items, selectedDate);
  const allDayItems = dayItems.filter((item) => item.allDay || isMultiDayItem(item));
  const timedItems = dayItems.filter((item) => !item.allDay && !isMultiDayItem(item));
  return <section className="rounded-2xl border border-[#ECE7E4] bg-white p-5 shadow-sm">
    <div className="mb-5"><h2 className="text-base font-semibold text-neutral-900">{formatShortDate(selectedDate)}</h2><p className="mt-1 text-sm text-neutral-500">{timedItems.length ? `${timedItems.length}件の予定` : "予定はありません"}</p></div>
    <AllDayEvents items={allDayItems} onOpen={onOpen} />
    {!timedItems.length && !allDayItems.length ? <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-[#E5E0DD] bg-[#FCFBFA] text-center"><div><CalendarDays className="mx-auto h-6 w-6 text-neutral-300" /><p className="mt-3 text-sm font-semibold text-neutral-700">この日の予定はありません</p><p className="mt-1 text-xs text-neutral-400">この日は空いています。</p></div></div> : null}
    <div>{timedItems.map((item, index) => { const previous = timedItems[index - 1]; const previousEnd = previous?.endAt ?? previous?.startAt; const gapMinutes = previousEnd ? Math.round((item.startAt.getTime() - previousEnd.getTime()) / 60_000) : 0; const overlapping = Boolean(previousEnd && gapMinutes < 0); return <div key={item.id}>{overlapping ? <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" />予定が重複しています</div> : null}<div className="py-2"><TimelineEventCard item={item} onOpen={onOpen} /></div></div>; })}</div>
  </section>;
}

function isMultiDayItem(item: CalendarItem): boolean { return Boolean(item.endAt && !isSameCalendarDate(item.startAt, item.endAt)); }
