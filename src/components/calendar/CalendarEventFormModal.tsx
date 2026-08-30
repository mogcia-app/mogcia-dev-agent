"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { MultiSelect, SearchSelect, SingleSelect } from "@/components/ui/select";
import { createEmptyCalendarDraft } from "@/lib/calendar-utils";
import type { CalendarEventDraft, CalendarEventType, CalendarMeetingMethod } from "@/types/calendar";
import type { MemberOption } from "@/types/task";
import type { CompanyOption, LeadOption, MeetingOption, ProductOption, ProjectOption } from "@/types/workspace-records";

const eventTypeOptions: Array<[CalendarEventType, string]> = [
  ["sales", "打ち合わせ"],
  ["customer_support", "顧客対応"],
  ["internal", "社内"],
  ["deskwork", "作業"],
  ["personal", "私用"],
  ["other", "その他"]
];

const meetingMethodOptions: Array<[CalendarMeetingMethod, string]> = [
  ["online", "オンライン"],
  ["visit", "訪問"],
  ["phone", "電話"],
  ["in_person", "対面"],
  ["other", "その他"]
];

const durationOptions = [30, 60, 90, 120, 150, 180, 210, 240, 300, 360].map((minutes) => ({
  value: String(minutes),
  label: minutes < 60 ? `${minutes}分` : minutes % 60 === 0 ? `${minutes / 60}時間` : `${Math.floor(minutes / 60)}時間${minutes % 60}分`
}));

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

export function CalendarEventFormModal({ currentMember, members, companies, leads, products, projects, meetings, isAdmin, initialDraft, onClose, onSubmit }: { currentMember: MemberOption; members: MemberOption[]; companies: CompanyOption[]; leads: LeadOption[]; products: ProductOption[]; projects: ProjectOption[]; meetings: MeetingOption[]; isAdmin: boolean; initialDraft?: CalendarEventDraft; onClose: () => void; onSubmit: (draft: CalendarEventDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(() => initialDraft ?? createEmptyCalendarDraft(currentMember));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setValue = <K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const calendarEventTypeOptions = useMemo(() => {
    if (draft.eventType !== "meeting") return eventTypeOptions;
    return [["meeting", "打ち合わせ"] as [CalendarEventType, string], ...eventTypeOptions.filter(([value]) => value !== "sales")];
  }, [draft.eventType]);
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
  const filteredProjects = draft.companyId ? projects.filter((project) => project.companyId === draft.companyId) : projects;
  const filteredMeetings = draft.projectId ? meetings.filter((meeting) => meeting.projectId === draft.projectId) : meetings;
  const selectedProducts = draft.productIds.map((productId) => products.find((product) => product.id === productId)).filter((product): product is ProductOption => Boolean(product));

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...draft, reminder: "0", recurrence: "none" });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "予定を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-medium text-[#2B2B2B]">{initialDraft ? "予定を編集" : "予定を追加"}</h2>
          <button className="grid h-10 w-10 place-items-center rounded-none hover:bg-[#FFF0F3]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-5">
          {error ? <p className="rounded-none bg-[#FFF0F3] px-4 py-3 text-sm font-medium text-[#D94F6E]">{error}</p> : null}
          <Field label="予定名"><input className="task-input" value={draft.title} onChange={(event) => setValue("title", event.target.value)} placeholder="例: 提案打ち合わせ" /></Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label="予定タイプ"><SingleSelect options={calendarEventTypeOptions.map(([value, label]) => ({ value, label }))} value={draft.eventType} onChange={(value) => setValue("eventType", value as CalendarEventType)} /></Field>
            <Field label="実施方法"><SingleSelect options={meetingMethodOptions.map(([value, label]) => ({ value, label }))} value={draft.meetingMethod} onChange={(value) => setValue("meetingMethod", value as CalendarMeetingMethod)} /></Field>
            {isAdmin ? <Field label="担当者"><SearchSelect options={memberOptions.map((member) => ({ value: member.id, label: member.name }))} value={draft.assigneeId} onChange={(value) => { const member = memberOptions.find((entry) => entry.id === value); setDraft((current) => ({ ...current, assigneeId: value, assigneeName: member?.name ?? value, attendeeIds: current.attendeeIds.filter((id) => id !== value), attendeeMemberNames: members.filter((entry) => current.attendeeIds.includes(entry.id) && entry.id !== value).map((entry) => entry.name) })); }} /></Field> : <Field label="担当者"><div className="flex h-11 items-center rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-medium text-[#655D62]">{currentMember.name}</div></Field>}
            <Field label="終日"><button className={`h-11 rounded-none border px-4 text-sm font-medium ${draft.allDay ? "border-[#F7CAD2] bg-[#FFF0F3] text-[#EC6F8B]" : "border-[#F0E7E9] bg-[#FFFBFC] text-[#655D62]"}`} onClick={() => setValue("allDay", !draft.allDay)} type="button">{draft.allDay ? "終日" : "時間指定"}</button></Field>
          </div>
          <MultiSelect
            label="同行者"
            options={members.filter((member) => member.id !== draft.assigneeId).map((member) => ({ value: member.id, label: member.name }))}
            placeholder="同行者を選択"
            values={draft.attendeeIds}
            onChange={(attendeeIds) => setDraft((current) => ({
              ...current,
              attendeeIds,
              attendeeMemberNames: members.filter((member) => attendeeIds.includes(member.id)).map((member) => member.name)
            }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="関連先">
              <SearchSelect
                clearable
                disabled={relatedOptions.length === 0}
                emptyLabel="該当する関連先が見つかりません"
                options={relatedOptions}
                placeholder={relatedOptions.length === 0 ? "営業リスト・会社が未登録です" : "会社名・担当者名で検索"}
                value={selectedRelatedValue}
                onChange={(value) => {
                  const option = relatedOptions.find((entry) => entry.value === value);
                  if (!option) {
                    setDraft((current) => ({ ...current, relatedType: "", relatedId: "", relatedName: "", relatedContactName: "", companyId: "", companyName: "", projectId: "", projectName: "", meetingId: "" }));
                    return;
                  }
                  const nextCompanyId = option.type === "company" ? option.id : option.convertedCompanyId ?? "";
                  setDraft((current) => ({
                    ...current,
                    title: shouldReplaceTitleWithRelatedName(current.title, current.relatedName) ? option.name : current.title,
                    relatedType: option.type,
                    relatedId: option.id,
                    relatedName: option.name,
                    relatedContactName: option.contactName,
                    companyId: nextCompanyId,
                    companyName: option.type === "company" ? option.name : "",
                    productId: current.productId || option.productId || "",
                    productName: current.productName || option.productName || "",
                    productIds: Array.from(new Set([...current.productIds, option.productId].filter((id): id is string => Boolean(id)))),
                    productNames: Array.from(new Set([...current.productNames, option.productName].filter((name): name is string => Boolean(name)))),
                    projectId: "",
                    projectName: "",
                    meetingId: ""
                  }));
                }}
              />
              {draft.relatedName ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 py-2 text-xs font-medium text-[#655D62]"><span>{draft.relatedName}{draft.relatedContactName ? ` / ${draft.relatedContactName}` : ""}</span><span className="rounded-none bg-white px-2 py-1 text-[#EC6F8B]">{draft.relatedType === "lead" ? "営業リスト" : "会社一覧"}</span><button className="text-[#D94F6E]" onClick={() => setDraft((current) => ({ ...current, relatedType: "", relatedId: "", relatedName: "", relatedContactName: "", companyId: "", companyName: "", projectId: "", projectName: "", meetingId: "" }))} type="button">解除</button></div> : null}
            </Field>
            <Field label="商材">
              <MultiSelect
                disabled={products.length === 0}
                emptyLabel="商材が未登録です。"
                options={products.map((product) => ({ value: product.id, label: product.name, description: product.tagline }))}
                placeholder={products.length === 0 ? "未登録" : "商材を選択"}
                values={draft.productIds}
                onChange={(productIds) => {
                  const selected = productIds.map((productId) => products.find((entry) => entry.id === productId)).filter((product): product is ProductOption => Boolean(product));
                  setDraft((current) => ({
                    ...current,
                    productId: selected[0]?.id ?? "",
                    productName: selected[0]?.name ?? "",
                    productIds,
                    productNames: selected.map((product) => product.name)
                  }));
                }}
              />
              {selectedProducts.length ? <span className="mt-1 text-xs font-semibold text-[#9A8F94]">{selectedProducts.map((product) => product.name).join(" / ")}</span> : null}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="日付"><input className="task-input" type="date" value={draft.startDate} onChange={(event) => { const startDate = event.target.value; setDraft((current) => ({ ...current, startDate, endDate: startDate })); }} /></Field>
            <Field label="開始時刻"><input className="task-input" disabled={draft.allDay} step={1800} type="time" value={draft.startTime} onChange={(event) => setValue("startTime", event.target.value)} /></Field>
            <Field label="所要時間">
              <select className="task-input" disabled={draft.allDay} value={String(draft.durationMinutes)} onChange={(event) => setValue("durationMinutes", Number(event.target.value))}>
                {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="メモ"><textarea className="task-input min-h-60 resize-y" value={draft.description} onChange={(event) => setValue("description", event.target.value)} placeholder="必要なことだけメモできます" /></Field>
          <button className="h-10 rounded-none border border-[#F0E7E9] text-sm font-medium text-[#EC6F8B]" onClick={() => setDetailsOpen((current) => !current)} type="button">{detailsOpen ? "詳細を閉じる" : "詳細を追加"}</button>
          {detailsOpen ? <div className="grid gap-4 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 sm:grid-cols-2">
            <Field label="場所"><input className="task-input" value={draft.location} onChange={(event) => setValue("location", event.target.value)} placeholder="会議室 / オンライン" /></Field>
            <Field label="オンラインURL"><input className="task-input" value={draft.meetingUrl} onChange={(event) => setValue("meetingUrl", event.target.value)} /></Field>
            <Field label="外部参加者・補足"><input className="task-input" value={draft.attendeeNames} onChange={(event) => setValue("attendeeNames", event.target.value)} placeholder="社外の参加者名などをカンマ区切りで入力" /></Field>
            <Field label="関連会社"><SearchSelect clearable disabled={companies.length === 0} emptyLabel="会社が未登録です。" options={companies.map((company) => ({ value: company.id, label: company.name }))} placeholder={companies.length === 0 ? "未登録" : "未選択"} value={draft.companyId} onChange={(value) => { const company = companies.find((entry) => entry.id === value); setDraft((current) => ({ ...current, companyId: value, companyName: company?.name ?? "", relatedType: value ? "company" : current.relatedType, relatedId: value || current.relatedId, relatedName: company?.name ?? current.relatedName, relatedContactName: company?.contactName ?? current.relatedContactName, projectId: "", projectName: "", meetingId: "" })); }} /></Field>
            <Field label="関連案件"><SearchSelect clearable disabled={filteredProjects.length === 0} emptyLabel="案件が未登録です。" options={filteredProjects.map((project) => ({ value: project.id, label: project.name, description: project.companyName ?? undefined }))} placeholder={filteredProjects.length === 0 ? "未登録" : "未選択"} value={draft.projectId} onChange={(value) => { const project = projects.find((entry) => entry.id === value); setDraft((current) => ({ ...current, projectId: value, projectName: project?.name ?? "", companyId: project?.companyId ?? current.companyId, companyName: project?.companyName ?? current.companyName, meetingId: "" })); }} /></Field>
            <Field label="関連会議"><SearchSelect clearable disabled={filteredMeetings.length === 0} emptyLabel="会議が未登録です。" options={filteredMeetings.map((meeting) => ({ value: meeting.id, label: meeting.name, description: meeting.companyName ?? undefined }))} placeholder={filteredMeetings.length === 0 ? "未登録" : "未選択"} value={draft.meetingId} onChange={(value) => { const meeting = meetings.find((entry) => entry.id === value); setDraft((current) => ({ ...current, meetingId: value, companyId: meeting?.companyId ?? current.companyId, companyName: meeting?.companyName ?? current.companyName, projectId: meeting?.projectId ?? current.projectId, projectName: meeting?.projectName ?? current.projectName })); }} /></Field>
          </div> : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-medium text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-11 rounded-none bg-[#F47E96] px-6 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !draft.title.trim()} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存"}</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}{children}</label>;
}

function shouldReplaceTitleWithRelatedName(title: string, relatedName?: string): boolean {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return true;
  return Boolean(relatedName && trimmedTitle === relatedName);
}

function leadStatusLabel(status: string): string {
  return ({
    appointment: "アポ獲得",
    document_sent: "資料請求",
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
