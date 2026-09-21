"use client";

import { AlertCircle, Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { createEmptyTaskDraft } from "@/lib/task-utils";
import type { Task } from "@/types/task";

export function HomeTasksPanel({ initialTaskId }: { initialTaskId?: string }) {
  const store = useTasks();
  const { tasks, canEditTask } = store;
  const options = useWorkspaceOptions();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialTaskId ?? "");
  const [message, setMessage] = useState("");
  const selectedTask = store.tasks.find((task) => task.id === selectedId) ?? null;
  const manageableTasks = useMemo(() => tasks.filter((task) => (task.companyId || canEditTask(task)) && task.status !== "cancelled"), [tasks, canEditTask]);
  const priorityTasks = useMemo(() => manageableTasks
    .filter((task) => task.status !== "completed")
    .sort(compareTasksByDueDate)
    .slice(0, 8), [manageableTasks]);
  const visibleTasks = useMemo(() => {
    return manageableTasks
      .filter((task) => task.status !== "completed")
      .sort((a, b) => (a.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER) || b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [manageableTasks]);
  const companyTasks = visibleTasks.filter((task) => task.companyId);
  const otherTasks = visibleTasks.filter((task) => !task.companyId);
  const canManage = (task: Task) => Boolean(task.companyId) || canEditTask(task);
  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(""), 3000); };

  const addQuickTask = async () => {
    if (!title.trim() || creating || !store.user) return;
    setCreating(true);
    try {
      await store.createTask({ ...createEmptyTaskDraft(store.currentMember), title: title.trim() });
      setTitle("");
      notify("タスクを追加しました");
    } catch (error) { notify(error instanceof Error ? error.message : "タスクを追加できませんでした"); }
    finally { setCreating(false); }
  };
  const toggle = async (task: Task) => {
    try { await store.completeTask(task, task.status !== "completed"); notify(task.status === "completed" ? "未完了に戻しました" : "完了しました"); }
    catch (error) { notify(error instanceof Error ? error.message : "タスクを更新できませんでした"); }
  };
  const remove = async (task: Task) => {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
    try { await store.deleteTask(task.id); if (selectedId === task.id) setSelectedId(""); notify("タスクを削除しました"); }
    catch (error) { notify(error instanceof Error ? error.message : "タスクを削除できませんでした"); }
  };

  return <section className="mt-6 space-y-6" id="tasks">
    <div className="rounded-xl border border-[#E8E3E1] bg-white p-5 shadow-[0_10px_28px_rgba(31,31,34,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold text-[#25242A]"><ListChecks className="h-5 w-5 text-[#EC6F8B]" />やること <span className="text-sm font-normal text-[#9A9296]">{manageableTasks.filter((task) => task.status !== "completed").length}件</span></h2><p className="mt-1 text-sm text-[#8A8186]">期限が近いものから確認できます</p></div><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#F7CAD2] px-3 text-sm text-[#C44B63]" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />詳細を入力して追加</button></div>
      <div className="mt-4 flex flex-wrap gap-2"><input aria-label="新しいタスク" className="h-10 min-w-44 flex-1 rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#EC6F8B]" onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addQuickTask(); }} placeholder="やることを入力" value={title} /><button className="h-10 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!store.user || !title.trim() || creating} onClick={() => void addQuickTask()} type="button">{creating ? "追加中..." : "追加"}</button></div>
      {store.loading ? <p className="mt-5 text-sm text-[#8A8186]">読み込み中...</p> : priorityTasks.length ? <div className="mt-4 divide-y divide-[#F0E7E9]">{priorityTasks.map((task) => <HomeTaskItem canEdit={canManage(task)} key={task.id} task={task} onOpen={() => setSelectedId(task.id)} onToggle={() => toggle(task)} onDelete={() => remove(task)} showDueState />)}</div> : <p className="mt-5 rounded-lg bg-[#FAF8F8] px-4 py-5 text-center text-sm text-[#8A8186]">やることはありません</p>}
    </div>

    <div className="rounded-xl border border-[#E8E3E1] bg-white p-5 shadow-[0_10px_28px_rgba(31,31,34,0.04)]">
      <div><h2 className="text-base font-semibold text-[#25242A]">タスク一覧</h2><p className="mt-1 text-sm text-[#8A8186]">会社タスクと個人タスクを分けて管理できます</p></div>
    {message ? <p className="mt-3 text-sm text-[#C44B63]" role="status">{message}</p> : null}
    {store.error ? <p className="mt-3 text-sm text-red-600" role="alert">{store.error}</p> : null}
    {store.loading ? <p className="mt-5 text-sm text-[#8A8186]">読み込み中...</p> : <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <TaskGroup title="会社のタスク" tasks={companyTasks} canEdit={canManage} onOpen={setSelectedId} onToggle={toggle} onDelete={remove} />
      <TaskGroup title="個人タスク" tasks={otherTasks} canEdit={canManage} onOpen={setSelectedId} onToggle={toggle} onDelete={remove} />
    </div>}
    </div>
    <TaskDetailDrawer
      canDelete={selectedTask ? canManage(selectedTask) : false}
      canEdit={selectedTask ? canManage(selectedTask) : false}
      companies={options.companies}
      currentUserId={store.user?.uid ?? ""}
      isAdmin={store.isAdmin}
      key={selectedTask?.id ?? "no-task"}
      members={store.members}
      onClose={() => setSelectedId("")}
      onDelete={async (id) => { await store.deleteTask(id); setSelectedId(""); notify("タスクを削除しました"); }}
      onDuplicate={async (task) => { await store.duplicateTask(task); notify("タスクを複製しました"); }}
      onSave={async (taskId, draft) => { await store.updateTask(taskId, draft); notify("タスクを更新しました"); }}
      onToggle={async (task, completed) => { await store.completeTask(task, completed); notify(completed ? "完了しました" : "未完了に戻しました"); }}
      products={options.products}
      task={selectedTask}
    />
    {createOpen ? <TaskFormModal companies={options.companies} currentMember={store.currentMember} members={store.members} onClose={() => setCreateOpen(false)} onSubmit={async (draft) => { await store.createTask(draft); notify("タスクを追加しました"); }} products={options.products} /> : null}
  </section>;
}

function TaskGroup({ title, tasks, canEdit, onOpen, onToggle, onDelete }: { title: string; tasks: Task[]; canEdit: (task: Task) => boolean; onOpen: (id: string) => void; onToggle: (task: Task) => Promise<void>; onDelete: (task: Task) => Promise<void> }) {
  return <div><h3 className="border-b border-[#F0E7E9] pb-2 text-sm font-semibold text-[#2B2B2B]">{title} <span className="text-[#9A9296]">{tasks.length}件</span></h3>{tasks.length ? <div className="divide-y divide-[#F0E7E9]">{tasks.map((task) => <HomeTaskItem canEdit={canEdit(task)} key={task.id} task={task} onOpen={() => onOpen(task.id)} onToggle={() => onToggle(task)} onDelete={() => onDelete(task)} />)}</div> : <p className="py-5 text-sm text-[#8A8186]">タスクはありません</p>}</div>;
}

function HomeTaskItem({ task, canEdit, onOpen, onToggle, onDelete, showDueState = false }: { task: Task; canEdit: boolean; onOpen: () => void; onToggle: () => Promise<void>; onDelete: () => Promise<void>; showDueState?: boolean }) {
  const [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => { setBusy(true); try { await operation(); } finally { setBusy(false); } };
  const due = getDueState(task);
  return <div className="flex items-center gap-2 py-3"><button aria-label={task.status === "completed" ? "未完了に戻す" : "完了にする"} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#EC6F8B] disabled:opacity-40" disabled={!canEdit || busy} onClick={() => void run(onToggle)} type="button">{task.status === "completed" ? <Check className="h-5 w-5" /> : <span className="h-4 w-4 rounded-full border border-[#BCAFB5]" />}</button><button className="min-w-0 flex-1 text-left" onClick={onOpen} type="button"><span className={`block truncate text-sm font-medium ${task.status === "completed" ? "text-[#9A9296] line-through" : "text-[#2B2B2B]"}`}>{task.title}</span><span className="mt-1 block truncate text-xs text-[#8A8186]">{task.companyName || "個人タスク"}</span></button>{showDueState ? <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${due.className}`}>{due.overdue ? <AlertCircle className="h-3.5 w-3.5" /> : null}{due.label}</span> : <span className="shrink-0 text-xs text-[#8A8186]">{due.label}</span>}{canEdit ? <button aria-label="タスクを削除" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#A0969B] hover:bg-red-50 hover:text-[#D94F6E] disabled:opacity-40" disabled={busy} onClick={() => void run(onDelete)} type="button"><Trash2 className="h-4 w-4" /></button> : null}</div>;
}

function compareTasksByDueDate(left: Task, right: Task): number {
  const leftDue = left.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const rightDue = right.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  return leftDue - rightDue || (left.priority === "high" ? -1 : 0) - (right.priority === "high" ? -1 : 0) || right.createdAt.toMillis() - left.createdAt.toMillis();
}

function getDueState(task: Task): { label: string; className: string; overdue: boolean } {
  if (!task.dueDate) return { label: "期限なし", className: "bg-[#F5F3F4] text-[#7A7276]", overdue: false };
  const due = task.dueDate.toDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)}日超過`, className: "bg-red-50 text-red-600", overdue: true };
  if (days === 0) return { label: "今日", className: "bg-[#FFF0F3] text-[#C44B63]", overdue: false };
  if (days === 1) return { label: "明日", className: "bg-[#FFF7E8] text-[#A66A13]", overdue: false };
  return { label: due.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }), className: "bg-[#F5F3F4] text-[#7A7276]", overdue: false };
}
