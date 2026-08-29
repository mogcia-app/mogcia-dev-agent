"use client";

import { Building2, CalendarDays, CheckCircle2, Copy, Package, Pencil, Trash2, UserRound, X } from "lucide-react";
import { useState } from "react";
import { taskToDraft } from "@/lib/task-utils";
import { TaskFormFields } from "@/components/tasks/TaskFormFields";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { MemberOption, Task, TaskDraft } from "@/types/task";
import type { CompanyOption, ProductOption } from "@/types/workspace-records";

export function TaskDetailDrawer({
  task,
  members,
  companies,
  products,
  canEdit,
  canDelete,
  isAdmin,
  currentUserId,
  onClose,
  onSave,
  onToggle,
  onDelete,
  onDuplicate
}: {
  task: Task | null;
  members: MemberOption[];
  companies: CompanyOption[];
  products: ProductOption[];
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  currentUserId?: string;
  onClose: () => void;
  onSave: (taskId: string, draft: TaskDraft) => Promise<void>;
  onToggle: (task: Task, completed: boolean) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onDuplicate: (task: Task) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TaskDraft | null>(task ? taskToDraft(task) : null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!task || !draft) return null;

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(task.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    await onDelete(task.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1F1F22]/20 backdrop-blur-sm">
      <aside className="ml-auto h-full w-full max-w-2xl overflow-auto border-l border-[#F0DEE2] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#EC6F8B]">タスク詳細</p>
            <h2 className="mt-1 text-2xl font-bold text-[#29272A]">{task.title || "無題のタスク"}</h2>
            <p className="mt-2 text-xs font-semibold text-[#8A8186]">作成者: {getUserDisplayNameById(task.createdBy, task.createdByName)} / 更新: {task.updatedAt.toDate().toLocaleDateString("ja-JP")}</p>
            {task.completedAt ? <p className="mt-1 text-xs font-semibold text-[#70A55F]">完了: {task.completedAt.toDate().toLocaleDateString("ja-JP")}</p> : null}
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-none hover:bg-[#FFF2F5]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        {editing ? <TaskFormFields companies={companies} draft={draft} onChange={setDraft} products={products} readOnly={!canEdit} /> : <TaskReadView task={task} />}
        {!canEdit ? <p className="mt-4 rounded-xl bg-[#FFF7F8] px-4 py-3 text-sm font-semibold text-[#8A6A70]">他メンバーのタスクは閲覧のみです。</p> : null}
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F0DEE2] px-4 text-sm font-bold text-[#6F676B]" onClick={() => void onDuplicate(task)} type="button"><Copy className="h-4 w-4" />複製</button>
            {canDelete ? <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F6CBD2] px-4 text-sm font-bold text-[#E65A78]" onClick={() => void remove()} type="button"><Trash2 className="h-4 w-4" />削除</button> : null}
          </div>
          <div className="flex gap-2">
            {editing ? <><button className="h-11 rounded-lg border border-[#F0DEE2] px-5 text-sm font-bold text-[#6F676B]" onClick={() => { setDraft(taskToDraft(task)); setEditing(false); }} type="button">キャンセル</button><button className="h-11 rounded-lg bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={!canEdit || saving || !draft.title.trim()} onClick={() => void save()} type="button">保存</button></> : <><button className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#F0DEE2] px-5 text-sm font-bold text-[#6F676B]" disabled={!canEdit} onClick={() => setEditing(true)} type="button"><Pencil className="h-4 w-4" />編集</button><button className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" onClick={() => void onToggle(task, true)} disabled={!canEdit} type="button"><CheckCircle2 className="h-4 w-4" />完了にする</button></>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TaskReadView({ task }: { task: Task }) {
  const priority = task.priority === "high" ? "高" : task.priority === "low" ? "低" : "中";
  const status = task.status === "in_progress" ? "作業中" : task.status === "waiting" ? "待機中" : "未着手";
  return <div className="space-y-6"><div>{task.description ? <p className="whitespace-pre-wrap text-sm font-medium leading-7 text-[#4F474B]">{task.description}</p> : <p className="text-sm text-[#9A9296]">説明はありません。</p>}</div><dl className="grid gap-4 rounded-xl border border-[#EFE3E6] bg-[#FCFBFB] p-4 sm:grid-cols-2"><Detail icon={CheckCircle2} label="状態" value={status} /><Detail icon={CalendarDays} label="期限" value={task.dueDate ? task.dueDate.toDate().toLocaleDateString("ja-JP") : "期限なし"} /><Detail icon={CheckCircle2} label="優先度" value={priority} /><Detail icon={UserRound} label="担当" value={getUserDisplayNameById(task.assigneeId, task.assigneeName)} />{task.companyName ? <Detail icon={Building2} label="会社" value={task.companyName} /> : null}{task.productName ? <Detail icon={Package} label="商材" value={task.productName} /> : null}</dl>{task.aiReason ? <section className="rounded-xl border border-[#F0DEE2] bg-[#FFF9FA] p-4"><p className="text-xs font-bold text-[#EC6F8B]">MOGCIA</p><p className="mt-2 text-sm font-medium leading-6 text-[#5E565A]">{task.aiReason}</p></section> : null}</div>;
}

function Detail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) { return <div className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 text-[#A3999D]" /><div><dt className="text-xs font-semibold text-[#9A9296]">{label}</dt><dd className="mt-1 text-sm font-bold text-[#3D383A]">{value}</dd></div></div>; }
