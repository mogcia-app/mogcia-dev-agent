"use client";

import { TaskCard } from "@/components/tasks/TaskCard";
import { EmptyState } from "@/components/ui/status";
import { SkeletonTask } from "@/components/ui/loading";
import type { Task } from "@/types/task";

export function TaskList({ tasks, canEditTask, currentUserId, selectedTaskId, onOpen, onToggle }: { tasks: Task[]; canEditTask: (task: Task) => boolean; currentUserId: string; selectedTaskId?: string; onOpen: (task: Task) => void; onToggle: (task: Task, completed: boolean) => void }) {
  if (tasks.length === 0) {
    return (
      <EmptyState title="タスクはまだありません" description="必要なタスクだけ、ここから作っていきます。" />
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskCard active={selectedTaskId === task.id} canEdit={canEditTask(task)} currentUserId={currentUserId} key={task.id} onOpen={() => onOpen(task)} onToggle={(completed) => onToggle(task, completed)} task={task} />
      ))}
    </div>
  );
}

export function TaskSkeleton() {
  return <SkeletonTask />;
}
