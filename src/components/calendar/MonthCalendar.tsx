"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { buildCalendarGrid, formatMonthTitle, itemsForDate } from "@/lib/calendar-utils";
import { CalendarDayCell } from "@/components/calendar/CalendarDayCell";
import type { CalendarItem } from "@/types/calendar";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

export function MonthCalendar({ month, selectedDate, items, onMonthChange, onSelectDate, onOpen }: { month: Date; selectedDate: Date; items: CalendarItem[]; onMonthChange: (date: Date) => void; onSelectDate: (date: Date) => void; onOpen: (item: CalendarItem) => void }) {
  const days = useMemo(() => buildCalendarGrid(month), [month]);
  const moveMonth = (amount: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + amount, 1));

  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-[0_12px_28px_rgba(142,91,96,0.06)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button className="grid h-10 w-10 place-items-center rounded-none bg-white text-[#6E666A] shadow-sm ring-1 ring-[#F0E7E9]" onClick={() => moveMonth(-1)} type="button" aria-label="前月"><ChevronLeft className="h-5 w-5" /></button>
        <h3 className="text-xl font-bold text-[#2B2B2B]">{formatMonthTitle(month)}</h3>
        <div className="flex items-center gap-2">
          <button className="h-10 rounded-none bg-white px-4 text-sm font-bold text-[#F47E96] shadow-sm ring-1 ring-[#F0E7E9]" onClick={() => { const today = new Date(); onMonthChange(today); onSelectDate(today); }} type="button">今日</button>
          <button className="grid h-10 w-10 place-items-center rounded-none bg-white text-[#6E666A] shadow-sm ring-1 ring-[#F0E7E9]" onClick={() => moveMonth(1)} type="button" aria-label="翌月"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-none border border-[#F0E7E9] text-sm font-bold text-[#6E666A]">
        {weekdays.map((weekday) => <span className="border-b border-r border-[#F0E7E9] bg-[#FFFBFC] py-2 text-center last:border-r-0" key={weekday}>{weekday}</span>)}
        {days.map((day, index) => <CalendarDayCell date={day} items={itemsForDate(items, day)} key={day.toISOString()} month={month} onOpen={onOpen} onSelect={onSelectDate} selectedDate={selectedDate} showRightBorder={(index + 1) % 7 !== 0} />)}
      </div>
    </section>
  );
}
