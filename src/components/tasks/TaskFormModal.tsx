"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { createEmptyTaskDraft } from "@/lib/task-utils";
import { TaskFormFields } from "@/components/tasks/TaskFormFields";
import type { MemberOption, TaskDraft } from "@/types/task";
import type { CompanyOption, MeetingOption, ProjectOption } from "@/types/workspace-records";

export function TaskFormModal({ currentMember, members, companies, projects, meetings, isAdmin, onClose, onSubmit }: { currentMember: MemberOption; members: MemberOption[]; companies: CompanyOption[]; projects: ProjectOption[]; meetings: MeetingOption[]; isAdmin: boolean; onClose: () => void; onSubmit: (draft: TaskDraft) => Promise<void> }) {
  const initialDraft = useMemo(() => createEmptyTaskDraft(currentMember), [currentMember]);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    await onSubmit(draft);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#29272A]">新しいタスク</h2>
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#FFF2F5]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <TaskFormFields canAssign={isAdmin} companies={companies} draft={draft} meetings={meetings} members={isAdmin ? members : [currentMember]} onChange={setDraft} projects={projects} readOnly={false} />
        <div className="mt-6 flex justify-end gap-3">
          <button className="h-11 rounded-full border border-[#F0DEE2] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-11 rounded-full bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !draft.title.trim()} onClick={() => void save()} type="button">保存</button>
        </div>
      </section>
    </div>
  );
}
