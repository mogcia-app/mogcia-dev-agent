"use client";

import { Bot, CheckCircle2, ListFilter, Pencil, SlidersHorizontal, User, UserPlus, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { MemberOption, TaskDueFilter, TaskPriority, TaskSort, TaskSource, TaskStatusFilter, TaskView } from "@/types/task";

const viewItems: Array<{ value: TaskView; label: string; icon: typeof User }> = [
  { value: "mine", label: "マイタスク", icon: User },
  { value: "ai", label: "AI作成タスク", icon: Bot },
  { value: "manual", label: "手動タスク", icon: Pencil },
  { value: "members", label: "他のメンバー", icon: UsersRound },
  { value: "assigned", label: "割り当て", icon: UserPlus }
];

const statusItems: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "open", label: "未完了" },
  { value: "today", label: "今日のタスク" },
  { value: "hasDue", label: "期限あり" },
  { value: "overdue", label: "期限切れ" },
  { value: "completed", label: "完了" }
];

const sortLabels: Record<TaskSort, string> = {
  dueAsc: "期限が近い順",
  dueDesc: "期限が遠い順",
  priorityDesc: "優先度順",
  newest: "新しい順",
  oldest: "古い順",
  creator: "作成者順",
  assignee: "担当者順"
};

export function TaskViewTabs({ view, setFilter }: { view: TaskView; setFilter: (key: string, value: string) => void }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-[#F0DEE2] bg-white shadow-sm md:grid-cols-5">
      {viewItems.map((item) => {
        const Icon = item.icon;
        const active = item.value === view;
        return (
          <button className={`flex h-16 items-center justify-center gap-2 border-[#F0DEE2] text-sm font-bold transition md:border-r md:last:border-r-0 ${active ? "bg-[#FFF2F5] text-[#EC6F8B]" : "text-[#6F686C] hover:bg-[#FFF8F9]"}`} key={item.value} onClick={() => setFilter("view", item.value)} type="button">
            <Icon className="h-5 w-5" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TaskStatusFilters({ status, counts, setFilter }: { status: TaskStatusFilter; counts: Record<TaskStatusFilter, number>; setFilter: (key: string, value: string) => void }) {
  return (
    <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
      {statusItems.map((item) => {
        const active = item.value === status;
        return (
          <button className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-bold leading-none transition ${active ? "border-[#EC6F8B] bg-[#EC6F8B] text-white shadow-[0_10px_22px_rgba(236,111,139,0.22)]" : "border-[#F0DEE2] bg-white text-[#5F585C] hover:bg-[#FFF8F9]"}`} key={item.value} onClick={() => setFilter("status", item.value)} type="button">
            <span className="whitespace-nowrap">{item.label}</span>
            <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums ${active ? "bg-white/20 text-white" : "bg-[#FFF0F3] text-[#EC6F8B]"}`}>{counts[item.value]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TaskFilterControls({
  due,
  priority,
  source,
  assignee,
  sort,
  members,
  setFilter
}: {
  due: TaskDueFilter;
  priority: TaskPriority | "all";
  source: TaskSource | "all";
  assignee: string;
  sort: TaskSort;
  members: MemberOption[];
  setFilter: (key: string, value: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 2xl:justify-end">
      <div className="flex flex-wrap gap-2 rounded-lg border border-[#F0DEE2] bg-white p-2 shadow-sm">
        <SelectField icon={<ListFilter className="h-4 w-4" />} label="期限" value={due} onChange={(value) => setFilter("due", value)} options={[["all", "すべて"], ["today", "今日"], ["tomorrow", "明日"], ["week", "今週"], ["month", "今月"], ["overdue", "期限切れ"], ["none", "期限なし"]]} />
        <SelectField label="優先度" value={priority} onChange={(value) => setFilter("priority", value)} options={[["all", "すべて"], ["high", "高"], ["medium", "中"], ["low", "低"]]} />
        <SelectField label="作成元" value={source} onChange={(value) => setFilter("source", value)} options={[["all", "すべて"], ["ai", "AI"], ["manual", "手動"], ["automation", "自動"]]} />
        <SelectField label="担当" value={assignee} onChange={(value) => setFilter("assignee", value)} options={[["all", "すべて"], ...members.map((member) => [member.id, member.name] as [string, string])]} />
      </div>
      <div className="rounded-full border border-[#F0DEE2] bg-white px-3 py-2 shadow-sm">
        <SelectField icon={<SlidersHorizontal className="h-4 w-4 text-[#EC6F8B]" />} label="並び替え" value={sort} onChange={(value) => setFilter("sort", value)} options={Object.entries(sortLabels) as Array<[string, string]>} />
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange, icon }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; icon?: ReactNode }) {
  return (
    <label className="inline-flex min-h-9 items-center gap-2 rounded-full px-1 text-xs font-bold text-[#746B70]">
      {icon}
      {label}
      <select className="rounded-full border border-[#F0DEE2] bg-[#FFFBFC] px-2 py-2 text-sm text-[#302D30] outline-none focus:border-[#EC6F8B]" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([nextValue, nextLabel]) => <option key={nextValue} value={nextValue}>{nextLabel}</option>)}
      </select>
    </label>
  );
}
