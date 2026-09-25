"use client";

import { LayoutTemplate, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { createBusinessTemplate, createEmptyTemplateDraft, deleteBusinessTemplate, duplicateBusinessTemplate, subscribeBusinessTemplates, templateToDraft, toggleTemplateFavorite, updateBusinessTemplate } from "@/lib/templates";
import type { BusinessTemplate, BusinessTemplateDraft, TemplateCategory } from "@/types/template";

const categories: Array<["all" | "favorite" | TemplateCategory, string]> = [
  ["all", "すべて"],
  ["favorite", "よく使う"],
  ["email", "メール"],
  ["phone", "電話トーク"],
  ["meeting", "商談"],
  ["proposal", "提案・資料"],
  ["hearing", "ヒアリング"],
  ["line_sns", "LINE・SNS"],
  ["internal", "社内"]
];

const categoryLabels: Record<TemplateCategory, string> = {
  email: "メール",
  phone: "電話トーク",
  meeting: "商談",
  proposal: "提案・資料",
  hearing: "ヒアリング",
  line_sns: "LINE・SNS",
  internal: "社内",
  other: "その他"
};

const sortOptions = [
  ["updatedDesc", "新しい順"],
  ["name", "名前順"]
] as const;

type SortKey = typeof sortOptions[number][0];

export function TemplatesPageClient() {
  const [templates, setTemplates] = useState<BusinessTemplate[]>([]);
  const [category, setCategory] = useState<"all" | "favorite" | TemplateCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedDesc");
  const [selected, setSelected] = useState<BusinessTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<BusinessTemplate | null>(null);
  const [draft, setDraft] = useState<BusinessTemplateDraft>(() => createEmptyTemplateDraft());
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onError = (source: string) => (nextError: Error) => {
      setError(`${source}: ${nextError.message}`);
      setLoading(false);
    };
    const unsubTemplates = subscribeBusinessTemplates((next) => {
      setTemplates(next);
      setLoading(false);
    }, onError("templates"));
    return () => {
      unsubTemplates();
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates
      .filter((template) => category === "all" || (category === "favorite" ? template.favorite : template.category === category))
      .filter((template) => !needle || [template.title, template.subject, template.description, categoryLabels[template.category], template.content].join(" ").toLowerCase().includes(needle))
      .sort((left, right) => sortTemplates(left, right, sort));
  }, [category, query, sort, templates]);

  const openCreate = () => {
    setDraft(createEmptyTemplateDraft());
    setModal("create");
  };

  const openEdit = (template: BusinessTemplate) => {
    setEditingTemplate(template);
    setDraft(templateToDraft(template));
    setSelected(null);
    setModal("edit");
  };

  const saveTemplate = async () => {
    if (!draft.title.trim() || !draft.content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (modal === "edit" && editingTemplate) {
        await updateBusinessTemplate(editingTemplate, draft);
        setToast("テンプレートを更新しました");
      } else {
        const id = await createBusinessTemplate(draft);
        setToast("テンプレートを作成しました");
        const created = templates.find((template) => template.id === id);
        if (created) setSelected(created);
      }
      setModal(null);
      setEditingTemplate(null);
      setDraft(createEmptyTemplateDraft());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "テンプレートを保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (template: BusinessTemplate) => {
    if (!window.confirm("このテンプレートを削除しますか？")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBusinessTemplate(template.id);
      if (selected?.id === template.id) setSelected(null);
      setToast("テンプレートを削除しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "テンプレートを削除できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async (template: BusinessTemplate) => {
    setSaving(true);
    setError(null);
    try {
      await duplicateBusinessTemplate(template);
      setToast("テンプレートを複製しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "テンプレートを複製できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const copyTemplate = async (template: BusinessTemplate) => {
    await navigator.clipboard.writeText([template.subject, template.content].filter(Boolean).join("\n\n"));
    setToast("テンプレートをコピーしました");
  };

  return (
    <section>
      <PageHeader
        title="テンプレート"
        description="よく使う文章やトークを登録して使い回せます"
        actions={<button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#D47A95] px-4 text-sm font-medium text-white" onClick={openCreate} type="button"><Plus className="h-4 w-4" />テンプレートを追加</button>}
      />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={error} type="error" /></div>

      <section className="mt-5 rounded-xl border border-[#E5E7EB] bg-white p-4 sm:p-5">
        <div className="grid gap-3 border-b border-[#E5E7EB] pb-4 md:grid-cols-[minmax(0,1fr)_180px_200px]">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 text-sm text-[#64748B]"><Search className="h-4 w-4" /><input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="テンプレート名・本文で検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <SingleSelect options={categories.map(([value, label]) => ({ value, label }))} value={category} onChange={(value) => setCategory(value as "all" | "favorite" | TemplateCategory)} />
          <SingleSelect options={sortOptions.map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setSort(value as SortKey)} />
        </div>
        <div className="flex items-center justify-between py-3"><p className="text-sm font-medium text-[#374151]">{filtered.length}件</p></div>
        {loading ? <SkeletonList count={6} media={false} /> : null}
        {!loading && filtered.length === 0 ? <EmptyTemplates onCreate={openCreate} /> : null}
        {!loading && filtered.length ? <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">{filtered.map((template) => <TemplateRow key={template.id} onCopy={() => void copyTemplate(template)} onEdit={() => openEdit(template)} onOpen={() => setSelected(template)} template={template} />)}</div> : null}
      </section>

      {modal ? <TemplateModal draft={draft} mode={modal} onChange={setDraft} onClose={() => { setModal(null); setEditingTemplate(null); }} onSave={saveTemplate} saving={saving} /> : null}
      {selected ? <TemplateDetailDrawer onClose={() => setSelected(null)} onCopy={() => void copyTemplate(selected)} onDelete={() => void removeTemplate(selected)} onDuplicate={() => void duplicateTemplate(selected)} onEdit={() => openEdit(selected)} onFavorite={() => void toggleTemplateFavorite(selected)} template={selected} /> : null}
    </section>
  );
}

function TemplateRow({ template, onOpen, onCopy, onEdit }: { template: BusinessTemplate; onOpen: () => void; onCopy: () => void; onEdit: () => void }) {
  return (
    <article className="grid gap-3 border-b border-[#E5E7EB] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_150px_auto] md:items-center">
      <button className="min-w-0 text-left" onClick={onOpen} type="button"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-[#111827]">{template.title}</span>{template.favorite ? <span className="shrink-0 text-xs font-medium text-[#D47A95]">よく使う</span> : null}</span><span className="mt-1 block truncate text-xs text-[#64748B]">{template.description || template.subject || template.content}</span></button>
      <span className="w-fit rounded-md bg-[#FFF2F5] px-2 py-1 text-xs font-medium text-[#D47A95]">{categoryLabels[template.category]}</span>
      <div className="flex flex-wrap gap-2 md:justify-end"><button className="h-8 rounded-md bg-[#D47A95] px-3 text-xs font-medium text-white" onClick={onCopy} type="button">コピー</button><button className="h-8 rounded-md border border-[#E5E7EB] px-3 text-xs text-[#4B5563]" onClick={onOpen} type="button">内容を見る</button><button className="h-8 rounded-md border border-[#E5E7EB] px-3 text-xs text-[#4B5563]" onClick={onEdit} type="button">編集</button></div>
    </article>
  );
}

function TemplateModal({ draft, mode, saving, onChange, onClose, onSave }: { draft: BusinessTemplateDraft; mode: "create" | "edit"; saving: boolean; onChange: (draft: BusinessTemplateDraft) => void; onClose: () => void; onSave: () => void }) {
  return (
    <Drawer title={mode === "create" ? "テンプレートを作成" : "テンプレートを編集"} onClose={onClose}>
      <div className="grid gap-4">
        <Field label="テンプレート名"><input className="task-input" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="テンプレート名を入力" /></Field>
        <Field label="件名"><input className="task-input" value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })} placeholder="メールの件名を入力" /></Field>
        <Field label="説明"><input className="task-input" value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="用途メモ。空でも大丈夫です" /></Field>
        <SingleSelect label="カテゴリ" options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))} value={draft.category} onChange={(category) => onChange({ ...draft, category: category as TemplateCategory })} />
        <Field label="テンプレート本文"><textarea className="task-input min-h-80 resize-y" value={draft.content} onChange={(event) => onChange({ ...draft, content: event.target.value })} placeholder="本文・構成・質問項目を入力" /></Field>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-[#655D62]"><input className="accent-[#D47A95]" checked={draft.favorite} onChange={(event) => onChange({ ...draft, favorite: event.target.checked })} type="checkbox" />よく使うに表示</label>
        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
          <button className="h-10 rounded-lg border border-[#E2E8F0] px-4 text-sm font-medium text-[#655D62]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-10 rounded-lg bg-[#D47A95] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !draft.title.trim() || !draft.content.trim()} onClick={onSave} type="button">{saving ? "保存中..." : "保存"}</button>
        </div>
      </div>
    </Drawer>
  );
}

function TemplateDetailDrawer({ template, onClose, onCopy, onEdit, onFavorite, onDuplicate, onDelete }: { template: BusinessTemplate; onClose: () => void; onCopy: () => void; onEdit: () => void; onFavorite: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <Drawer title="テンプレート詳細" onClose={onClose}>
      <div className="grid gap-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#D47A95]">{categoryLabels[template.category]}</p>
              <h2 className="mt-1 text-base font-semibold text-[#111827]">{template.title}</h2>
            </div>
            <button className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-xs font-medium text-[#D47A95]" onClick={onFavorite} type="button">{template.favorite ? "よく使うから外す" : "よく使うに追加"}</button>
          </div>
          {template.subject ? <p className="mt-3 rounded-lg bg-[#FDF0F4] px-3 py-2 text-sm font-medium leading-6 text-[#9B4862]">件名: {template.subject}</p> : null}
          {template.description ? <p className="mt-3 text-sm font-semibold leading-6 text-[#655D62]">{template.description}</p> : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#655D62]">本文</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-4 text-sm font-semibold leading-7 text-[#111827]">{template.content}</pre>
        </div>
        <div className="grid gap-3 text-sm">
          <Info label="作成者" value={template.createdByName || "未設定"} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E2E8F0] pt-4">
          <button className="h-10 rounded-lg border border-[#F1C2D0] px-4 text-sm font-medium text-[#9B4862]" onClick={onDelete} type="button">削除</button>
          <button className="h-10 rounded-lg border border-[#E2E8F0] px-4 text-sm font-medium text-[#655D62]" onClick={onDuplicate} type="button">複製</button>
          <button className="h-10 rounded-lg border border-[#E2E8F0] px-4 text-sm font-medium text-[#655D62]" onClick={onEdit} type="button">編集</button>
          <button className="h-10 rounded-lg bg-[#D47A95] px-4 text-sm font-medium text-white" onClick={onCopy} type="button">本文をコピー</button>
        </div>
      </div>
    </Drawer>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[#E2E8F0] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E2E8F0] bg-white/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-semibold text-[#111827]">{title}</h2>
          <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#F6F7F9]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

function EmptyTemplates({ onCreate }: { onCreate: () => void }) {
  return <div className="p-8"><EmptyState icon={LayoutTemplate} title="テンプレートがまだありません" description="よく使う文章やトークを登録して、営業対応を効率化しましょう。" /><button className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-lg bg-[#D47A95] px-4 text-sm font-medium text-white" onClick={onCreate} type="button"><Plus className="h-4 w-4" />テンプレートを作成</button></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold text-[#64748B]">{label}</p><p className="mt-1 text-sm font-medium text-[#111827]">{value}</p></div>;
}

function sortTemplates(left: BusinessTemplate, right: BusinessTemplate, sort: SortKey) {
  if (sort === "name") return left.title.localeCompare(right.title, "ja");
  return right.updatedAt.toMillis() - left.updatedAt.toMillis();
}
