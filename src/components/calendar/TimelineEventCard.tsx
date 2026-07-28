"use client";

import { BriefcaseBusiness, CalendarDays, Pencil, Sparkles, UsersRound } from "lucide-react";
import { formatTime, getCategoryMeta } from "@/lib/calendar-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarCategory, CalendarItem } from "@/types/calendar";

function CategoryIcon({ category }: { category: CalendarCategory }) {
  if (category === "ai_task") return <Sparkles className="h-5 w-5" />;
  if (category === "manual_task") return <Pencil className="h-5 w-5" />;
  if (category === "meeting") return <UsersRound className="h-5 w-5" />;
  if (category === "appointment") return <BriefcaseBusiness className="h-5 w-5" />;
  return <CalendarDays className="h-5 w-5" />;
}

export function TimelineEventCard({ item, onOpen }: { item: CalendarItem; onOpen: (item: CalendarItem) => void }) {
  const meta = getCategoryMeta(item.category);
  return (
    <button className={`w-full rounded-none border ${meta.border} ${meta.soft} px-4 py-3 text-left transition hover:-translate-y-0.5`} onClick={() => onOpen(item)} type="button">
      <div className="flex items-start gap-3">
        <span className={`${meta.text} mt-1`}><CategoryIcon category={item.category} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-[#2B2B2B]">{item.title || "無題の予定"}</h4>
            <span className={`rounded-none bg-white/70 px-3 py-1 text-xs font-bold ${meta.text}`}>{meta.label}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-[#777]">{item.location || (item.assigneeId ? getUserDisplayNameById(item.assigneeId, item.assigneeName) : item.assigneeName) || item.description || "詳細未設定"}</p>
          {!item.allDay ? <p className="mt-1 text-xs font-bold text-[#8A8A8A]">{formatTime(item.startAt)}{item.endAt ? ` - ${formatTime(item.endAt)}` : ""}</p> : null}
        </div>
      </div>
    </button>
  );
}
