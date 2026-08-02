"use client";

import { useEffect, useState } from "react";
import { AllDayEvents } from "@/components/calendar/AllDayEvents";
import { CalendarViewToggle } from "@/components/calendar/CalendarViewToggle";
import { TimelineEventCard } from "@/components/calendar/TimelineEventCard";
import { formatShortDate, formatTime, isSameCalendarDate, itemsForDate } from "@/lib/calendar-utils";
import type { CalendarItem, CalendarViewMode } from "@/types/calendar";

export function DayTimeline({ selectedDate, items, view, onViewChange, onOpen }: { selectedDate: Date; items: CalendarItem[]; view: CalendarViewMode; onViewChange: (view: CalendarViewMode) => void; onOpen: (item: CalendarItem) => void }) {
  const [now, setNow] = useState(() => new Date());
  const dayItems = itemsForDate(items, selectedDate);
  const allDayItems = dayItems.filter((item) => item.allDay || isMultiDayItem(item));
  const timedItems = dayItems.filter((item) => !item.allDay && !isMultiDayItem(item));
  const isToday = isSameCalendarDate(selectedDate, now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-[0_12px_28px_rgba(142,91,96,0.06)]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-4">
          <h3 className="text-xl font-bold text-[#2B2B2B]">{isToday ? "今日の予定" : "予定"}</h3>
          <p className="text-sm font-bold text-[#777]">{formatShortDate(selectedDate)}</p>
        </div>
        <CalendarViewToggle onChange={onViewChange} view={view} />
      </div>
      <AllDayEvents items={allDayItems} onOpen={onOpen} />
      {isToday ? (
        <div className="mb-4 flex items-center gap-3 text-xs font-bold text-[#F47E96]">
          <span className="h-px flex-1 bg-[#F47E96]" />
          {formatTime(now)}
        </div>
      ) : null}
      {timedItems.length === 0 && allDayItems.length === 0 ? (
        <div className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] px-5 py-12 text-center">
          <p className="text-lg font-bold text-[#2B2B2B]">この日の予定はありません</p>
          <p className="mt-2 text-sm font-semibold text-[#8A8A8A]">新しい予定を追加するか、別の日を選択してください。</p>
        </div>
      ) : (
        <div className={view === "timeline" ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>
          {timedItems.map((item) => (
            <div className={view === "timeline" ? "grid grid-cols-[64px_14px_1fr] gap-3" : ""} key={item.id}>
              {view === "timeline" ? (
                <>
                  <p className="pt-3 text-sm font-bold text-[#2B2B2B]">{formatTime(item.startAt)}</p>
                  <span className={`mt-5 h-2.5 w-2.5 rounded-none ${item.category === "manual_task" ? "bg-[#4F78B4]" : item.category === "meeting" ? "bg-[#67B667]" : "bg-[#F47E96]"}`} />
                </>
              ) : null}
              <TimelineEventCard item={item} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function isMultiDayItem(item: CalendarItem): boolean {
  if (!item.endAt) return false;
  return !isSameCalendarDate(item.startAt, item.endAt);
}
