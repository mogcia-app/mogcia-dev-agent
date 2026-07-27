"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { createEmptyCalendarDraft } from "@/lib/calendar-utils";
import type { CalendarEventDraft, CalendarEventType } from "@/types/calendar";
import type { MemberOption } from "@/types/task";
import type { CompanyOption, MeetingOption, ProjectOption } from "@/types/workspace-records";

const eventTypeOptions: Array<[CalendarEventType, string]> = [
  ["appointment", "商談"],
  ["meeting", "打ち合わせ"],
  ["phone", "電話"],
  ["visit", "訪問"],
  ["internal", "社内MTG"],
  ["deskwork", "作業時間"],
  ["personal", "私用"],
  ["other", "その他"]
];

export function CalendarEventFormModal({ currentMember, members, companies, projects, meetings, isAdmin, onClose, onSubmit }: { currentMember: MemberOption; members: MemberOption[]; companies: CompanyOption[]; projects: ProjectOption[]; meetings: MeetingOption[]; isAdmin: boolean; onClose: () => void; onSubmit: (draft: CalendarEventDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(() => createEmptyCalendarDraft(currentMember));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const setValue = <K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const memberOptions = useMemo(() => {
    const selectableMembers = isAdmin ? members : [currentMember];
    return selectableMembers.length ? selectableMembers : [currentMember];
  }, [currentMember, isAdmin, members]);
  const filteredProjects = draft.companyId ? projects.filter((project) => project.companyId === draft.companyId) : projects;
  const filteredMeetings = draft.projectId ? meetings.filter((meeting) => meeting.projectId === draft.projectId) : meetings;

  const save = async () => {
    if (!draft.title.trim()) return;
    const end = addOneHour(draft.startDate, draft.startTime);
    setSaving(true);
    await onSubmit({
      ...draft,
      endDate: end.date,
      endTime: end.time,
      reminder: "0",
      recurrence: "none"
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-[#F0E7E9] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#2B2B2B]">予定を追加</h2>
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#FFF0F3]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-5">
          <Field label="予定名"><input className="task-input" value={draft.title} onChange={(event) => setValue("title", event.target.value)} placeholder="例: 八女上陽ゴルフ倶楽部 提案" /></Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="種類"><select className="task-input" value={draft.eventType} onChange={(event) => setValue("eventType", event.target.value as CalendarEventType)}>{eventTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            {isAdmin ? <Field label="担当者"><select className="task-input" value={draft.assigneeId} onChange={(event) => { const member = memberOptions.find((entry) => entry.id === event.target.value); setDraft((current) => ({ ...current, assigneeId: event.target.value, assigneeName: member?.name ?? event.target.value })); }}>{memberOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field> : <Field label="担当者"><div className="flex h-11 items-center rounded-md border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#655D62]">{currentMember.name}</div></Field>}
            <Field label="終日"><button className={`h-11 rounded-md border px-4 text-sm font-bold ${draft.allDay ? "border-[#F7CAD2] bg-[#FFF0F3] text-[#EC6F8B]" : "border-[#F0E7E9] bg-[#FFFBFC] text-[#655D62]"}`} onClick={() => setValue("allDay", !draft.allDay)} type="button">{draft.allDay ? "終日" : "時間指定"}</button></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="日付"><input className="task-input" type="date" value={draft.startDate} onChange={(event) => setValue("startDate", event.target.value)} /></Field>
            <Field label="開始時刻"><input className="task-input" disabled={draft.allDay} type="time" value={draft.startTime} onChange={(event) => setValue("startTime", event.target.value)} /></Field>
          </div>
          <Field label="メモ"><textarea className="task-input min-h-24 resize-none" value={draft.description} onChange={(event) => setValue("description", event.target.value)} placeholder="必要なことだけメモできます" /></Field>
          <button className="h-10 rounded-full border border-[#F0E7E9] text-sm font-bold text-[#EC6F8B]" onClick={() => setDetailsOpen((current) => !current)} type="button">{detailsOpen ? "詳細を閉じる" : "詳細を追加"}</button>
          {detailsOpen ? <div className="grid gap-4 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4 sm:grid-cols-2">
            <Field label="場所"><input className="task-input" value={draft.location} onChange={(event) => setValue("location", event.target.value)} placeholder="会議室 / オンライン" /></Field>
            <Field label="オンラインURL"><input className="task-input" value={draft.meetingUrl} onChange={(event) => setValue("meetingUrl", event.target.value)} /></Field>
            <Field label="参加者"><input className="task-input" value={draft.attendeeNames} onChange={(event) => setValue("attendeeNames", event.target.value)} placeholder="カンマ区切り" /></Field>
            <Field label="関連会社"><select className="task-input" disabled={companies.length === 0} value={draft.companyId} onChange={(event) => { const company = companies.find((entry) => entry.id === event.target.value); setDraft((current) => ({ ...current, companyId: event.target.value, companyName: company?.name ?? "", projectId: "", projectName: "", meetingId: "" })); }}><option value="">{companies.length === 0 ? "未登録" : "未選択"}</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
            <Field label="関連案件"><select className="task-input" disabled={filteredProjects.length === 0} value={draft.projectId} onChange={(event) => { const project = projects.find((entry) => entry.id === event.target.value); setDraft((current) => ({ ...current, projectId: event.target.value, projectName: project?.name ?? "", companyId: project?.companyId ?? current.companyId, companyName: project?.companyName ?? current.companyName, meetingId: "" })); }}><option value="">{filteredProjects.length === 0 ? "未登録" : "未選択"}</option>{filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
            <Field label="関連会議"><select className="task-input" disabled={filteredMeetings.length === 0} value={draft.meetingId} onChange={(event) => { const meeting = meetings.find((entry) => entry.id === event.target.value); setDraft((current) => ({ ...current, meetingId: event.target.value, companyId: meeting?.companyId ?? current.companyId, companyName: meeting?.companyName ?? current.companyName, projectId: meeting?.projectId ?? current.projectId, projectName: meeting?.projectName ?? current.projectName })); }}><option value="">{filteredMeetings.length === 0 ? "未登録" : "未選択"}</option>{filteredMeetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.name}</option>)}</select></Field>
          </div> : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="h-11 rounded-full border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-11 rounded-full bg-[#F47E96] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !draft.title.trim()} onClick={() => void save()} type="button">保存</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}{children}</label>;
}

function addOneHour(date: string, time: string): { date: string; time: string } {
  const start = new Date(`${date}T${time || "10:00"}`);
  const end = Number.isNaN(start.getTime()) ? new Date() : new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    date: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    time: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
  };
}
