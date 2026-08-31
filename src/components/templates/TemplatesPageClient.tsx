"use client";

import { Copy, Edit2, FileText, LayoutTemplate, Play, Plus, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { SearchSelect, SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { subscribeCompaniesMaster } from "@/lib/companies";
import { subscribeLeads } from "@/lib/leads";
import { subscribeProductsMaster } from "@/lib/products";
import { createBusinessTemplate, createEmptyTemplateDraft, deleteBusinessTemplate, duplicateBusinessTemplate, generateTemplateContent, subscribeBusinessTemplates, templateToDraft, toggleTemplateFavorite, updateBusinessTemplate } from "@/lib/templates";
import { leadStatusLabels } from "@/lib/lead-utils";
import type { Company } from "@/types/company";
import type { Lead } from "@/types/lead";
import type { Product } from "@/types/product";
import type { BusinessTemplate, BusinessTemplateDraft, TemplateCategory, TemplateRelatedTarget } from "@/types/template";

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
  ["updatedDesc", "更新日 新しい順"],
  ["updatedAsc", "更新日 古い順"],
  ["name", "名前順"],
  ["favorite", "よく使う順"],
  ["usage", "使用回数順"]
] as const;

type SortKey = typeof sortOptions[number][0];

export function TemplatesPageClient() {
  const [templates, setTemplates] = useState<BusinessTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<"all" | "favorite" | TemplateCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedDesc");
  const [selected, setSelected] = useState<BusinessTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<BusinessTemplate | null>(null);
  const [draft, setDraft] = useState<BusinessTemplateDraft>(() => createEmptyTemplateDraft());
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [useTemplate, setUseTemplate] = useState<BusinessTemplate | null>(null);
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
    const unsubLeads = subscribeLeads(setLeads, onError("leads"));
    const unsubCompanies = subscribeCompaniesMaster(setCompanies, onError("companies"));
    const unsubProducts = subscribeProductsMaster((next) => setProducts(next.filter((product) => product.status !== "archived")), onError("products"));
    return () => {
      unsubTemplates();
      unsubLeads();
      unsubCompanies();
      unsubProducts();
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates
      .filter((template) => category === "all" || (category === "favorite" ? template.favorite : template.category === category))
      .filter((template) => !needle || [template.title, template.subject, template.description, categoryLabels[template.category], template.content].join(" ").toLowerCase().includes(needle))
      .sort((left, right) => sortTemplates(left, right, sort));
  }, [category, query, sort, templates]);

  const favoriteTemplates = useMemo(() => templates.filter((template) => template.favorite).sort((left, right) => right.usageCount - left.usageCount || right.updatedAt.toMillis() - left.updatedAt.toMillis()).slice(0, 5), [templates]);
  const recentlyUsed = useMemo(() => templates.filter((template) => template.lastUsedAt).sort((left, right) => (right.lastUsedAt?.toMillis() ?? 0) - (left.lastUsedAt?.toMillis() ?? 0)).slice(0, 5), [templates]);
  const categoryCounts = useMemo(() => countByCategory(templates), [templates]);

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

  return (
    <section>
      <PageHeader
        title="テンプレート集"
        description="営業・商談・ヒアリングなどで使えるテンプレートを管理します。"
        actions={<button className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#EC6F8B] px-5 text-sm font-medium text-white" onClick={openCreate} type="button"><Plus className="h-4 w-4" />新しいテンプレートを作成</button>}
      />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={error} type="error" /></div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {categories.map(([value, label]) => <button className={`h-10 shrink-0 rounded-lg border px-4 text-sm font-medium ${category === value ? "border-[#EC6F8B] bg-[#EC6F8B] text-white" : "border-[#E5E0DD] bg-white text-[#655D62]"}`} key={value} onClick={() => setCategory(value)} type="button">{label}</button>)}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid content-start gap-5">
          <SidePanel title="よく使うテンプレート">
            {favoriteTemplates.length ? favoriteTemplates.map((template, index) => <FavoriteRow index={index} key={template.id} onOpen={() => setSelected(template)} template={template} />) : <p className="text-sm font-medium text-[#8A8186]">お気に入りはまだありません</p>}
          </SidePanel>
          <SidePanel title="カテゴリ一覧">
            <div className="grid gap-1">
              {categories.filter(([value]) => value !== "all" && value !== "favorite").map(([value, label]) => <button className="flex h-10 items-center justify-between rounded-lg px-3 text-sm font-medium text-[#655D62] hover:bg-[#FFFBFC]" key={value} onClick={() => setCategory(value)} type="button"><span>{label}</span><span className="text-xs text-[#AAA]">{categoryCounts[value as TemplateCategory] ?? 0}</span></button>)}
            </div>
          </SidePanel>
        </aside>

        <main className="min-w-0 rounded-xl border border-[#E8E3E1] bg-white shadow-[0_10px_28px_rgba(31,31,34,0.04)]">
          <div className="grid gap-3 border-b border-[#F0E7E9] p-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-[#E5E0DD] bg-[#FCFBFA] px-3 text-sm font-semibold text-[#777]">
              <Search className="h-4 w-4" />
              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="テンプレートを検索..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <SingleSelect options={sortOptions.map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setSort(value as SortKey)} />
          </div>
          {loading ? <div className="p-4"><SkeletonList count={6} media={false} /></div> : null}
          {!loading && filtered.length === 0 ? <EmptyTemplates onCreate={openCreate} /> : null}
          <div className="divide-y divide-[#F0E7E9]">
            {filtered.map((template) => (
              <TemplateRow
                key={template.id}
                onDelete={() => void removeTemplate(template)}
                onDuplicate={() => void duplicateTemplate(template)}
                onEdit={() => openEdit(template)}
                onFavorite={() => void toggleTemplateFavorite(template)}
                onOpen={() => setSelected(template)}
                onUse={() => setUseTemplate(template)}
                template={template}
              />
            ))}
          </div>
        </main>
      </div>

      <section className="mt-5 rounded-xl border border-[#E8E3E1] bg-white p-5 shadow-[0_10px_28px_rgba(31,31,34,0.04)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#2B2B2B]">テンプレートを使って作成する</h2>
            <p className="mt-1 text-sm font-semibold text-[#8A8186]">会社情報や商材情報をもとに、AIが実際に使える内容を作成します。</p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#EC6F8B] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={!templates.length} onClick={() => setUseTemplate(templates[0] ?? null)} type="button"><Sparkles className="h-4 w-4" />作成を始める</button>
        </div>
      </section>

      <SidePanel className="mt-5" title="最近使ったテンプレート">
        {recentlyUsed.length ? <div className="grid gap-2 md:grid-cols-3">{recentlyUsed.map((template) => <button className="rounded-lg border border-[#F0E7E9] bg-white p-3 text-left" key={template.id} onClick={() => setUseTemplate(template)} type="button"><span className="block truncate text-sm font-semibold text-[#2B2B2B]">{template.title}</span><span className="mt-1 block text-xs font-medium text-[#8A8186]">{template.lastUsedAt ? formatDate(template.lastUsedAt.toDate()) : ""}</span></button>)}</div> : <p className="text-sm font-medium text-[#8A8186]">最近使ったテンプレートはありません</p>}
      </SidePanel>

      {modal ? <TemplateModal draft={draft} mode={modal} onChange={setDraft} onClose={() => { setModal(null); setEditingTemplate(null); }} onSave={saveTemplate} saving={saving} /> : null}
      {selected ? <TemplateDetailDrawer onClose={() => setSelected(null)} onDuplicate={() => void duplicateTemplate(selected)} onEdit={() => openEdit(selected)} onFavorite={() => void toggleTemplateFavorite(selected)} onUse={() => setUseTemplate(selected)} template={selected} /> : null}
      {useTemplate ? <UseTemplateDrawer companies={companies} leads={leads} onClose={() => setUseTemplate(null)} onError={setError} onToast={setToast} products={products} template={useTemplate} /> : null}
    </section>
  );
}

function TemplateRow({ template, onOpen, onUse, onFavorite, onEdit, onDuplicate, onDelete }: { template: BusinessTemplate; onOpen: () => void; onUse: () => void; onFavorite: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="grid gap-3 px-4 py-3 transition hover:bg-[#FFFBFC] md:grid-cols-[minmax(220px,1fr)_minmax(180px,300px)_220px] md:items-center">
      <button className="min-w-0 text-left" onClick={onOpen} type="button">
        <span className="block truncate text-sm font-medium text-[#2B2B2B]">{template.title}</span>
        {template.subject ? <span className="mt-1 block truncate text-xs font-normal text-[#8A8186]">{template.subject}</span> : null}
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-fit shrink-0 rounded-md bg-[#FFF2F5] px-2 py-1 text-xs font-medium text-[#EC6F8B]">{categoryLabels[template.category]}</span>
        {template.description ? <span className="min-w-0 truncate text-xs font-normal text-[#6F676B]">{template.description}</span> : null}
      </div>
      <div className="flex flex-nowrap gap-2 md:justify-end">
        <IconButton active={template.favorite} label="お気に入り" onClick={onFavorite}><Star className={`h-4 w-4 ${template.favorite ? "fill-[#EC6F8B]" : ""}`} /></IconButton>
        <IconButton label="使う" onClick={onUse} primary><Play className="h-4 w-4" /></IconButton>
        <IconButton label="編集" onClick={onEdit}><Edit2 className="h-4 w-4" /></IconButton>
        <IconButton label="複製" onClick={onDuplicate}><Copy className="h-4 w-4" /></IconButton>
        <IconButton danger label="削除" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
    </div>
  );
}

function IconButton({ label, children, primary = false, danger = false, active = false, onClick }: { label: string; children: React.ReactNode; primary?: boolean; danger?: boolean; active?: boolean; onClick: () => void }) {
  return (
    <button
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-sm transition ${primary ? "border-[#EC6F8B] bg-[#EC6F8B] text-white" : danger ? "border-[#F7CAD2] bg-white text-[#D94F6E] hover:bg-[#FFF0F3]" : active ? "border-[#F7CAD2] bg-[#FFF0F3] text-[#EC6F8B]" : "border-[#F0E7E9] bg-white text-[#655D62] hover:bg-[#FFF8FA] hover:text-[#EC6F8B]"}`}
      onClick={onClick}
      title={label}
      type="button"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function UseTemplateDrawer({ template, leads, companies, products, onClose, onToast, onError }: { template: BusinessTemplate; leads: Lead[]; companies: Company[]; products: Product[]; onClose: () => void; onToast: (message: string | null) => void; onError: (message: string | null) => void }) {
  const [relatedKey, setRelatedKey] = useState("");
  const [productId, setProductId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const relatedOptions = useMemo(() => buildRelatedOptions(leads, companies), [companies, leads]);
  const selectedRelated = relatedOptions.find((option) => option.value === relatedKey)?.target ?? null;

  const generate = async () => {
    setGenerating(true);
    onError(null);
    try {
      const result = await generateTemplateContent({ templateId: template.id, relatedSource: selectedRelated?.source, relatedId: selectedRelated?.id, productId });
      setSubject(result.subject);
      setBody(result.body);
      onToast("生成しました");
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "生成できませんでした。");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText([subject, body].filter(Boolean).join("\n\n"));
    onToast("コピーしました");
  };

  return (
    <Drawer title="テンプレートを使う" onClose={onClose}>
      <div className="grid gap-5">
        <div className="rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4">
          <p className="text-xs font-semibold text-[#EC6F8B]">{categoryLabels[template.category]}</p>
          <h3 className="mt-1 text-base font-semibold text-[#2B2B2B]">{template.title}</h3>
          {template.scene ? <p className="mt-1 text-sm font-semibold text-[#8A8186]">{template.scene}</p> : null}
        </div>
        <SearchSelect clearable emptyLabel="関連先がありません。" label="関連先" options={relatedOptions.map((option) => ({ value: option.value, label: option.label, description: option.description }))} placeholder="会社名・担当者名で検索" value={relatedKey} onChange={(nextKey) => { setRelatedKey(nextKey); const nextTarget = relatedOptions.find((option) => option.value === nextKey)?.target; if (nextTarget?.productId) setProductId(nextTarget.productId); }} />
        <SearchSelect clearable emptyLabel="商材がありません。" label="商材" options={products.map((product) => ({ value: product.id, label: product.name, description: product.tagline }))} placeholder="商材を選択" value={productId} onChange={setProductId} />
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#EC6F8B] px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={generating} onClick={() => void generate()} type="button"><Sparkles className="h-4 w-4" />{generating ? "生成中..." : "AIで内容を生成"}</button>
        <Field label="タイトル / 件名"><input className="task-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="生成後に編集できます" /></Field>
        <Field label="本文"><textarea className="task-input min-h-80 resize-y" value={body} onChange={(event) => setBody(event.target.value)} placeholder="生成後に編集できます" /></Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-lg border border-[#F0E7E9] px-4 text-sm font-medium text-[#655D62]" onClick={() => void generate()} type="button" disabled={generating}>再生成</button>
          <button className="h-10 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!subject && !body} onClick={() => void copy()} type="button">コピー</button>
        </div>
      </div>
    </Drawer>
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
        <label className="inline-flex items-center gap-2 text-sm font-medium text-[#655D62]"><input className="accent-[#EC6F8B]" checked={draft.favorite} onChange={(event) => onChange({ ...draft, favorite: event.target.checked })} type="checkbox" />よく使うに表示</label>
        <div className="flex justify-end gap-2 border-t border-[#F0E7E9] pt-4">
          <button className="h-10 rounded-lg border border-[#F0E7E9] px-4 text-sm font-medium text-[#655D62]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-10 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !draft.title.trim() || !draft.content.trim()} onClick={onSave} type="button">{saving ? "保存中..." : "保存"}</button>
        </div>
      </div>
    </Drawer>
  );
}

function TemplateDetailDrawer({ template, onClose, onUse, onEdit, onFavorite, onDuplicate }: { template: BusinessTemplate; onClose: () => void; onUse: () => void; onEdit: () => void; onFavorite: () => void; onDuplicate: () => void }) {
  return (
    <Drawer title="テンプレート詳細" onClose={onClose}>
      <div className="grid gap-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#EC6F8B]">{categoryLabels[template.category]}</p>
              <h2 className="mt-1 text-base font-semibold text-[#2B2B2B]">{template.title}</h2>
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-[#F0E7E9] text-[#EC6F8B]" onClick={onFavorite} type="button" aria-label="お気に入り"><Star className={`h-5 w-5 ${template.favorite ? "fill-[#EC6F8B]" : ""}`} /></button>
          </div>
          {template.subject ? <p className="mt-3 rounded-lg bg-[#FFF0F3] px-3 py-2 text-sm font-medium leading-6 text-[#B84563]">件名: {template.subject}</p> : null}
          {template.description ? <p className="mt-3 text-sm font-semibold leading-6 text-[#655D62]">{template.description}</p> : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#655D62]">本文</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-sm font-semibold leading-7 text-[#2B2B2B]">{template.content}</pre>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <Info label="作成者" value={template.createdByName || "未設定"} />
          <Info label="最終更新" value={formatDate(template.updatedAt.toDate())} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#F0E7E9] pt-4">
          <button className="h-10 rounded-lg border border-[#F0E7E9] px-4 text-sm font-medium text-[#655D62]" onClick={onDuplicate} type="button">複製</button>
          <button className="h-10 rounded-lg border border-[#F0E7E9] px-4 text-sm font-medium text-[#655D62]" onClick={onEdit} type="button">編集</button>
          <button className="h-10 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={onUse} type="button">使う</button>
        </div>
      </div>
    </Drawer>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[#EAE5E3] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#F0E7E9] bg-white/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-semibold text-[#2B2B2B]">{title}</h2>
          <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#F8F4F3]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

function SidePanel({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return <section className={`rounded-xl border border-[#E8E3E1] bg-white p-4 shadow-[0_10px_28px_rgba(31,31,34,0.04)] ${className}`}><h2 className="mb-3 text-sm font-semibold text-[#2B2B2B]">{title}</h2>{children}</section>;
}

function FavoriteRow({ template, index, onOpen }: { template: BusinessTemplate; index: number; onOpen: () => void }) {
  return <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#FFFBFC]" onClick={onOpen} type="button"><span className="text-xs font-semibold text-[#EC6F8B]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#2B2B2B]">{template.title}</span><span className="mt-1 block text-xs font-medium text-[#8A8186]">{categoryLabels[template.category]}</span></span><Star className="h-4 w-4 fill-[#EC6F8B] text-[#EC6F8B]" /></button>;
}

function EmptyTemplates({ onCreate }: { onCreate: () => void }) {
  return <div className="p-8"><EmptyState icon={LayoutTemplate} title="テンプレートがまだありません" description="よく使う文章やトークを登録して、営業対応を効率化しましょう。" /><button className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={onCreate} type="button"><Plus className="h-4 w-4" />テンプレートを作成</button></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold text-[#8A8186]">{label}</p><p className="mt-1 text-sm font-medium text-[#2B2B2B]">{value}</p></div>;
}

function buildRelatedOptions(leads: Lead[], companies: Company[]) {
  const leadOptions = leads.map((lead) => ({
    value: `lead:${lead.id}`,
    label: lead.companyName,
    description: ["営業リスト", lead.contactName, leadStatusLabels[lead.status]].filter(Boolean).join(" / "),
    target: { source: "lead", id: lead.id, name: lead.companyName, contactName: lead.contactName, status: lead.status, productId: lead.productId, productName: lead.productName } satisfies TemplateRelatedTarget
  }));
  const companyOptions = companies.map((company) => ({
    value: `company:${company.id}`,
    label: company.name,
    description: ["会社", company.primaryContactName, company.status].filter(Boolean).join(" / "),
    target: { source: "company", id: company.id, name: company.name, contactName: company.primaryContactName ?? undefined, status: company.status ?? undefined, productId: company.productIds?.[0] ?? null, productName: company.productNames?.[0] ?? null } satisfies TemplateRelatedTarget
  }));
  return [...leadOptions, ...companyOptions];
}

function countByCategory(templates: BusinessTemplate[]) {
  return templates.reduce<Record<TemplateCategory, number>>((acc, template) => {
    acc[template.category] = (acc[template.category] ?? 0) + 1;
    return acc;
  }, { email: 0, phone: 0, meeting: 0, proposal: 0, hearing: 0, line_sns: 0, internal: 0, other: 0 });
}

function sortTemplates(left: BusinessTemplate, right: BusinessTemplate, sort: SortKey) {
  if (sort === "updatedAsc") return left.updatedAt.toMillis() - right.updatedAt.toMillis();
  if (sort === "name") return left.title.localeCompare(right.title, "ja");
  if (sort === "favorite") return Number(right.favorite) - Number(left.favorite) || right.usageCount - left.usageCount;
  if (sort === "usage") return right.usageCount - left.usageCount || right.updatedAt.toMillis() - left.updatedAt.toMillis();
  return right.updatedAt.toMillis() - left.updatedAt.toMillis();
}

function formatDate(date: Date) {
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}
