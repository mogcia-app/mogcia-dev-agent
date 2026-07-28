"use client";

import { Check } from "lucide-react";
import { SingleSelect } from "@/components/ui/select";
import type { CalendarFilters as CalendarFilterState } from "@/types/calendar";
import type { MemberOption } from "@/types/task";

const filterItems: Array<{ key: keyof CalendarFilterState; label: string; color: string }> = [
  { key: "mine", label: "マイタスク", color: "bg-[#F47E96]" },
  { key: "aiTasks", label: "AI作成タスク", color: "bg-[#F7B5C1]" },
  { key: "manualTasks", label: "手動タスク", color: "bg-[#4F78B4]" },
  { key: "meetings", label: "会議・商談", color: "bg-[#67B667]" },
  { key: "members", label: "他のメンバー", color: "bg-[#F47E96]" }
];

export function CalendarFilters({ filters, members, member, onFilterChange, onMemberChange }: { filters: CalendarFilterState; members: MemberOption[]; member: string; onFilterChange: (key: keyof CalendarFilterState, value: boolean) => void; onMemberChange: (member: string) => void }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-[0_12px_28px_rgba(142,91,96,0.06)]">
      <h3 className="text-sm font-bold text-[#2B2B2B]">表示フィルター</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {filterItems.map((item) => (
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[#5E565A]" key={item.key}>
            <span className={`grid h-5 w-5 place-items-center rounded ${filters[item.key] ? item.color : "bg-[#F2ECEE]"} text-white`}>
              {filters[item.key] ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
            <input className="sr-only" checked={filters[item.key]} onChange={(event) => onFilterChange(item.key, event.target.checked)} type="checkbox" />
            {item.label}
          </label>
        ))}
      </div>
      {filters.members ? (
        <SingleSelect className="mt-4" options={[{ value: "all", label: "すべてのメンバー" }, ...members.map((entry) => ({ value: entry.id, label: entry.name }))]} value={member} onChange={onMemberChange} />
      ) : null}
    </section>
  );
}
