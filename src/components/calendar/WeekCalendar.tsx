"use client";

import { formatTime, getCategoryMeta, isSameCalendarDate, itemsForDate } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function WeekCalendar({ selectedDate, items, onSelectDate, onOpen }: { selectedDate: Date; items: CalendarItem[]; onSelectDate: (date: Date) => void; onOpen: (item: CalendarItem) => void }) {
  const start = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  return <section className="overflow-x-auto rounded-2xl border border-[#ECE7E4] bg-white shadow-sm"><div className="grid min-w-[760px] grid-cols-7 divide-x divide-[#EEEAE8]">{days.map((day) => { const dayItems = itemsForDate(items, day); const today = isSameCalendarDate(day, new Date()); return <div className="min-h-[520px]" key={day.toISOString()}><button className={`w-full border-b border-[#EEEAE8] px-3 py-4 text-center ${today ? "bg-[#FFF7F8]" : "bg-[#FCFBFA]"}`} onClick={() => onSelectDate(day)} type="button"><span className="block text-xs font-medium text-neutral-400">{day.toLocaleDateString("ja-JP", { weekday: "short" })}</span><span className={`mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${today ? "bg-[#EC6F8B] text-white" : "text-neutral-800"}`}>{day.getDate()}</span><span className="mt-1 block text-[11px] text-neutral-400">{dayItems.length}件</span></button><div className="space-y-2 p-2">{dayItems.slice(0, 5).map((item) => { const meta = getCategoryMeta(item.category); return <button className={`w-full rounded-lg border p-2 text-left ${meta.soft} ${meta.border}`} key={item.id} onClick={() => onOpen(item)} type="button"><span className={`block text-[10px] font-semibold ${meta.text}`}>{meta.label}</span><span className="mt-1 block truncate text-xs font-semibold text-neutral-800">{item.title}</span>{!item.allDay ? <span className="mt-1 block text-[10px] text-neutral-500">{formatTime(item.startAt)}</span> : null}</button>; })}{dayItems.length > 5 ? <p className="px-1 text-[11px] font-medium text-neutral-400">ほか{dayItems.length - 5}件</p> : null}</div></div>; })}</div></section>;
}

function startOfWeek(date: Date): Date { const start = new Date(date); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay()); return start; }
