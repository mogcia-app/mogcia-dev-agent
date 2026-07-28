"use client";

import { getCategoryMeta, isSameCalendarDate } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function CalendarDayCell({ date, month, selectedDate, items, onSelect }: { date: Date; month: Date; selectedDate: Date; items: CalendarItem[]; onSelect: (date: Date) => void }) {
  const isOutside = date.getMonth() !== month.getMonth();
  const isSelected = isSameCalendarDate(date, selectedDate);
  const isToday = isSameCalendarDate(date, new Date());
  const categories = Array.from(new Set(items.map((item) => item.category)));
  const visibleCategories = categories.slice(0, 3);

  return (
    <button
      className={`min-h-14 rounded-none px-1 py-2 text-center text-sm font-bold transition ${isSelected ? "bg-[#F47E96] text-white shadow-[0_10px_22px_rgba(244,126,150,0.25)]" : isToday ? "bg-[#FFF0F3] text-[#F47E96] ring-1 ring-[#F7CAD2]" : "hover:bg-[#FFF7F8]"} ${isOutside ? "text-[#BDB6B8]" : "text-[#2B2B2B]"}`}
      onClick={() => onSelect(date)}
      type="button"
    >
      <span>{date.getDate()}</span>
      <span className="mt-1 flex h-3 items-center justify-center gap-1">
        {visibleCategories.map((category) => <span className={`h-1.5 w-1.5 rounded-none ${getCategoryMeta(category).dot}`} key={category} />)}
        {categories.length > 3 ? <span className="text-[10px] leading-none">+{categories.length - 3}</span> : null}
      </span>
    </button>
  );
}
