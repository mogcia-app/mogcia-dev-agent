"use client";

import { Check, Clock, FileText, UserRound } from "lucide-react";
import { getDueBadge, getDueBadgeTone } from "@/lib/task-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { Task, TaskProgressLog } from "@/types/task";

export function TaskProgressTimeline({ task, currentUserId }: { task: Task | null; currentUserId: string }) {
  if (!task) {
    return (
      <section className="border border-[#EFE3E6] bg-white p-5">
        <p className="text-sm font-semibold text-[#8A8186]">タスクを選択すると、進捗ログが表示されます。</p>
      </section>
    );
  }

  const logs = buildTimelineLogs(task);
  const hideTaskMemberNames = task.assigneeId === currentUserId && task.createdBy === currentUserId;

  return (
    <section className="border border-[#EFE3E6] bg-white">
      <div className="border-b border-[#EFE3E6] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#EC6F8B]">進捗ログ</p>
            <h3 className="mt-1 truncate text-lg font-semibold text-[#2D2A2C]">{task.title || "無題のタスク"}</h3>
            {task.description ? <p className="mt-1 line-clamp-2 text-sm font-medium text-[#81787D]">{task.description}</p> : null}
          </div>
          <span className={`shrink-0 border px-3 py-1.5 text-xs font-semibold ${getDueBadgeTone(task)}`}>{getDueBadge(task)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[#81787D]">
          {!hideTaskMemberNames && task.assigneeId !== currentUserId ? <span>担当: {getUserDisplayNameById(task.assigneeId, task.assigneeName)}</span> : null}
          {!hideTaskMemberNames && task.createdBy !== currentUserId ? <span>作成: {getUserDisplayNameById(task.createdBy, task.createdByName)}</span> : null}
          {task.companyName ? <span>会社: {task.companyName}</span> : null}
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto p-4">
        <ol className="space-y-0">
          {logs.map((log, index) => (
            <li className="grid grid-cols-[22px_1fr] gap-3" key={log.id}>
              <div className="grid justify-center">
                <span className={`mt-1 grid h-5 w-5 place-items-center border ${log.type === "completed" ? "border-[#70B661] bg-[#F4FAF1] text-[#70B661]" : "border-[#F4B7C4] bg-[#FFF4F6] text-[#EC6F8B]"}`}>
                  {log.type === "completed" ? <Check className="h-3.5 w-3.5" /> : log.type === "assignee" ? <UserRound className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                </span>
                {index < logs.length - 1 ? <span className="mx-auto h-full w-px bg-[#F0DEE2]" /> : null}
              </div>
              <div className="pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#2D2A2C]">{log.title}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#9A9296]">
                    <Clock className="h-3 w-3" />
                    {log.createdAt.toDate().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                  </span>
                </div>
                {log.content ? <p className="mt-2 whitespace-pre-wrap border border-[#F3E7EA] bg-[#FFFBFC] p-3 text-sm font-medium leading-6 text-[#5F585C]">{log.content}</p> : null}
                {log.userId !== currentUserId ? <p className="mt-1 text-xs font-medium text-[#9A9296]">{log.userName}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function buildTimelineLogs(task: Task): TaskProgressLog[] {
  const logs = [...(task.progressLogs ?? [])].sort((left, right) => left.createdAt.toMillis() - right.createdAt.toMillis());
  if (logs.length === 0) {
    logs.push({
      id: `${task.id}-created`,
      type: "created",
      title: "タスクを作成しました",
      content: "",
      userId: task.createdBy,
      userName: getUserDisplayNameById(task.createdBy, task.createdByName),
      createdAt: task.createdAt
    });
  }
  if (task.comments && !logs.some((log) => log.type === "progress" && log.content === task.comments)) {
    logs.push({
      id: `${task.id}-progress-current`,
      type: "progress",
      title: "現在の進捗状況",
      content: task.comments,
      userId: task.assigneeId,
      userName: getUserDisplayNameById(task.assigneeId, task.assigneeName),
      createdAt: task.updatedAt
    });
  }
  if (task.completedAt && !logs.some((log) => log.type === "completed")) {
    logs.push({
      id: `${task.id}-completed`,
      type: "completed",
      title: "タスクを完了しました",
      content: "",
      userId: task.assigneeId,
      userName: getUserDisplayNameById(task.assigneeId, task.assigneeName),
      createdAt: task.completedAt
    });
  }
  return logs.sort((left, right) => left.createdAt.toMillis() - right.createdAt.toMillis());
}
