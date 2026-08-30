"use client";

import { Bot, CalendarDays, Check, Clock3, Inbox, ListChecks, Search, User, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskPageHeader } from "@/components/tasks/TaskPageHeader";
import { TaskProgressTimeline } from "@/components/tasks/TaskProgressTimeline";
import { SingleSelect } from "@/components/ui/select";
import { StatusToast } from "@/components/ui/status";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { getDueBadge, getDueBadgeTone, isTaskOverdue } from "@/lib/task-utils";
import type { Task, TaskStatusFilter, TaskView } from "@/types/task";

type SidebarEntry = {
  label: string;
  icon: typeof ListChecks;
  count: number;
  active: boolean;
  onClick: () => void;
};

export function TasksPageClient() {
  const taskStore = useTasks();
  const workspaceOptions = useWorkspaceOptions();
  const filters = useTaskFilters(taskStore.tasks, taskStore.user?.uid ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const isLogView = filters.view === "log";

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const openTasks = filters.filteredTasks.filter((task) => task.status !== "completed");
    if (!needle) return openTasks;
    return openTasks.filter((task) => [task.title, task.description, task.companyName, task.productName, task.assigneeName].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [filters.filteredTasks, query]);

  const selectedTask = useMemo(() => selectedTaskId ? visibleTasks.find((task) => task.id === selectedTaskId) ?? null : null, [selectedTaskId, visibleTasks]);
  const overdueTasks = filters.status === "today" ? visibleTasks.filter(isTaskOverdue) : [];
  const currentTasks = filters.status === "today" ? visibleTasks.filter((task) => !isTaskOverdue(task)) : visibleTasks;

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="min-h-[calc(100vh-65px)] overflow-hidden bg-white lg:min-h-screen xl:grid xl:grid-cols-[260px_minmax(0,1fr)]">
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <TaskSidebar counts={filters.counts} currentUserId={taskStore.user?.uid ?? ""} filters={filters} tasks={taskStore.tasks} />

      <main className="min-w-0 border-[#EFE3E6] xl:border-l">
        {taskStore.error ? <p className="m-4 rounded-none bg-[#FFF2F5] px-4 py-3 text-sm font-medium text-[#D94F6E]">{taskStore.error}</p> : null}

        <section className="border-b border-[#EFE3E6] bg-white px-5 py-5">
          <TaskPageHeader onCreate={() => setCreateOpen(true)} />
        </section>

        <section className="border-b border-[#EFE3E6] px-5 py-4">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[#EFE3E6] px-3 text-sm font-semibold text-[#8A8186]">
            <Search className="h-4 w-4" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="タイトル・会社・商材で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </section>

        <section className="max-h-[calc(100vh-85px)] overflow-auto px-5 py-5">
          {taskStore.loading ? <TaskRowsSkeleton /> : null}
          {!taskStore.loading && isLogView ? <TaskLogPicker currentUserId={taskStore.user?.uid ?? ""} onSelect={setSelectedTaskId} selectedTask={selectedTask} tasks={visibleTasks} /> : null}
          {!taskStore.loading && !isLogView ? (
            <div className="space-y-7">{filters.status === "today" ? <TaskSection title="今日やること" count={currentTasks.length}><TaskRows canEditTask={taskStore.canEditTask} currentUserId={taskStore.user?.uid ?? ""} onSelect={setSelectedTaskId} onToggle={(task, completed) => void taskStore.completeTask(task, completed)} selectedTaskId={selectedTask?.id} tasks={currentTasks} /></TaskSection> : <TaskRows canEditTask={taskStore.canEditTask} currentUserId={taskStore.user?.uid ?? ""} onSelect={setSelectedTaskId} onToggle={(task, completed) => void taskStore.completeTask(task, completed)} selectedTaskId={selectedTask?.id} tasks={currentTasks} />}{overdueTasks.length ? <TaskSection title="期限超過" count={overdueTasks.length} warning><TaskRows canEditTask={taskStore.canEditTask} currentUserId={taskStore.user?.uid ?? ""} onSelect={setSelectedTaskId} onToggle={(task, completed) => void taskStore.completeTask(task, completed)} selectedTaskId={selectedTask?.id} tasks={overdueTasks} /></TaskSection> : null}</div>
          ) : null}
          {!taskStore.loading ? <p className="mt-5 text-center text-xs font-medium text-[#A0979B]">{visibleTasks.length}件を表示</p> : null}
        </section>
      </main>

      <TaskDetailDrawer
        canDelete={selectedTask ? taskStore.canDeleteTask() : false}
        canEdit={selectedTask ? taskStore.canEditTask(selectedTask) : false}
        companies={workspaceOptions.companies}
        currentUserId={taskStore.user?.uid ?? ""}
        isAdmin={taskStore.isAdmin}
        key={selectedTask?.id ?? "no-task"}
        members={taskStore.members}
        onClose={() => setSelectedTaskId("")}
        onDelete={async (taskId) => { await taskStore.deleteTask(taskId); flash("タスクを削除しました"); }}
        onDuplicate={async (task) => { await taskStore.duplicateTask(task); flash("タスクを複製しました"); }}
        onSave={async (task, draft) => { await taskStore.updateTask(task, draft); flash("タスクを更新しました"); }}
        onToggle={async (task, completed) => { await taskStore.completeTask(task, completed); flash(completed ? "タスクを完了しました" : "タスクを未完了に戻しました"); }}
        products={workspaceOptions.products}
        task={selectedTask}
      />
      {createOpen ? (
        <TaskFormModal
          companies={workspaceOptions.companies}
          currentMember={taskStore.currentMember}
          members={taskStore.members}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (draft) => {
            await taskStore.createTask(draft);
            flash("タスクを登録しました");
          }}
          products={workspaceOptions.products}
        />
      ) : null}
    </div>
  );
}

function TaskSidebar({ tasks, counts, currentUserId, filters }: { tasks: Task[]; counts: Record<TaskStatusFilter, number>; currentUserId: string; filters: ReturnType<typeof useTaskFilters> }) {
  const entries: SidebarEntry[] = [
    { label: "今日", icon: CalendarDays, count: counts.today, active: filters.status === "today", onClick: () => filters.setFilter("status", "today") },
    { label: "受信トレイ", icon: Inbox, count: counts.open, active: filters.status === "open" && filters.view === "mine", onClick: () => { filters.setFilter("view", "mine"); filters.setFilter("status", "open"); } }
  ];
  const viewEntries: Array<{ value: TaskView; label: string; icon: typeof User }> = [
    { value: "mine", label: "マイタスク", icon: User },
    { value: "members", label: "メンバータスク", icon: UsersRound },
    { value: "assigned", label: "依頼したタスク", icon: UserPlus },
    { value: "ai", label: "MOGCIA作成", icon: Bot }
  ];
  const viewCounts: Record<TaskView, number> = {
    mine: currentUserId ? tasks.filter((task) => task.status !== "completed" && (task.assigneeId === currentUserId || task.collaboratorIds?.includes(currentUserId))).length : 0,
    members: currentUserId ? tasks.filter((task) => task.status !== "completed" && (task.assigneeId !== currentUserId || task.collaboratorIds?.some((id) => id !== currentUserId))).length : 0,
    assigned: currentUserId ? tasks.filter((task) => task.status !== "completed" && task.createdBy === currentUserId && task.assigneeId !== currentUserId).length : 0,
    ai: tasks.filter((task) => task.status !== "completed" && task.source === "ai").length,
    log: tasks.length
  };

  return (
    <aside className="bg-[#FBFAFA] p-4">
      <div className="grid gap-1">
        {entries.map((entry) => <SidebarButton entry={entry} key={entry.label} />)}
      </div>
      <div className="my-5 border-t border-[#EFE3E6]" />
      <p className="px-3 text-xs font-semibold text-[#B3AAAE]">リスト</p>
      <div className="mt-3 grid gap-1">
        {viewEntries.map((entry) => {
          const Icon = entry.icon;
          const active = filters.view === entry.value;
          return (
            <button className={`flex h-11 items-center justify-between rounded-none px-3 text-sm font-medium ${active ? "bg-[#F0EEEE] text-[#2B2B2B]" : "text-[#6F676B] hover:bg-white"}`} key={entry.value} onClick={() => filters.setFilter("view", entry.value)} type="button">
              <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{entry.label}</span>
              <span className="text-xs text-[#AAA]">{viewCounts[entry.value]}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function SidebarButton({ entry }: { entry: SidebarEntry }) {
  const Icon = entry.icon;
  return (
    <button className={`flex h-11 items-center justify-between rounded-none px-3 text-sm font-medium ${entry.active ? "bg-[#F0EEEE] text-[#2B2B2B]" : "text-[#6F676B] hover:bg-white"}`} onClick={entry.onClick} type="button">
      <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{entry.label}</span>
      <span className="text-xs text-[#AAA]">{entry.count}</span>
    </button>
  );
}

function TaskRows({ tasks, selectedTaskId, currentUserId, canEditTask, onSelect, onToggle }: { tasks: Task[]; selectedTaskId?: string; currentUserId: string; canEditTask: (task: Task) => boolean; onSelect: (taskId: string) => void; onToggle: (task: Task, completed: boolean) => void }) {
  if (!tasks.length) return <p className="py-16 text-center text-sm font-medium text-[#958B90]">タスクはまだありません。</p>;
  return (
    <div className="divide-y divide-[#F1ECEE]">
      {tasks.map((task) => {
        const completed = task.status === "completed";
        const active = selectedTaskId === task.id;
        return (
          <div className={`grid min-h-12 grid-cols-[34px_1fr_auto] items-center gap-2 px-2 transition ${active ? "bg-[#F7F5F5]" : "hover:bg-[#FFFBFC]"}`} key={task.id}>
            <button className={`grid h-6 w-6 place-items-center border ${completed ? "border-[#EC6F8B] bg-[#FFF2F5] text-[#EC6F8B]" : "border-[#CFC7CB] text-transparent"}`} disabled={!canEditTask(task)} onClick={() => onToggle(task, !completed)} type="button" aria-label={completed ? "未完了に戻す" : "完了にする"}>
              <Check className="h-4 w-4" />
            </button>
            <button className="min-w-0 py-2 text-left" onClick={() => onSelect(task.id)} type="button">
              <span className={`block truncate text-sm font-medium ${completed ? "text-[#A9A1A5] line-through" : "text-[#2B2B2B]"}`}>{task.title || "タイトルなし"}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#8A8186]">
                {task.companyName ? <span>{task.companyName}</span> : null}
                {task.productName ? <span>{task.productName}</span> : null}
                {task.assigneeId !== currentUserId && task.assigneeName ? <span>担当: {task.assigneeName}</span> : null}
              </span>
            </button>
            <button className={`hidden h-8 items-center gap-1 border px-2 text-xs font-medium sm:inline-flex ${getDueBadgeTone(task)}`} onClick={() => onSelect(task.id)} type="button">
              <Clock3 className="h-3.5 w-3.5" />
              {getDueBadge(task)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TaskSection({ title, count, warning = false, children }: { title: string; count: number; warning?: boolean; children: React.ReactNode }) {
  return <section><div className="mb-3 flex items-center gap-2"><h2 className={`text-sm font-medium ${warning ? "text-[#C85C39]" : "text-[#2B2B2B]"}`}>{title}</h2><span className="text-xs font-semibold text-[#9A9296]">{count}件</span></div>{children}</section>;
}

function TaskLogPicker({ tasks, selectedTask, currentUserId, onSelect }: { tasks: Task[]; selectedTask: Task | null; currentUserId: string; onSelect: (taskId: string) => void }) {
  return (
    <div className="grid gap-4">
      <SingleSelect emptyLabel="タスクがありません。" options={tasks.map((task) => ({ value: task.id, label: task.title || "無題のタスク", description: task.assigneeName ? `担当: ${task.assigneeName}` : "" }))} placeholder="全タスクから選択" value={selectedTask?.id ?? ""} onChange={onSelect} />
      <TaskProgressTimeline currentUserId={currentUserId} task={selectedTask} />
    </div>
  );
}

function TaskRowsSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 8 }).map((_, index) => <div className="h-12 animate-pulse rounded-none bg-[#F7F5F5]" key={index} />)}
    </div>
  );
}
