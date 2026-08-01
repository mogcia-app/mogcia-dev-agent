"use client";

import { Copy, Trash2, X } from "lucide-react";
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

  if (!task || !draft) return null;

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(task.id, draft);
      onClose();
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
            <p className="mt-2 text-xs font-semibold text-[#8A8186]">作成者: {getUserDisplayNameById(task.createdBy, task.createdByName)} / 更新: {task.updatedAt.toDate().toLocaleString("ja-JP")}</p>
            {task.completedAt ? <p className="mt-1 text-xs font-semibold text-[#70A55F]">完了: {task.completedAt.toDate().toLocaleString("ja-JP")}</p> : null}
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-none hover:bg-[#FFF2F5]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <TaskFormFields companies={companies} draft={draft} onChange={setDraft} products={products} readOnly={!canEdit} />
        {!canEdit ? <p className="mt-4 rounded-none bg-[#FFF7F8] px-4 py-3 text-sm font-semibold text-[#8A6A70]">他メンバーのタスクは閲覧のみです。</p> : null}
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F0DEE2] px-4 text-sm font-bold text-[#6F676B]" onClick={() => void onDuplicate(task)} type="button"><Copy className="h-4 w-4" />複製</button>
            {canDelete ? <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F6CBD2] px-4 text-sm font-bold text-[#E65A78]" onClick={() => void remove()} type="button"><Trash2 className="h-4 w-4" />削除</button> : null}
          </div>
          <div className="flex gap-2">
            <button className="h-11 rounded-none border border-[#F0DEE2] px-5 text-sm font-bold text-[#6F676B]" onClick={() => void onToggle(task, task.status !== "completed")} disabled={!canEdit} type="button">{task.status === "completed" ? "未完了に戻す" : "完了にする"}</button>
            <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={!canEdit || saving || !draft.title.trim()} onClick={() => void save()} type="button">保存</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
