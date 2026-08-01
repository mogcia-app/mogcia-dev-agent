"use client";

import { useMemo, useState } from "react";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskList, TaskSkeleton } from "@/components/tasks/TaskList";
import { TaskPageHeader } from "@/components/tasks/TaskPageHeader";
import { TaskProgressTimeline } from "@/components/tasks/TaskProgressTimeline";
import { TaskViewTabs } from "@/components/tasks/TaskToolbar";
import { SearchSelect } from "@/components/ui/select";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import type { Task } from "@/types/task";

export function TasksPageClient() {
  const taskStore = useTasks();
  const workspaceOptions = useWorkspaceOptions();
  const filters = useTaskFilters(taskStore.tasks, taskStore.user?.uid ?? "");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const visibleTasks = filters.filteredTasks;
  const isLogView = filters.view === "log";
  const selectedTask = useMemo(() => visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0] ?? null, [selectedTaskId, visibleTasks]);
  const taskOptions = useMemo(
    () => visibleTasks.map((task) => ({ value: task.id, label: task.title || "無題のタスク", description: [task.assigneeName ? `担当: ${task.assigneeName}` : "", task.status === "completed" ? "完了" : "未完了"].filter(Boolean).join(" / ") })),
    [visibleTasks]
  );

  return (
    <div className="">
      <TaskPageHeader onCreate={() => setCreateOpen(true)} />
      <div className="mt-5">
        <TaskViewTabs setFilter={filters.setFilter} view={filters.view} />
      </div>
      {taskStore.error ? <p className="mt-4 rounded-none bg-[#FFF2F5] px-4 py-3 text-sm font-bold text-[#D94F6E]">{taskStore.error}</p> : null}
      <section className="mt-6 border border-[#EFE3E6] bg-white p-4">
        {taskStore.loading ? (
          <TaskSkeleton />
        ) : isLogView ? (
          <section className="space-y-4">
            <div>
              <SearchSelect emptyLabel="タスクがありません。" options={taskOptions} placeholder="全タスクから選択" value={selectedTask?.id ?? ""} onChange={setSelectedTaskId} />
            </div>
            <TaskProgressTimeline currentUserId={taskStore.user?.uid ?? ""} task={selectedTask} />
          </section>
        ) : (
          <TaskList
            canEditTask={taskStore.canEditTask}
            currentUserId={taskStore.user?.uid ?? ""}
            onOpen={setEditingTask}
            onToggle={(task, completed) => void taskStore.completeTask(task, completed)}
            selectedTaskId={selectedTask?.id}
            tasks={visibleTasks}
          />
        )}
        <p className="mt-6 text-center text-sm font-semibold text-[#958B90]">{visibleTasks.length}件を表示</p>
      </section>
      {isCreateOpen ? (
        <TaskFormModal companies={workspaceOptions.companies} currentMember={taskStore.currentMember} members={taskStore.members} onClose={() => setCreateOpen(false)} onSubmit={taskStore.createTask} products={workspaceOptions.products} />
      ) : null}
      <TaskDetailDrawer
        canDelete={editingTask ? taskStore.canDeleteTask() : false}
        canEdit={editingTask ? taskStore.canEditTask(editingTask) : false}
        currentUserId={taskStore.user?.uid ?? ""}
        isAdmin={taskStore.isAdmin}
        companies={workspaceOptions.companies}
        members={taskStore.members}
        onClose={() => setEditingTask(null)}
        onDelete={taskStore.deleteTask}
        onDuplicate={taskStore.duplicateTask}
        onSave={taskStore.updateTask}
        onToggle={taskStore.completeTask}
        products={workspaceOptions.products}
        key={editingTask?.id ?? "closed"}
        task={editingTask}
      />
    </div>
  );
}
