"use client";

import { formatTime, getCategoryMeta, isSameCalendarDate } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function CalendarDayCell({ date, month, selectedDate, items, showRightBorder, onSelect, onOpen }: { date: Date; month: Date; selectedDate: Date; items: CalendarItem[]; showRightBorder: boolean; onSelect: (date: Date) => void; onOpen: (item: CalendarItem) => void }) {
  const isOutside = date.getMonth() !== month.getMonth();
  const isSelected = isSameCalendarDate(date, selectedDate);
  const isToday = isSameCalendarDate(date, new Date());
  const visibleItems = items.slice(0, 3);
  const overflowCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className={`min-h-32 border-b border-[#F0E7E9] p-1.5 transition ${showRightBorder ? "border-r" : ""} ${isSelected ? "bg-[#FFF0F3]" : isOutside ? "bg-[#FCFAFB]" : "bg-white hover:bg-[#FFFBFC]"}`}>
      <button
        className={`mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-black transition ${isToday ? "bg-[#F47E96] text-white" : isSelected ? "bg-white text-[#F47E96] ring-1 ring-[#F7CAD2]" : isOutside ? "text-[#BDB6B8]" : "text-[#2B2B2B] hover:bg-[#FFF0F3]"}`}
        onClick={() => onSelect(date)}
        type="button"
      >
        {date.getDate()}
      </button>
      <div className="grid gap-1">
        {visibleItems.map((item) => {
          const meta = getCategoryMeta(item.category);
          const startsOnThisDate = isSameCalendarDate(item.startAt, date);
          return (
            <button className={`min-w-0 rounded-none border px-1.5 py-1 text-left text-[11px] font-bold leading-4 ${meta.soft} ${meta.text} ${meta.border} hover:brightness-[0.98]`} key={item.id} onClick={() => onOpen(item)} type="button">
              <span className="flex min-w-0 items-center gap-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="truncate">{!item.allDay && startsOnThisDate ? `${formatTime(item.startAt)} ` : ""}{item.title || "無題"}</span>
              </span>
            </button>
          );
        })}
        {overflowCount > 0 ? <button className="rounded-none px-1.5 py-1 text-left text-[11px] font-black text-[#6F676B] hover:bg-white" onClick={() => onSelect(date)} type="button">+{overflowCount}件</button> : null}
      </div>
    </div>
  );
}
