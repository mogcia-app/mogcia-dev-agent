"use client";

import { CalendarDays, Check, ChevronRight, Circle, UserRound } from "lucide-react";
import { getDueBadge, isTaskOverdue } from "@/lib/task-utils";
import { TaskPriorityBadge, TaskSourceBadge } from "@/components/tasks/TaskBadges";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { Task } from "@/types/task";

export function TaskCard({ task, canEdit, onOpen, onToggle }: { task: Task; canEdit: boolean; onOpen: () => void; onToggle: (completed: boolean) => void }) {
  const completed = task.status === "completed";
  const overdue = isTaskOverdue(task);
  const edge = completed ? "border-l-[#70B661]" : task.priority === "high" || overdue ? "border-l-[#EC6F8B]" : "border-l-[#5F86C9]";
  const due = task.dueDate?.toDate();

  return (
    <article className={`grid gap-4 rounded-lg border border-[#F0DEE2] border-l-4 ${edge} bg-white p-4 shadow-[0_10px_24px_rgba(99,73,77,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(99,73,77,0.10)] sm:grid-cols-[44px_96px_1fr_auto] sm:items-center ${completed ? "opacity-65" : ""}`}>
      <button
        aria-label={completed ? "未完了に戻す" : "完了にする"}
        className="grid h-9 w-9 place-items-center rounded-full border border-[#D7CACE] bg-white text-[#9C9397] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canEdit}
        onClick={() => onToggle(!completed)}
        type="button"
      >
        {completed ? <Check className="h-5 w-5 text-[#70B661]" /> : <Circle className="h-5 w-5" />}
      </button>
      <TaskSourceBadge source={task.source} />
      <button className="min-w-0 text-left" onClick={onOpen} type="button">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className={`text-xl font-bold text-[#29272A] ${completed ? "line-through" : ""}`}>{task.title || "無題のタスク"}</h3>
          <span className={`rounded-full border px-4 py-2 text-sm font-bold ${completed ? "border-[#DCEAD7] bg-[#F4FAF1] text-[#70A55F]" : overdue ? "border-[#F7CDD5] bg-[#FFF3F5] text-[#E65A78]" : "border-[#F7CDD5] bg-[#FFF8F9] text-[#E65A78]"}`}>{getDueBadge(task)}</span>
        </div>
        {task.description ? <p className={`mt-2 text-sm font-semibold text-[#8A8186] ${completed ? "line-through" : ""}`}>{task.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold text-[#8A8186]">
          <TaskPriorityBadge priority={task.priority} />
          <span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4" />{getUserDisplayNameById(task.assigneeId, task.assigneeName)}</span>
          {due ? <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#EC6F8B]" />{due.toLocaleString("ja-JP", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}まで</span> : null}
          {task.companyName ? <span>{task.companyName}</span> : null}
          {task.projectName ? <span>{task.projectName}</span> : null}
        </div>
      </button>
      <button className="grid h-10 w-10 place-items-center rounded-full text-[#EC6F8B] hover:bg-[#FFF2F5]" onClick={onOpen} type="button" aria-label="詳細を開く">
        <ChevronRight className="h-5 w-5" />
      </button>
    </article>
  );
}
