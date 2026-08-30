"use client";

import { MapPin, Pencil, Video } from "lucide-react";
import { formatTimeRange, getCategoryMeta, getMeetingMethodLabel } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/types/calendar";

export function TimelineEventCard({ item, canEdit = false, onEdit, onOpen }: { item: CalendarItem; canEdit?: boolean; onEdit?: (item: CalendarItem) => void; onOpen: (item: CalendarItem) => void }) {
  const meta = getCategoryMeta(item.category);
  const productLabel = item.productNames?.length ? item.productNames.join(" / ") : item.productName;
  const primaryName = item.relatedName || item.companyName || productLabel;
  const fallbackTitle = item.title || "無題の予定";
  const displayTitle = primaryName || fallbackTitle;
  const titleSupplement = primaryName && shouldShowTitleSupplement(primaryName, item.title) ? item.title : "";
  const methodLabel = getMeetingMethodLabel(item.meetingMethod);
  const timeLabel = formatTimeRange(item.startAt, item.endAt, item.allDay);
  return (
    <article className={`flex w-full items-start gap-2 rounded-xl border ${meta.border} ${meta.soft} px-4 py-3 text-left transition hover:shadow-sm`}>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)} type="button">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} style={{ backgroundColor: meta.dotColor }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="min-w-0 break-words font-medium leading-5 text-[#2B2B2B]">{displayTitle}</h4>
            </div>
            {titleSupplement ? <p className="mt-1 break-words text-xs font-medium leading-5 text-[#777]">{titleSupplement}</p> : null}
            <p className={`mt-1 break-words text-sm font-medium leading-5 ${meta.text}`}>{meta.label} × {methodLabel}</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-[#5F575C]">{timeLabel}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-[#777]">{item.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span> : null}{item.meetingUrl ? <span className="inline-flex items-center gap-1 text-[#4F78B4]"><Video className="h-3.5 w-3.5" />オンラインURL</span> : null}</div>
          </div>
        </div>
      </button>
      {canEdit && onEdit ? <button className="grid h-9 w-9 shrink-0 place-items-center rounded-none border border-[#F0E7E9] bg-white/70 text-[#EC6F8B] hover:bg-white" onClick={() => onEdit(item)} type="button" aria-label="予定を編集" title="予定を編集"><Pencil className="h-4 w-4" /></button> : null}
    </article>
  );
}

function shouldShowTitleSupplement(primaryName: string, title?: string): boolean {
  const normalizedPrimaryName = normalizeDisplayText(primaryName);
  const normalizedTitle = normalizeDisplayText(title);
  if (!normalizedTitle) return false;
  return normalizedTitle !== normalizedPrimaryName && !normalizedTitle.includes(normalizedPrimaryName);
}

function normalizeDisplayText(value?: string | null): string {
  return (value ?? "").replace(/\s/g, "").toLowerCase();
}
