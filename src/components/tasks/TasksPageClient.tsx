"use client";

import { useState } from "react";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskList, TaskSkeleton } from "@/components/tasks/TaskList";
import { TaskPageHeader } from "@/components/tasks/TaskPageHeader";
import { TaskFilterControls, TaskStatusFilters, TaskViewTabs } from "@/components/tasks/TaskToolbar";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import type { Task } from "@/types/task";

export function TasksPageClient() {
  const taskStore = useTasks();
  const workspaceOptions = useWorkspaceOptions();
  const filters = useTaskFilters(taskStore.tasks, taskStore.user?.uid ?? "");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  return (
    <div className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <TaskPageHeader onCreate={() => setCreateOpen(true)} />
      <div className="mt-5">
        <TaskViewTabs setFilter={filters.setFilter} view={filters.view} />
      </div>
      <div className="mt-5 flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <TaskStatusFilters counts={filters.counts} setFilter={filters.setFilter} status={filters.status} />
        <TaskFilterControls assignee={filters.assignee} due={filters.due} members={taskStore.members} priority={filters.priority} setFilter={filters.setFilter} sort={filters.sort} source={filters.source} />
      </div>
      {taskStore.error ? <p className="mt-4 rounded-md bg-[#FFF2F5] px-4 py-3 text-sm font-bold text-[#D94F6E]">{taskStore.error}</p> : null}
      <div className="mt-6">
        {taskStore.loading ? (
          <TaskSkeleton />
        ) : (
          <TaskList
            canEditTask={taskStore.canEditTask}
            onOpen={setSelectedTask}
            onToggle={(task, completed) => void taskStore.completeTask(task, completed)}
            tasks={filters.filteredTasks}
          />
        )}
      </div>
      <p className="mt-6 text-center text-sm font-semibold text-[#958B90]">{filters.filteredTasks.length}件を表示</p>
      {isCreateOpen ? (
        <TaskFormModal companies={workspaceOptions.companies} currentMember={taskStore.currentMember} isAdmin={taskStore.isAdmin} meetings={workspaceOptions.meetings} members={taskStore.members} onClose={() => setCreateOpen(false)} onSubmit={taskStore.createTask} projects={workspaceOptions.projects} />
      ) : null}
      <TaskDetailDrawer
        canDelete={selectedTask ? taskStore.canDeleteTask() : false}
        canEdit={selectedTask ? taskStore.canEditTask(selectedTask) : false}
        isAdmin={taskStore.isAdmin}
        companies={workspaceOptions.companies}
        projects={workspaceOptions.projects}
        meetings={workspaceOptions.meetings}
        members={taskStore.members}
        onClose={() => setSelectedTask(null)}
        onDelete={taskStore.deleteTask}
        onDuplicate={taskStore.duplicateTask}
        onSave={taskStore.updateTask}
        onToggle={taskStore.completeTask}
        key={selectedTask?.id ?? "closed"}
        task={selectedTask}
      />
    </div>
  );
}
