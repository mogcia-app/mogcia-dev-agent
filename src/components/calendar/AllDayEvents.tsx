"use client";

import { TimelineEventCard } from "@/components/calendar/TimelineEventCard";
import type { CalendarItem } from "@/types/calendar";

export function AllDayEvents({ items, onOpen }: { items: CalendarItem[]; onOpen: (item: CalendarItem) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4">
      <p className="mb-3 text-sm font-bold text-[#6E666A]">終日</p>
      <div className="space-y-2">
        {items.map((item) => <TimelineEventCard item={item} key={item.id} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
