"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { formatDateBadge, formatTime, formatWeekday, getCategoryMeta, upcomingItems } from "@/lib/calendar-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarItem } from "@/types/calendar";

export function UpcomingEvents({ items, selectedDate, onOpen, onShowAll }: { items: CalendarItem[]; selectedDate: Date; onOpen: (item: CalendarItem) => void; onShowAll: () => void }) {
  const upcoming = upcomingItems(items, selectedDate);
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-[0_12px_28px_rgba(142,91,96,0.06)]">
      <h3 className="mb-4 text-xl font-bold text-[#2B2B2B]">直近の予定</h3>
      {upcoming.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-4 py-8 text-center text-sm font-bold text-[#8A8A8A]">直近の予定はありません</p> : null}
      <div className="grid gap-2">
        {upcoming.map((item) => {
          const meta = getCategoryMeta(item.category);
          return (
            <button className="grid w-full grid-cols-[56px_minmax(0,1fr)_18px] items-start gap-3 rounded-none border border-[#F0E7E9] bg-white px-3 py-3 text-left transition hover:border-[#F7CAD2] hover:bg-[#FFFBFC]" key={item.id} onClick={() => onOpen(item)} type="button">
              <span className={`${meta.soft} ${meta.text} grid h-14 place-items-center rounded-none text-center text-xs font-bold leading-4`}>
                <span>{formatDateBadge(item.startAt)}</span>
                <span>{formatWeekday(item.startAt)}</span>
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={`rounded-none px-2 py-0.5 text-[11px] font-bold ${meta.soft} ${meta.text}`}>{meta.label}</span>
                  <span className="text-xs font-bold text-[#8A8186]">{item.allDay ? "終日" : formatTime(item.startAt)}</span>
                </span>
                <span className="mt-1 block break-words text-sm font-bold leading-5 text-[#2B2B2B]">{item.title || "無題の予定"}</span>
                <span className="mt-1 flex min-w-0 items-start gap-1 text-xs font-semibold leading-5 text-[#777]">{item.location ? <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}<span className="min-w-0 break-words">{item.location || item.companyName || (item.assigneeId ? getUserDisplayNameById(item.assigneeId, item.assigneeName) : item.assigneeName) || "詳細未設定"}</span></span>
              </span>
              <ChevronRight className="mt-5 h-4 w-4 text-[#F47E96]" />
            </button>
          );
        })}
      </div>
      <button className="mx-auto mt-5 flex items-center gap-2 text-sm font-bold text-[#F47E96]" onClick={onShowAll} type="button">すべての予定を表示 <ChevronRight className="h-4 w-4" /></button>
    </section>
  );
}
