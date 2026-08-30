"use client";

import { CalendarDays, Clock3, X } from "lucide-react";
import { SearchSelect, SingleSelect } from "@/components/ui/select";
import type { TaskDraft, TaskStatus } from "@/types/task";
import type { CompanyOption, ProductOption } from "@/types/workspace-records";

type DraftKey = keyof TaskDraft;

const datePresets = [
  { label: "今日", offset: 0 },
  { label: "明日", offset: 1 },
  { label: "今週末", offset: "weekend" },
  { label: "来週", offset: 7 }
] as const;

const timePresets = [
  { label: "朝", value: "09:00" },
  { label: "昼", value: "12:00" },
  { label: "夕方", value: "17:00" },
  { label: "終業前", value: "18:00" }
];

export function TaskFormFields({
  draft,
  companies,
  products,
  readOnly,
  onChange
}: {
  draft: TaskDraft;
  companies: CompanyOption[];
  products: ProductOption[];
  readOnly: boolean;
  onChange: (draft: TaskDraft) => void;
}) {
  const setValue = (key: DraftKey, value: string) => onChange({ ...draft, [key]: value });
  const onCompanyChange = (value: string) => {
    const company = companies.find((entry) => entry.id === value);
    onChange({ ...draft, companyId: value, companyName: company?.name ?? "" });
  };
  const onProductChange = (value: string) => {
    const product = products.find((entry) => entry.id === value);
    onChange({ ...draft, productId: value, productName: product?.name ?? "" });
  };
  const setDueDate = (value: string) => onChange({ ...draft, dueDate: value, dueTime: draft.dueTime || "18:00" });
  const clearDue = () => onChange({ ...draft, dueDate: "", dueTime: "" });

  return (
    <div className="grid gap-4">
      <Field label="タイトル">
        <input className="task-input" disabled={readOnly} value={draft.title} onChange={(event) => setValue("title", event.target.value)} placeholder="タスク名" />
      </Field>
      <Field label="説明">
        <textarea className="task-input min-h-60 resize-y" disabled={readOnly} value={draft.description} onChange={(event) => setValue("description", event.target.value)} placeholder="作業内容や依頼背景" />
      </Field>
      <div className="grid gap-4">
        <Field label="状態">
          <SingleSelect disabled={readOnly} options={[["todo", "未着手"], ["in_progress", "進行中"], ["waiting", "待機中"], ["completed", "完了"], ["cancelled", "キャンセル"]].map(([value, label]) => ({ value, label }))} value={draft.status} onChange={(value) => setValue("status", value as TaskStatus)} />
        </Field>
      </div>
      <DuePicker draft={draft} readOnly={readOnly} setDueDate={setDueDate} setValue={setValue} clearDue={clearDue} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="会社">
          <SearchSelect clearable disabled={readOnly || companies.length === 0} emptyLabel="会社が未登録です。" options={companies.map((company) => ({ value: company.id, label: company.name }))} placeholder={companies.length === 0 ? "未登録" : "未選択"} value={draft.companyId} onChange={onCompanyChange} />
        </Field>
        <Field label="商材">
          <SearchSelect clearable disabled={readOnly || products.length === 0} emptyLabel="商材が未登録です。" options={products.map((product) => ({ value: product.id, label: product.name, description: product.tagline }))} placeholder={products.length === 0 ? "未登録" : "未選択"} value={draft.productId} onChange={onProductChange} />
        </Field>
      </div>
      {draft.source === "ai" ? (
        <Field label="AI作成理由">
          <textarea className="task-input min-h-44 resize-y" disabled={readOnly} value={draft.aiReason} onChange={(event) => setValue("aiReason", event.target.value)} placeholder="AIが作成した理由や元情報" />
        </Field>
      ) : null}
      <Field label="進捗状況">
        <textarea className="task-input min-h-60 resize-y" disabled={readOnly} value={draft.comments} onChange={(event) => setValue("comments", event.target.value)} placeholder="今どこまで進んでいるか、詰まっていること、次にやること" />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[#655D62]">
      {label}
      {children}
    </label>
  );
}

function DuePicker({
  draft,
  readOnly,
  setDueDate,
  setValue,
  clearDue
}: {
  draft: TaskDraft;
  readOnly: boolean;
  setDueDate: (value: string) => void;
  setValue: (key: DraftKey, value: string) => void;
  clearDue: () => void;
}) {
  const selectedDateLabel = draft.dueDate ? formatSelectedDate(draft.dueDate) : "期限なし";

  return (
    <section className="grid gap-3 border border-[#F0E7E9] bg-[#FFFBFC] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[#655D62]">
          <CalendarDays className="h-4 w-4 text-[#EC6F8B]" />
          <span className="truncate">{selectedDateLabel}</span>
        </span>
        <button className="inline-flex h-8 items-center gap-1 border border-[#F0DEE2] bg-white px-2 text-xs font-medium text-[#8A8186] disabled:opacity-40" disabled={readOnly || !draft.dueDate} onClick={clearDue} type="button">
          <X className="h-3.5 w-3.5" />
          なし
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {datePresets.map((preset) => {
          const value = getPresetDateValue(preset.offset);
          const active = draft.dueDate === value;
          return (
            <button className={`h-10 border px-2 text-sm font-medium disabled:opacity-50 ${active ? "border-[#F7CAD2] bg-[#EC6F8B] text-white" : "border-[#F0E7E9] bg-white text-[#655D62] hover:bg-[#FFF0F3]"}`} disabled={readOnly} key={preset.label} onClick={() => setDueDate(value)} type="button">
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#8A8186]">
          <Clock3 className="h-3.5 w-3.5" />
          時間
        </span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {timePresets.map((preset) => {
            const active = draft.dueTime === preset.value;
            return (
              <button className={`h-9 border px-2 text-xs font-medium disabled:opacity-50 ${active ? "border-[#CFE0F6] bg-[#F1F7FF] text-[#4F78B4]" : "border-[#F0E7E9] bg-white text-[#655D62] hover:bg-[#F7F5F5]"}`} disabled={readOnly || !draft.dueDate} key={preset.value} onClick={() => setValue("dueTime", preset.value)} type="button">
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-[#9A9296] marker:text-[#EC6F8B]">細かく指定</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="日付">
            <input className="task-input" disabled={readOnly} type="date" value={draft.dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field label="時刻">
            <input className="task-input" disabled={readOnly || !draft.dueDate} type="time" value={draft.dueTime} onChange={(event) => setValue("dueTime", event.target.value)} />
          </Field>
        </div>
      </details>
    </section>
  );
}

function getPresetDateValue(offset: number | "weekend"): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (offset === "weekend") {
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? 0 : 7 - day));
    return toDateInputValue(date);
  }
  date.setDate(date.getDate() + offset);
  return toDateInputValue(date);
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatSelectedDate(value: string): string {
  const date = new Date(`${value}T00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const label = date.getTime() === today.getTime() ? "今日" : date.getTime() === tomorrow.getTime() ? "明日" : date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  return `${label}${value ? "" : "期限なし"}`;
}
