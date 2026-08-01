"use client";

import { SearchSelect, SingleSelect } from "@/components/ui/select";
import type { TaskDraft, TaskStatus } from "@/types/task";
import type { CompanyOption, ProductOption } from "@/types/workspace-records";

type DraftKey = keyof TaskDraft;

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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="期限日">
          <input className="task-input" disabled={readOnly} type="date" value={draft.dueDate} onChange={(event) => setValue("dueDate", event.target.value)} />
        </Field>
        <Field label="期限時刻">
          <input className="task-input" disabled={readOnly} type="time" value={draft.dueTime} onChange={(event) => setValue("dueTime", event.target.value)} />
        </Field>
      </div>
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
    <label className="grid gap-2 text-sm font-bold text-[#655D62]">
      {label}
      {children}
    </label>
  );
}
