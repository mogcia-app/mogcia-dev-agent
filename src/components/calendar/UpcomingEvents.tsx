"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { formatDateBadge, formatTimeRange, formatWeekday, getCategoryMeta, getMeetingMethodLabel, upcomingItems } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function UpcomingEvents({ items, selectedDate, onOpen, onShowAll }: { items: CalendarItem[]; selectedDate: Date; onOpen: (item: CalendarItem) => void; onShowAll: () => void }) {
  const upcoming = upcomingItems(items, selectedDate);
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_28px_rgba(142,91,96,0.06)]">
      <h3 className="mb-4 text-base font-medium text-[#111827]">直近の予定</h3>
      {upcoming.length === 0 ? <p className="rounded-xl bg-[#FFFFFF] px-4 py-8 text-center text-sm font-medium text-[#8A8A8A]">直近の予定はありません</p> : null}
      <div className="grid gap-2">
        {upcoming.map((item) => {
          const meta = getCategoryMeta(item.category);
          const productLabel = item.productNames?.length ? item.productNames.join(" / ") : item.productName;
          const primaryName = item.relatedName || item.companyName || productLabel;
          const displayTitle = primaryName ? `${primaryName}｜${item.title || "無題の予定"}` : item.title || "無題の予定";
          return (
            <button className="grid w-full grid-cols-[56px_minmax(0,1fr)_18px] items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-left transition hover:border-[#F1C2D0] hover:bg-[#FFFFFF]" key={item.id} onClick={() => onOpen(item)} type="button">
              <span className={`${meta.soft} ${meta.text} grid h-14 place-items-center rounded-xl text-center text-xs font-medium leading-4`}>
                <span>{formatDateBadge(item.startAt)}</span>
                <span>{formatWeekday(item.startAt)}</span>
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={`rounded-xl px-2 py-0.5 text-[11px] font-medium ${meta.soft} ${meta.text}`}>{meta.label}</span>
                  {item.allDay ? <span className="text-xs font-medium text-[#64748B]">終日</span> : null}
                </span>
                <span className="mt-1 block break-words text-sm font-medium leading-5 text-[#111827]">{displayTitle}</span>
                <span className="mt-1 flex min-w-0 items-start gap-1 text-xs font-semibold leading-5 text-[#64748B]">{item.location ? <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}<span className="min-w-0 break-words">{item.meetingMethod && item.meetingMethod !== "other" ? `${meta.label} × ${getMeetingMethodLabel(item.meetingMethod)}` : meta.label}</span></span>
                <span className="mt-1 block text-xs font-medium text-[#5F575C]">{formatTimeRange(item.startAt, item.endAt, item.allDay)}</span>
              </span>
              <ChevronRight className="mt-5 h-4 w-4 text-[#D47A95]" />
            </button>
          );
        })}
      </div>
      <button className="mx-auto mt-5 flex items-center gap-2 text-sm font-medium text-[#D47A95]" onClick={onShowAll} type="button">すべての予定を表示 <ChevronRight className="h-4 w-4" /></button>
    </section>
  );
}
