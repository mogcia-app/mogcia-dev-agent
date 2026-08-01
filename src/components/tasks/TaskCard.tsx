"use client";

import { Check, Circle, UserRound } from "lucide-react";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { Task } from "@/types/task";

export function TaskCard({ task, canEdit, currentUserId, active = false, onOpen, onToggle }: { task: Task; canEdit: boolean; currentUserId: string; active?: boolean; onOpen: () => void; onToggle: (completed: boolean) => void }) {
  const completed = task.status === "completed";
  const showAssignee = Boolean(task.assigneeId && task.assigneeId !== currentUserId);
  const sourceBorder = completed ? "border-l-[#B8B8B8]" : task.source === "ai" ? "border-l-[#EC6F8B]" : task.source === "automation" ? "border-l-[#70B661]" : "border-l-[#7BA7D9]";

  return (
    <article className={`group grid gap-3 border border-l-4 bg-white px-3 py-2.5 transition sm:grid-cols-[36px_1fr_auto] sm:items-center ${sourceBorder} ${active ? "border-[#DCD1D4]" : "border-[#EFE3E6]"} ${completed ? "opacity-70" : ""}`}>
      <button
        aria-label={completed ? "未完了に戻す" : "完了にする"}
        className={`grid h-8 w-8 place-items-center border text-[#9C9397] transition disabled:cursor-not-allowed disabled:opacity-40 ${completed ? "border-[#EC6F8B] bg-[#FFF2F5] text-[#EC6F8B]" : "border-[#D7CACE] bg-white group-hover:border-[#EC6F8B] group-hover:text-[#EC6F8B]"}`}
        disabled={!canEdit}
        onClick={() => onToggle(!completed)}
        type="button"
      >
        {completed ? <Check className="h-5 w-5" /> : <Circle className="h-4 w-4" />}
      </button>
      <button className="min-w-0 text-left" onClick={onOpen} type="button">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={`truncate text-sm font-semibold text-[#2D2A2C] ${completed ? "line-through" : ""}`}>{task.title || "無題のタスク"}</h3>
        </div>
        {task.description ? <p className={`mt-1 line-clamp-1 text-xs font-medium text-[#8A8186] ${completed ? "line-through" : ""}`}>{task.description}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#8A8186]">
          {showAssignee ? <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{getUserDisplayNameById(task.assigneeId, task.assigneeName)}</span> : null}
          {task.companyName ? <span>{task.companyName}</span> : null}
          {task.productName ? <span>{task.productName}</span> : null}
          {task.projectName ? <span>{task.projectName}</span> : null}
        </div>
      </button>
      <button className="hidden h-7 border border-transparent px-2 text-xs font-semibold text-[#EC6F8B] transition hover:border-[#F4B7C4] hover:bg-white sm:block" onClick={onOpen} type="button">
        詳細
      </button>
    </article>
  );
}
