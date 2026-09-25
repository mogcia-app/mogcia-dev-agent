"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { MultiSelect, SearchSelect } from "@/components/ui/select";
import { createEmptyCalendarDraft } from "@/lib/calendar-utils";
import type { CalendarEventDraft, CalendarEventType, CalendarScheduleMode } from "@/types/calendar";
import type { MemberOption } from "@/types/task";
import type { CompanyOption, LeadOption } from "@/types/workspace-records";

const weekdayOptions = [[1, "月"], [2, "火"], [3, "水"], [4, "木"], [5, "金"], [6, "土"], [0, "日"]] as const;
const eventTypeOptions: Array<[CalendarEventType, string]> = [["sales", "アポ・営業"], ["meeting", "商談・打ち合わせ"], ["content", "投稿・コンテンツ"], ["customer_support", "顧客対応"], ["internal", "社内予定"], ["deskwork", "作業"], ["personal", "個人予定"], ["other", "その他"]];
const scheduleModeOptions: Array<[CalendarScheduleMode, string, string]> = [["single_day", "その日のみ", "開始・終了時刻を指定"], ["multi_day", "日またぎ", "日付の範囲だけ指定"], ["all_day", "終日", "1日を終日で確保"]];
const halfHourOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

type RelatedOption = {
  value: string;
  label: string;
  description: string;
  type: "lead" | "company";
  id: string;
  name: string;
  contactName: string;
  convertedCompanyId?: string | null;
  productId?: string | null;
  productName?: string | null;
};

export function CalendarEventFormModal({ currentMember, members, companies, leads, isAdmin, initialDraft, onClose, onSubmit }: { currentMember: MemberOption; members: MemberOption[]; companies: CompanyOption[]; leads: LeadOption[]; isAdmin: boolean; initialDraft?: CalendarEventDraft; onClose: () => void; onSubmit: (draft: CalendarEventDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(() => initialDraft ?? createEmptyCalendarDraft(currentMember));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setValue = <K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const memberOptions = useMemo(() => {
    const selectableMembers = isAdmin ? members : [currentMember];
    return selectableMembers.length ? selectableMembers : [currentMember];
  }, [currentMember, isAdmin, members]);
  const relatedOptions = useMemo<RelatedOption[]>(() => [
    ...leads.map((lead) => ({
      value: `lead:${lead.id}`,
      label: lead.name,
      description: ["営業リスト", lead.contactName ? `担当: ${lead.contactName}` : "", lead.phone || lead.email || "", lead.status ? leadStatusLabel(lead.status) : ""].filter(Boolean).join(" / "),
      type: "lead" as const,
      id: lead.id,
      name: lead.name,
      contactName: lead.contactName ?? "",
      convertedCompanyId: lead.convertedCompanyId ?? null,
      productId: lead.productId ?? null,
      productName: lead.productName ?? null
    })),
    ...companies.map((company) => ({
      value: `company:${company.id}`,
      label: company.name,
      description: ["会社一覧", company.contactName ? `担当: ${company.contactName}` : "", company.phone || company.email || "", company.status ? companyStatusLabel(company.status) : ""].filter(Boolean).join(" / "),
      type: "company" as const,
      id: company.id,
      name: company.name,
      contactName: company.contactName ?? ""
    }))
  ], [companies, leads]);
  const selectedRelatedValue = draft.relatedType && draft.relatedId ? `${draft.relatedType}:${draft.relatedId}` : "";

  const save = async () => {
    const title = draft.title.trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    try {
      const startsAt = new Date(`${draft.startDate}T${draft.scheduleMode === "single_day" ? draft.startTime : "00:00"}`);
      const endsAt = new Date(`${draft.scheduleMode === "multi_day" ? draft.endDate : draft.startDate}T${draft.scheduleMode === "single_day" ? draft.endTime : "23:59"}`);
      if (draft.eventType !== "content" && endsAt <= startsAt) throw new Error("終了日時は開始日時より後にしてください。");
      if (draft.recurrence === "weekly" && (!draft.recurrenceWeekdays.length || !draft.recurrenceEndDate)) throw new Error("繰り返す曜日と終了日を指定してください。");
      await onSubmit({ ...draft, title, reminder: "0" });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "予定を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-medium text-[#111827]">{initialDraft ? "予定を編集" : "予定を追加"}</h2><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#FDF0F4]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-4">
          {error ? <p className="rounded-lg bg-[#FDF0F4] px-4 py-3 text-sm font-medium text-[#9B4862]">{error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2"><Field label="予定名"><input className="task-input" placeholder="例：Instagram投稿、〇〇社アポ" value={draft.title} onChange={(event) => setValue("title", event.target.value)} /></Field><Field label="予定の種類"><select className="task-input" value={draft.eventType} onChange={(event) => setValue("eventType", event.target.value as CalendarEventType)}>{eventTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="関連する会社・営業リスト（任意）">
            <SearchSelect clearable disabled={relatedOptions.length === 0} emptyLabel="該当する関連先が見つかりません" options={relatedOptions} placeholder={relatedOptions.length === 0 ? "営業リスト・会社が未登録です" : "会社名・担当者名で検索"} value={selectedRelatedValue} onChange={(value) => {
              const option = relatedOptions.find((entry) => entry.value === value);
              if (!option) { setDraft((current) => ({ ...current, relatedType: "", relatedId: "", relatedName: "", relatedContactName: "", companyId: "", companyName: "", projectId: "", projectName: "", meetingId: "" })); return; }
              const nextCompanyId = option.type === "company" ? option.id : option.convertedCompanyId ?? "";
              setDraft((current) => ({ ...current, relatedType: option.type, relatedId: option.id, relatedName: option.name, relatedContactName: option.contactName, companyId: nextCompanyId, companyName: option.type === "company" ? option.name : "", productId: current.productId || option.productId || "", productName: current.productName || option.productName || "", productIds: Array.from(new Set([...current.productIds, option.productId].filter((id): id is string => Boolean(id)))), productNames: Array.from(new Set([...current.productNames, option.productName].filter((name): name is string => Boolean(name)))), projectId: "", projectName: "", meetingId: "" }));
            }} />
          </Field>
          <div><p className="mb-2 text-sm font-medium text-[#655D62]">日時の指定方法</p><div className="grid gap-2 sm:grid-cols-3">{scheduleModeOptions.map(([value, label, description]) => <button className={`rounded-xl border px-3 py-3 text-left transition ${draft.scheduleMode === value ? "border-[#D47A95] bg-[#FDF0F4] text-[#8F3F59]" : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#F1C2D0]"}`} key={value} onClick={() => setDraft((current) => ({ ...current, scheduleMode: value, allDay: value !== "single_day", endDate: value === "multi_day" ? current.endDate : current.startDate }))} type="button"><strong className="block text-sm">{label}</strong><span className="mt-1 block text-[11px] font-normal opacity-70">{description}</span></button>)}</div></div>
          {draft.scheduleMode === "single_day" ? <div className={`grid gap-3 ${draft.eventType === "content" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}><Field label="日付"><input className="task-input" type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value, endDate: event.target.value }))} /></Field><Field label="開始時刻"><input className="task-input" max={draft.eventType === "content" ? undefined : "23:00"} step={1800} type="time" value={draft.startTime} onChange={(event) => { const startTime = event.target.value; setDraft((current) => ({ ...current, startTime, endTime: current.endTime > startTime ? current.endTime : nextHalfHour(startTime) })); }} /></Field>{draft.eventType !== "content" ? <Field label="終了時刻"><select className="task-input" value={draft.endTime} onChange={(event) => setValue("endTime", event.target.value)}>{halfHourOptions.filter((time) => time > draft.startTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></Field> : null}</div> : draft.scheduleMode === "multi_day" ? <div className="grid gap-3 sm:grid-cols-2"><Field label="開始日"><input className="task-input" type="date" value={draft.startDate} onChange={(event) => { const startDate = event.target.value; setDraft((current) => ({ ...current, startDate, endDate: current.endDate < startDate ? startDate : current.endDate })); }} /></Field><Field label="終了日"><input className="task-input" min={draft.startDate} type="date" value={draft.endDate} onChange={(event) => setValue("endDate", event.target.value)} /></Field></div> : <Field label="日付"><input className="task-input" type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value, endDate: event.target.value }))} /></Field>}
          {draft.eventType === "content" ? <p className="-mt-2 text-xs text-[#64748B]">投稿系の予定には終了時間を設定しません。</p> : null}
          {!initialDraft ? <section className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-4"><label className="flex items-center gap-2 text-sm font-medium text-[#655D62]"><input checked={draft.recurrence === "weekly"} onChange={(event) => setDraft((current) => ({ ...current, recurrence: event.target.checked ? "weekly" : "none", recurrenceWeekdays: current.recurrenceWeekdays.length ? current.recurrenceWeekdays : [new Date(`${current.startDate}T00:00`).getDay()] }))} type="checkbox" />毎週繰り返す</label>{draft.recurrence === "weekly" ? <div className="mt-4 grid gap-4"><div><p className="mb-2 text-xs font-medium text-[#64748B]">曜日（複数選択可）</p><div className="flex flex-wrap gap-2">{weekdayOptions.map(([value, label]) => { const active = draft.recurrenceWeekdays.includes(value); return <button className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-medium ${active ? "border-[#D47A95] bg-[#D47A95] text-white" : "border-[#E5E7EB] bg-white text-[#655D62]"}`} key={value} onClick={() => setDraft((current) => ({ ...current, recurrenceWeekdays: active ? current.recurrenceWeekdays.filter((day) => day !== value) : [...current.recurrenceWeekdays, value] }))} type="button">{label}</button>; })}</div></div><Field label="繰り返し終了日"><input className="task-input" min={draft.startDate} type="date" value={draft.recurrenceEndDate} onChange={(event) => setValue("recurrenceEndDate", event.target.value)} /></Field><p className="text-xs leading-5 text-[#64748B]">選択した曜日の予定を一括登録します。繰り返し予定は会社の「次回予定」には表示されません。</p></div> : null}</section> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {isAdmin ? <Field label="担当者"><SearchSelect options={memberOptions.map((member) => ({ value: member.id, label: member.name }))} value={draft.assigneeId} onChange={(value) => { const member = memberOptions.find((entry) => entry.id === value); setDraft((current) => ({ ...current, assigneeId: value, assigneeName: member?.name ?? value, attendeeIds: current.attendeeIds.filter((id) => id !== value), attendeeMemberNames: members.filter((entry) => current.attendeeIds.includes(entry.id) && entry.id !== value).map((entry) => entry.name) })); }} /></Field> : <Field label="担当者"><div className="flex h-11 items-center rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#4B5563]">{currentMember.name}</div></Field>}
            <MultiSelect label="同行者" options={members.filter((member) => member.id !== draft.assigneeId).map((member) => ({ value: member.id, label: member.name }))} placeholder="同行者を選択" values={draft.attendeeIds} onChange={(attendeeIds) => setDraft((current) => ({ ...current, attendeeIds, attendeeMemberNames: members.filter((member) => attendeeIds.includes(member.id)).map((member) => member.name) }))} />
          </div>
          <Field label="メモ"><textarea className="task-input resize-y" style={{ minHeight: "6rem" }} value={draft.description} onChange={(event) => setValue("description", event.target.value)} placeholder="必要なことだけ入力" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-sm font-medium text-[#475569]" onClick={onClose} type="button">キャンセル</button><button className="h-10 rounded-lg bg-[#D47A95] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !draft.title.trim()} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存"}</button></div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}{children}</label>;
}

function nextHalfHour(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "00:30";
  const total = Math.min(1410, (Math.floor(((hours * 60) + minutes) / 30) + 1) * 30);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function leadStatusLabel(status: string): string {
  return ({
    contacted: "連絡済み",
    appointment: "アポ獲得",
    document_sent: "資料請求",
    sent: "送付済",
    meeting: "打ち合わせ中",
    considering: "検討中",
    won: "成約",
    lost: "失注",
    hold: "保留",
    contacting: "対応中",
    new: "新規"
  } as Record<string, string>)[status] ?? status;
}

function companyStatusLabel(status: string): string {
  return ({
    lead: "営業前",
    prospect: "提案中",
    customer: "契約中",
    inactive: "停止中",
    archived: "アーカイブ"
  } as Record<string, string>)[status] ?? status;
}
