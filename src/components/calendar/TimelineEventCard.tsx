"use client";

import { BriefcaseBusiness, Building2, CalendarDays, MapPin, Phone, UserRound, UsersRound, Video } from "lucide-react";
import { formatTime, getCategoryMeta } from "@/lib/calendar-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarCategory, CalendarItem } from "@/types/calendar";

function CategoryIcon({ category }: { category: CalendarCategory }) {
  if (category === "meeting") return <UsersRound className="h-5 w-5" />;
  if (category === "appointment") return <BriefcaseBusiness className="h-5 w-5" />;
  if (category === "sales") return <BriefcaseBusiness className="h-5 w-5" />;
  if (category === "phone") return <Phone className="h-5 w-5" />;
  if (category === "visit") return <MapPin className="h-5 w-5" />;
  if (category === "internal") return <Building2 className="h-5 w-5" />;
  if (category === "personal") return <UserRound className="h-5 w-5" />;
  return <CalendarDays className="h-5 w-5" />;
}

export function TimelineEventCard({ item, onOpen }: { item: CalendarItem; onOpen: (item: CalendarItem) => void }) {
  const meta = getCategoryMeta(item.category);
  return (
    <button className={`w-full rounded-xl border ${meta.border} ${meta.soft} px-4 py-3 text-left transition hover:shadow-sm`} onClick={() => onOpen(item)} type="button">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`${meta.text} mt-1`}><CategoryIcon category={item.category} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 break-words font-bold leading-5 text-[#2B2B2B]">{item.title || "無題の予定"}</h4>
            <span className={`rounded-md bg-white/70 px-2 py-1 text-[11px] font-bold ${meta.text}`}>{meta.label}</span>
          </div>
          <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#777]">{item.location || (item.assigneeId ? getUserDisplayNameById(item.assigneeId, item.assigneeName) : item.assigneeName) || item.description || "詳細未設定"}</p>
          {!item.allDay ? <p className="mt-1 text-xs font-bold text-[#8A8A8A]">{formatTime(item.startAt)}{item.endAt ? ` - ${formatTime(item.endAt)}` : ""}</p> : null}
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-[#777]">{item.companyName ? <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{item.companyName}</span> : null}{item.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span> : null}{item.meetingUrl ? <span className="inline-flex items-center gap-1 text-[#4F78B4]"><Video className="h-3.5 w-3.5" />オンライン</span> : null}</div>
        </div>
      </div>
    </button>
  );
}
