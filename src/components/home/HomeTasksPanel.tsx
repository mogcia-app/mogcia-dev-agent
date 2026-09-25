"use client";

import { Check, ListChecks, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import type { useTasks } from "@/hooks/useTasks";
import type { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import type { Task } from "@/types/task";

type View = "open" | "due";

export function HomeTasksPanel({ initialTaskId, initialCreateOpen = false, store, options }: { initialTaskId?: string; initialCreateOpen?: boolean; store: ReturnType<typeof useTasks>; options: ReturnType<typeof useWorkspaceOptions> }) {
  const [view, setView] = useState<View>("open");
  const [expanded, setExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [selectedId, setSelectedId] = useState(initialTaskId ?? "");
  const [message, setMessage] = useState("");
  const manageable = useMemo(() => store.tasks.filter((task) => task.status !== "cancelled" && (task.companyId || store.canEditTask(task))), [store]);
  const open = useMemo(() => manageable.filter((task) => task.status !== "completed").sort(compareTasks), [manageable]);
  const due = useMemo(() => open.filter(isDueSoon), [open]);
  const filtered = view === "due" ? due : open;
  const visible = expanded ? filtered : filtered.slice(0, 5);
  const selected = store.tasks.find((task) => task.id === selectedId) ?? null;
  const canManage = (task: Task) => Boolean(task.companyId) || store.canEditTask(task);
  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(""), 2500); };
  const toggle = async (task: Task) => { try { await store.completeTask(task, task.status !== "completed"); notify(task.status === "completed" ? "未完了に戻しました" : "完了しました"); } catch (error) { notify(error instanceof Error ? error.message : "更新できませんでした"); } };

  return <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_8px_24px_rgba(31,31,34,0.03)]" id="tasks">
    <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold text-[#25242A]"><ListChecks className="h-5 w-5 text-[#D47A95]" />次にやること（タスク）</h2><p className="mt-1 text-xs leading-5 text-[#64748B]">実際に対応する一つひとつの作業です。完了したらチェックします。</p></div>{filtered.length > 5 ? <button className="shrink-0 text-xs font-medium text-[#D47A95]" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "閉じる" : "すべて見る →"}</button> : null}</div>
    <div className="mt-4 flex gap-2 overflow-x-auto"><Tab active={view === "open"} count={open.length} label="未完了" onClick={() => { setView("open"); setExpanded(false); }} /><Tab active={view === "due"} count={due.length} label="期限が近い" onClick={() => { setView("due"); setExpanded(false); }} /></div>
    {message ? <p className="mt-3 text-xs text-[#9B4862]" role="status">{message}</p> : null}{store.error ? <p className="mt-3 text-xs text-red-600" role="alert">{store.error}</p> : null}
    {store.loading ? <div className="mt-4 grid gap-2">{Array.from({ length: 4 }).map((_, index) => <div className="h-10 animate-pulse bg-[#F7F5F5]" key={index} />)}</div> : visible.length ? <div className="mt-3 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">{visible.map((task) => <TaskRow canEdit={canManage(task)} key={task.id} onOpen={() => setSelectedId(task.id)} onToggle={() => toggle(task)} task={task} />)}</div> : <p className="mt-4 py-5 text-center text-sm text-[#64748B]">{view === "due" ? "期限が近いタスクはありません" : "未完了のタスクはありません"}</p>}
    <button className="mt-4 inline-flex h-9 items-center gap-1 border border-[#F1C2D0] px-3 text-sm font-medium text-[#D47A95]" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />タスクを追加</button>
    <TaskDetailDrawer canDelete={selected ? store.canDeleteTask() : false} canEdit={selected ? store.canEditTask(selected) : false} companies={options.companies} currentUserId={store.user?.uid ?? ""} isAdmin={store.isAdmin} key={selected?.id ?? "none"} members={store.members} onClose={() => setSelectedId("")} onDelete={async (id) => { await store.deleteTask(id); setSelectedId(""); notify("削除しました"); }} onDuplicate={async (task) => { await store.duplicateTask(task); notify("複製しました"); }} onSave={async (id, draft) => { await store.updateTask(id, draft); notify("更新しました"); }} onToggle={async (task, value) => { await store.completeTask(task, value); notify(value ? "完了しました" : "未完了に戻しました"); }} products={options.products} projects={options.projects} task={selected} />
    {createOpen ? <TaskFormModal companies={options.companies} currentMember={store.currentMember} members={store.members} onClose={() => setCreateOpen(false)} onSubmit={async (draft) => { await store.createTask(draft); notify("タスクを追加しました"); }} products={options.products} projects={options.projects} /> : null}
  </section>;
}

function Tab({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) { return <button aria-selected={active} className={`h-8 shrink-0 rounded-lg px-4 text-xs font-semibold ${active ? "bg-[#FDF0F4] text-[#9B4862]" : "bg-[#F5F3F4] text-[#64748B]"}`} onClick={onClick} role="tab" type="button">{label} <span className="ml-1">({count})</span></button>; }

function TaskRow({ task, canEdit, onOpen, onToggle }: { task: Task; canEdit: boolean; onOpen: () => void; onToggle: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const due = dueLabel(task);
  return <div className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 sm:grid-cols-[30px_minmax(0,1fr)_minmax(80px,auto)_70px]"><button aria-label={task.status === "completed" ? "未完了に戻す" : "完了にする"} className="grid h-7 w-7 place-items-center disabled:opacity-40" disabled={!canEdit || busy} onClick={() => { setBusy(true); void onToggle().finally(() => setBusy(false)); }} type="button">{task.status === "completed" ? <span className="grid h-4 w-4 place-items-center rounded-[3px] border border-[#D47A95] bg-[#D47A95] text-white"><Check className="h-3 w-3" /></span> : <span className="h-4 w-4 rounded-[3px] border border-[#BCAFB5]" />}</button><button className="min-w-0 text-left" onClick={onOpen} type="button"><span className={`block truncate text-sm font-medium ${task.status === "completed" ? "text-[#94A3B8] line-through" : "text-[#111827]"}`}>{task.title}</span></button><span className="hidden max-w-32 truncate rounded border border-[#E5E7EB] px-2 py-0.5 text-center text-[11px] text-[#475569] sm:block">{task.companyName || task.projectName || "その他"}</span><span className={`text-right text-xs ${due.overdue ? "text-[#9B4862]" : "text-[#64748B]"}`}>{due.label}</span></div>;
}

function compareTasks(a: Task, b: Task) { return (a.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER) || b.createdAt.toMillis() - a.createdAt.toMillis(); }
function isDueSoon(task: Task) { if (!task.dueDate) return false; const end = new Date(); end.setDate(end.getDate() + 7); end.setHours(23, 59, 59, 999); return task.dueDate.toMillis() <= end.getTime(); }
function dueLabel(task: Task) { if (!task.dueDate) return { label: "期限なし", overdue: false }; const due = task.dueDate.toDate(); const today = new Date(); today.setHours(0, 0, 0, 0); return { label: due.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }), overdue: due.getTime() < today.getTime() }; }
