"use client";

import { AlertTriangle, Clock3 } from "lucide-react";
import { AllDayEvents } from "@/components/calendar/AllDayEvents";
import { TimelineEventCard } from "@/components/calendar/TimelineEventCard";
import { formatShortDate, formatTime, isSameCalendarDate, itemsForDate } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function DayTimeline({ selectedDate, items, onOpen }: { selectedDate: Date; items: CalendarItem[]; onOpen: (item: CalendarItem) => void }) {
  const dayItems = itemsForDate(items, selectedDate);
  const allDayItems = dayItems.filter((item) => item.allDay || isMultiDayItem(item));
  const timedItems = dayItems.filter((item) => !item.allDay && !isMultiDayItem(item));
  return <section className="rounded-2xl border border-[#ECE7E4] bg-white p-5 shadow-sm">
    <div className="mb-5"><h2 className="text-xl font-semibold text-neutral-900">{formatShortDate(selectedDate)}</h2><p className="mt-1 text-sm text-neutral-500">{timedItems.length ? `${timedItems.length}件の予定` : "予定はありません"}</p></div>
    <AllDayEvents items={allDayItems} onOpen={onOpen} />
    {!timedItems.length && !allDayItems.length ? <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-[#E5E0DD] bg-[#FCFBFA] text-center"><div><Clock3 className="mx-auto h-6 w-6 text-neutral-300" /><p className="mt-3 text-sm font-semibold text-neutral-700">この日の予定はありません</p><p className="mt-1 text-xs text-neutral-400">時間を自由に使えます。</p></div></div> : null}
    <div>{timedItems.map((item, index) => { const previous = timedItems[index - 1]; const previousEnd = previous?.endAt ?? previous?.startAt; const gapMinutes = previousEnd ? Math.round((item.startAt.getTime() - previousEnd.getTime()) / 60_000) : 0; const overlapping = Boolean(previousEnd && gapMinutes < 0); return <div key={item.id}>{gapMinutes >= 30 ? <div className="grid grid-cols-[64px_1fr] py-3"><span /><div className="flex items-center gap-3 text-xs font-medium text-neutral-400"><span className="h-px flex-1 bg-[#EEEAE8]" />空き {formatDuration(gapMinutes)}<span className="h-px flex-1 bg-[#EEEAE8]" /></div></div> : null}{overlapping ? <div className="ml-16 mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" />予定が重複しています</div> : null}<div className="grid grid-cols-[64px_1fr] gap-3 py-2"><div className="pt-3 text-right"><p className="text-sm font-semibold text-neutral-800">{formatTime(item.startAt)}</p>{item.endAt ? <p className="mt-1 text-xs text-neutral-400">{formatTime(item.endAt)}</p> : null}</div><TimelineEventCard item={item} onOpen={onOpen} /></div></div>; })}</div>
  </section>;
}

function isMultiDayItem(item: CalendarItem): boolean { return Boolean(item.endAt && !isSameCalendarDate(item.startAt, item.endAt)); }
function formatDuration(minutes: number): string { const hours = Math.floor(minutes / 60); const rest = minutes % 60; if (!hours) return `${rest}分`; return rest ? `${hours}時間${rest}分` : `${hours}時間`; }
