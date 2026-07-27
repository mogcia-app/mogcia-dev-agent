"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { formatDateBadge, formatTime, formatWeekday, getCategoryMeta, upcomingItems } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function UpcomingEvents({ items, selectedDate, onOpen, onShowAll }: { items: CalendarItem[]; selectedDate: Date; onOpen: (item: CalendarItem) => void; onShowAll: () => void }) {
  const upcoming = upcomingItems(items, selectedDate);
  return (
    <section className="rounded-lg border border-[#F0E7E9] bg-white p-5 shadow-[0_12px_28px_rgba(142,91,96,0.06)]">
      <h3 className="mb-4 text-xl font-bold text-[#2B2B2B]">直近の予定</h3>
      {upcoming.length === 0 ? <p className="rounded-lg bg-[#FFFBFC] px-4 py-8 text-center text-sm font-bold text-[#8A8A8A]">直近の予定はありません</p> : null}
      <div className="overflow-hidden rounded-lg border border-[#F0E7E9]">
        {upcoming.map((item) => {
          const meta = getCategoryMeta(item.category);
          return (
            <button className="grid w-full grid-cols-[64px_70px_1fr_auto] items-center gap-3 border-b border-[#F0E7E9] bg-white px-3 py-3 text-left last:border-b-0 hover:bg-[#FFFBFC]" key={item.id} onClick={() => onOpen(item)} type="button">
              <span className={`${meta.soft} ${meta.text} rounded-md px-2 py-2 text-center text-xs font-bold`}>{formatDateBadge(item.startAt)}<br />{formatWeekday(item.startAt)}</span>
              <span className="text-sm font-bold text-[#2B2B2B]">{item.allDay ? "終日" : formatTime(item.startAt)}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold text-[#2B2B2B]">{item.title}</span>
                <span className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-[#777]">{item.location ? <MapPin className="h-3.5 w-3.5" /> : null}{item.location || item.companyName || item.assigneeName || meta.label}</span>
              </span>
              <span className={`hidden rounded-full px-3 py-1 text-xs font-bold sm:inline ${meta.soft} ${meta.text}`}>{meta.label}</span>
            </button>
          );
        })}
      </div>
      <button className="mx-auto mt-5 flex items-center gap-2 text-sm font-bold text-[#F47E96]" onClick={onShowAll} type="button">すべての予定を表示 <ChevronRight className="h-4 w-4" /></button>
    </section>
  );
}
