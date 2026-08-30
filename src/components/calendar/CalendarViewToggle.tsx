"use client";

import { List, Rows3 } from "lucide-react";
import type { CalendarViewMode } from "@/types/calendar";

export function CalendarViewToggle({ view, onChange }: { view: CalendarViewMode; onChange: (view: CalendarViewMode) => void }) {
  return (
    <div className="flex rounded-none border border-[#F0E7E9] bg-white p-1">
      <button className={`inline-flex h-9 items-center gap-2 rounded-none px-3 text-xs font-medium ${view === "timeline" ? "bg-[#FFF0F3] text-[#F47E96]" : "text-[#777]"}`} onClick={() => onChange("timeline")} type="button"><Rows3 className="h-4 w-4" />タイムライン表示</button>
      <button className={`inline-flex h-9 items-center gap-2 rounded-none px-3 text-xs font-medium ${view === "list" ? "bg-[#FFF0F3] text-[#F47E96]" : "text-[#777]"}`} onClick={() => onChange("list")} type="button"><List className="h-4 w-4" />一覧表示</button>
    </div>
  );
}
