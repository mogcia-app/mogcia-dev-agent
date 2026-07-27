"use client";

import type { ChangeEvent } from "react";
import type { MemberOption, TaskDraft, TaskPriority, TaskSource, TaskStatus } from "@/types/task";
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
  onChange
}: {
  draft: TaskDraft;
  members: MemberOption[];
  companies: CompanyOption[];
  projects: ProjectOption[];
  meetings: MeetingOption[];
  readOnly: boolean;
  canAssign: boolean;
  onChange: (draft: TaskDraft) => void;
}) {
  const setValue = (key: DraftKey, value: string) => onChange({ ...draft, [key]: value });
  const onAssigneeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const member = members.find((entry) => entry.id === event.target.value);
    onChange({ ...draft, assigneeId: event.target.value, assigneeName: member?.name ?? event.target.value });
  };
  const filteredProjects = draft.companyId ? projects.filter((project) => project.companyId === draft.companyId) : projects;
  const filteredMeetings = draft.projectId ? meetings.filter((meeting) => meeting.projectId === draft.projectId) : meetings;
  const onCompanyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const company = companies.find((entry) => entry.id === event.target.value);
    onChange({ ...draft, companyId: event.target.value, companyName: company?.name ?? "", projectId: "", projectName: "", meetingId: "", meetingTitle: "" });
  };
  const onProjectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const project = projects.find((entry) => entry.id === event.target.value);
    onChange({ ...draft, projectId: event.target.value, projectName: project?.name ?? "", companyId: project?.companyId ?? draft.companyId, companyName: project?.companyName ?? draft.companyName, meetingId: "", meetingTitle: "" });
  };
  const onMeetingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const meeting = meetings.find((entry) => entry.id === event.target.value);
    onChange({ ...draft, meetingId: event.target.value, meetingTitle: meeting?.name ?? "", companyId: meeting?.companyId ?? draft.companyId, companyName: meeting?.companyName ?? draft.companyName, projectId: meeting?.projectId ?? draft.projectId, projectName: meeting?.projectName ?? draft.projectName });
  };

  return (
    <div className="grid gap-4">
      <Field label="タイトル">
        <input className="task-input" disabled={readOnly} value={draft.title} onChange={(event) => setValue("title", event.target.value)} placeholder="タスク名" />
      </Field>
      <Field label="説明">
        <textarea className="task-input min-h-24 resize-none" disabled={readOnly} value={draft.description} onChange={(event) => setValue("description", event.target.value)} placeholder="作業内容や依頼背景" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="状態">
          <select className="task-input" disabled={readOnly} value={draft.status} onChange={(event) => setValue("status", event.target.value as TaskStatus)}>
            <option value="todo">未着手</option>
            <option value="in_progress">進行中</option>
            <option value="waiting">待機中</option>
            <option value="completed">完了</option>
            <option value="cancelled">キャンセル</option>
          </select>
        </Field>
        <Field label="優先度">
          <select className="task-input" disabled={readOnly} value={draft.priority} onChange={(event) => setValue("priority", event.target.value as TaskPriority)}>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </Field>
        <Field label="作成元">
          <select className="task-input" disabled={readOnly} value={draft.source} onChange={(event) => setValue("source", event.target.value as TaskSource)}>
            <option value="manual">手動</option>
            <option value="ai">AI作成</option>
            <option value="automation">自動</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="担当者">
          <select className="task-input" disabled={readOnly || !canAssign} value={draft.assigneeId} onChange={onAssigneeChange}>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
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
          <select className="task-input" disabled={readOnly || companies.length === 0} value={draft.companyId} onChange={onCompanyChange}>
            <option value="">{companies.length === 0 ? "未登録" : "未選択"}</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </Field>
        <Field label="案件">
          <select className="task-input" disabled={readOnly || filteredProjects.length === 0} value={draft.projectId} onChange={onProjectChange}>
            <option value="">{filteredProjects.length === 0 ? "未登録" : "未選択"}</option>
            {filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </Field>
        <Field label="会議">
          <select className="task-input" disabled={readOnly || filteredMeetings.length === 0} value={draft.meetingId} onChange={onMeetingChange}>
            <option value="">{filteredMeetings.length === 0 ? "未登録" : "未選択"}</option>
            {filteredMeetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.name}</option>)}
          </select>
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
      <Field label="コメント">
        <textarea className="task-input min-h-20 resize-none" disabled={readOnly} value={draft.comments} onChange={(event) => setValue("comments", event.target.value)} placeholder="メモや共有事項" />
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
