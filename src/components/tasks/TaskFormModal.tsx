"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { createEmptyTaskDraft } from "@/lib/task-utils";
import { TaskFormFields } from "@/components/tasks/TaskFormFields";
import type { MemberOption, TaskDraft } from "@/types/task";
import type { CompanyOption, ProductOption } from "@/types/workspace-records";

export function TaskFormModal({ currentMember, members, companies, products, onClose, onSubmit }: { currentMember: MemberOption; members: MemberOption[]; companies: CompanyOption[]; products: ProductOption[]; onClose: () => void; onSubmit: (draft: TaskDraft) => Promise<void> }) {
  const initialDraft = useMemo(() => createEmptyTaskDraft(currentMember), [currentMember]);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-none border border-[#F0DEE2] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#29272A]">新しいタスク</h2>
          <button className="grid h-10 w-10 place-items-center rounded-none hover:bg-[#FFF2F5]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <TaskFormFields companies={companies} draft={draft} onChange={setDraft} products={products} readOnly={false} />
        <div className="mt-6 flex justify-end gap-3">
          <button className="h-11 rounded-none border border-[#F0DEE2] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !draft.title.trim()} onClick={() => void save()} type="button">保存</button>
        </div>
      </section>
    </div>
  );
}
