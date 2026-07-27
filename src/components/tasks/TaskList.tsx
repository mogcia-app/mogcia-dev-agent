"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getTaskGroupKey } from "@/lib/task-utils";
import { TaskCard } from "@/components/tasks/TaskCard";
import { EmptyState } from "@/components/ui/status";
import { SkeletonTask } from "@/components/ui/loading";
import type { Task } from "@/types/task";

const groupOrder = ["期限切れ", "今日", "明日", "今週", "来週以降", "期限なし", "完了"];

export function TaskList({ tasks, canEditTask, onOpen, onToggle }: { tasks: Task[]; canEditTask: (task: Task) => boolean; onOpen: (task: Task) => void; onToggle: (task: Task, completed: boolean) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const key = getTaskGroupKey(task);
      map.set(key, [...(map.get(key) ?? []), task]);
    });
    return groupOrder.filter((key) => map.has(key)).map((key) => ({ key, items: map.get(key) ?? [] }));
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <EmptyState title="タスクはまだありません" description="必要なタスクだけ、ここから作っていきます。" />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.key] ?? false;
        return (
          <section key={group.key}>
            <button className="mb-3 flex items-center gap-2 text-sm font-bold text-[#6F676B]" onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !isCollapsed }))} type="button">
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {group.key}
              <span className="rounded-full bg-white px-2 py-1 text-xs text-[#EC6F8B]">{group.items.length}</span>
            </button>
            {isCollapsed ? null : (
              <div className="space-y-4">
                {group.items.map((task) => (
                  <TaskCard canEdit={canEditTask(task)} key={task.id} onOpen={() => onOpen(task)} onToggle={(completed) => onToggle(task, completed)} task={task} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function TaskSkeleton() {
  return <SkeletonTask />;
}
