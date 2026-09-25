"use client";

import { getCategoryMeta, isSameCalendarDate } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function CalendarDayCell({ date, month, selectedDate, items, showRightBorder, onSelect, onOpen }: { date: Date; month: Date; selectedDate: Date; items: CalendarItem[]; showRightBorder: boolean; onSelect: (date: Date) => void; onOpen: (item: CalendarItem) => void }) {
  const isOutside = date.getMonth() !== month.getMonth();
  const isSelected = isSameCalendarDate(date, selectedDate);
  const isToday = isSameCalendarDate(date, new Date());
  const visibleItems = items.slice(0, 3);
  const overflowCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className={`min-h-32 border-b border-[#E2E8F0] p-1.5 transition ${showRightBorder ? "border-r" : ""} ${isSelected ? "bg-[#FDF0F4]" : isOutside ? "bg-[#FCFAFB]" : "bg-white hover:bg-[#FFFFFF]"}`}>
      <button
        className={`mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition ${isToday ? "bg-[#D47A95] text-white" : isSelected ? "bg-white text-[#D47A95] ring-1 ring-[#F1C2D0]" : isOutside ? "text-[#BDB6B8]" : "text-[#111827] hover:bg-[#FDF0F4]"}`}
        onClick={() => onSelect(date)}
        type="button"
      >
        {date.getDate()}
      </button>
      <div className="grid gap-1">
        {visibleItems.map((item) => {
          const meta = getCategoryMeta(item.category);
          const isTask = item.itemType === "task";
          const startsOnThisDate = isSameCalendarDate(item.startAt, date);
          return (
            <button className={`min-w-0 border px-1.5 py-1 text-left text-[11px] font-medium leading-4 hover:brightness-[0.98] ${isTask ? "rounded-md border-dashed border-slate-300 bg-white text-slate-600" : `rounded-xl ${meta.soft} ${meta.text} ${meta.border}`}`} key={item.id} onClick={() => onOpen(item)} type="button">
              <span className="flex min-w-0 items-center gap-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} style={{ backgroundColor: meta.dotColor }} />
                <span className="truncate">{isTask ? "□ " : ""}{item.title || "無題"}</span>
              </span>
            </button>
          );
        })}
        {overflowCount > 0 ? <button className="rounded-xl px-1.5 py-1 text-left text-[11px] font-semibold text-[#475569] hover:bg-white" onClick={() => onSelect(date)} type="button">+{overflowCount}件</button> : null}
      </div>
    </div>
  );
}
