"use client";

import { SearchSelect, SingleSelect } from "@/components/ui/select";
import type { MemberOption, TaskDraft, TaskStatus } from "@/types/task";
import type { CompanyOption, MeetingOption, ProjectOption } from "@/types/workspace-records";

type DraftKey = keyof TaskDraft;

export function TaskFormFields({
  draft,
  members,
  companies,
  projects,
  meetings,
  readOnly,
  canAssign,
  currentUserId,
  onChange
}: {
  draft: TaskDraft;
  members: MemberOption[];
  companies: CompanyOption[];
  projects: ProjectOption[];
  meetings: MeetingOption[];
  readOnly: boolean;
  canAssign: boolean;
  currentUserId?: string;
  onChange: (draft: TaskDraft) => void;
}) {
  const setValue = (key: DraftKey, value: string) => onChange({ ...draft, [key]: value });
  const onAssigneeChange = (value: string) => {
    const member = members.find((entry) => entry.id === value);
    onChange({ ...draft, assigneeId: value, assigneeName: member?.name ?? value });
  };
  const selectedAssignee = members.find((member) => member.id === draft.assigneeId);
  const isAssignedToOtherMember = Boolean(draft.assigneeId && currentUserId && draft.assigneeId !== currentUserId);
  const filteredProjects = draft.companyId ? projects.filter((project) => project.companyId === draft.companyId) : projects;
  const filteredMeetings = draft.projectId ? meetings.filter((meeting) => meeting.projectId === draft.projectId) : meetings;
  const onCompanyChange = (value: string) => {
    const company = companies.find((entry) => entry.id === value);
    onChange({ ...draft, companyId: value, companyName: company?.name ?? "", projectId: "", projectName: "", meetingId: "", meetingTitle: "" });
  };
  const onProjectChange = (value: string) => {
    const project = projects.find((entry) => entry.id === value);
    onChange({ ...draft, projectId: value, projectName: project?.name ?? "", companyId: project?.companyId ?? draft.companyId, companyName: project?.companyName ?? draft.companyName, meetingId: "", meetingTitle: "" });
  };
  const onMeetingChange = (value: string) => {
    const meeting = meetings.find((entry) => entry.id === value);
    onChange({ ...draft, meetingId: value, meetingTitle: meeting?.name ?? "", companyId: meeting?.companyId ?? draft.companyId, companyName: meeting?.companyName ?? draft.companyName, projectId: meeting?.projectId ?? draft.projectId, projectName: meeting?.projectName ?? draft.projectName });
  };

  return (
    <div className="grid gap-4">
      <Field label="タイトル">
        <input className="task-input" disabled={readOnly} value={draft.title} onChange={(event) => setValue("title", event.target.value)} placeholder="タスク名" />
      </Field>
      <Field label="説明">
        <textarea className="task-input min-h-24 resize-none" disabled={readOnly} value={draft.description} onChange={(event) => setValue("description", event.target.value)} placeholder="作業内容や依頼背景" />
      </Field>
      <div className="grid gap-4">
        <Field label="状態">
          <SingleSelect disabled={readOnly} options={[["todo", "未着手"], ["in_progress", "進行中"], ["waiting", "待機中"], ["completed", "完了"], ["cancelled", "キャンセル"]].map(([value, label]) => ({ value, label }))} value={draft.status} onChange={(value) => setValue("status", value as TaskStatus)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="担当者">
          <SearchSelect disabled={readOnly || !canAssign} options={members.map((member) => ({ value: member.id, label: member.name }))} value={draft.assigneeId} onChange={onAssigneeChange} />
          {isAssignedToOtherMember ? <span className="text-xs font-semibold text-[#EC6F8B]">保存すると{selectedAssignee?.name ?? draft.assigneeName}さんのタスク欄に表示されます。</span> : null}
        </Field>
        <Field label="期限日">
          <input className="task-input" disabled={readOnly} type="date" value={draft.dueDate} onChange={(event) => setValue("dueDate", event.target.value)} />
        </Field>
        <Field label="期限時刻">
          <input className="task-input" disabled={readOnly} type="time" value={draft.dueTime} onChange={(event) => setValue("dueTime", event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="会社">
          <SearchSelect clearable disabled={readOnly || companies.length === 0} emptyLabel="会社が未登録です。" options={companies.map((company) => ({ value: company.id, label: company.name }))} placeholder={companies.length === 0 ? "未登録" : "未選択"} value={draft.companyId} onChange={onCompanyChange} />
        </Field>
        <Field label="案件">
          <SearchSelect clearable disabled={readOnly || filteredProjects.length === 0} emptyLabel="案件が未登録です。" options={filteredProjects.map((project) => ({ value: project.id, label: project.name, description: project.companyName ?? undefined }))} placeholder={filteredProjects.length === 0 ? "未登録" : "未選択"} value={draft.projectId} onChange={onProjectChange} />
        </Field>
        <Field label="会議">
          <SearchSelect clearable disabled={readOnly || filteredMeetings.length === 0} emptyLabel="会議が未登録です。" options={filteredMeetings.map((meeting) => ({ value: meeting.id, label: meeting.name, description: meeting.companyName ?? undefined }))} placeholder={filteredMeetings.length === 0 ? "未登録" : "未選択"} value={draft.meetingId} onChange={onMeetingChange} />
        </Field>
      </div>
      {draft.source === "ai" ? (
        <Field label="AI作成理由">
          <textarea className="task-input min-h-20 resize-none" disabled={readOnly} value={draft.aiReason} onChange={(event) => setValue("aiReason", event.target.value)} placeholder="AIが作成した理由や元情報" />
        </Field>
      ) : null}
      <Field label="チェックリスト">
        <textarea className="task-input min-h-20 resize-none" disabled={readOnly} value={draft.checklistText} onChange={(event) => setValue("checklistText", event.target.value)} placeholder="1行に1項目" />
      </Field>
      <Field label="進捗状況">
        <textarea className="task-input min-h-28 resize-none" disabled={readOnly} value={draft.comments} onChange={(event) => setValue("comments", event.target.value)} placeholder="今どこまで進んでいるか、詰まっていること、次にやること" />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[#655D62]">
      {label}
      {children}
    </label>
  );
}
