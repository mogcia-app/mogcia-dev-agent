"use client";

import { List, Rows3 } from "lucide-react";
import type { CalendarViewMode } from "@/types/calendar";

export function CalendarViewToggle({ view, onChange }: { view: CalendarViewMode; onChange: (view: CalendarViewMode) => void }) {
  return (
    <div className="flex rounded-xl border border-[#E2E8F0] bg-white p-1">
      <button className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium ${view === "timeline" ? "bg-[#FDF0F4] text-[#D47A95]" : "text-[#64748B]"}`} onClick={() => onChange("timeline")} type="button"><Rows3 className="h-4 w-4" />タイムライン表示</button>
      <button className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium ${view === "list" ? "bg-[#FDF0F4] text-[#D47A95]" : "text-[#64748B]"}`} onClick={() => onChange("list")} type="button"><List className="h-4 w-4" />一覧表示</button>
    </div>
  );
}
