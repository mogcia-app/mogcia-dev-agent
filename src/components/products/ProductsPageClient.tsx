"use client";

import { ArrowLeft, CircleDollarSign, ExternalLink, FileText, Package, Pencil, Plus, Search, Target, Trash2, X } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import Image from "next/image";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBanner, StatusToast } from "@/components/ui/status";
import { useProducts } from "@/hooks/useProducts";
import { productStatusLabels, productTypeLabels, yen } from "@/lib/product-utils";
import { addResourceFile } from "@/lib/products";
import type { Product, ProductResource, ProductStatus, ProductType } from "@/types/product";

type Draft = {
  name: string; tagline: string; summary: string; productType: ProductType; status: ProductStatus;
  industries: string; problems: string; values: string; initialFee: string; plans: DraftPlan[]; resources: DraftResource[];
};
type DraftPlan = { id: string; name: string; description: string; monthlyFee: string; isActive: boolean };
type DraftResource = { id: string; title: string; type: ProductResource["type"]; url: string };
const statuses: ProductStatus[] = ["active", "draft", "paused", "archived"];
const types: ProductType[] = ["own_product", "operation_service", "web_production", "custom_development", "sales_package", "other"];
const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const blankDraft = (): Draft => ({ name: "", tagline: "", summary: "", productType: "own_product", status: "draft", industries: "", problems: "", values: "", initialFee: "", plans: [], resources: [newDraftResource("website")] });
const draftFrom = (product: Product): Draft => ({
  name: product.name, tagline: product.tagline, summary: product.summary, productType: product.productType,
  status: product.status, industries: product.target.industries.join("\n"), problems: product.problems.join("\n"),
  values: product.values.join("\n"), initialFee: product.pricing.initialFee?.toString() ?? "",
  plans: product.pricing.plans.map((plan) => ({ id: plan.id, name: plan.name, description: plan.description ?? "", monthlyFee: plan.monthlyFee?.toString() ?? "", isActive: plan.isActive })),
  resources: product.resources.filter((resource) => !resource.storagePath).map((resource) => ({ id: resource.id, title: resource.title, type: resource.type, url: resource.url ?? "" }))
});

export function ProductsPageClient() {
  const store = useProducts();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return store.products.filter((product) => (showArchived || product.status !== "archived") && (!needle || `${product.name} ${product.tagline} ${product.summary} ${product.resources.map((resource) => `${resource.title} ${resource.url ?? ""}`).join(" ")}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => (a.sortOrder || Number.MAX_SAFE_INTEGER) - (b.sortOrder || Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ja"));
  }, [store.products, query, showArchived]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3000); };
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const closeForm = () => { setCreating(false); setEditingId(null); setDraft(null); };
  const openCreate = () => { setEditingId(null); setDraft(blankDraft()); setCreating(true); };
  const openEdit = (product: Product) => { setCreating(false); setEditingId(product.id); setDraft(draftFrom(product)); };
  const selectedProduct = selectedId ? store.products.find((product) => product.id === selectedId) ?? null : null;

  const save = async () => {
    if (!draft?.name.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        const product = store.products.find((item) => item.id === editingId);
        if (!product) throw new Error("商材が見つかりませんでした");
        await store.updateProduct(product.id, "basic", {
          name: draft.name.trim(), displayName: draft.name.trim(), tagline: draft.tagline.trim(), summary: draft.summary.trim(),
          productType: draft.productType, status: draft.status, target: { ...product.target, industries: lines(draft.industries) },
          problems: lines(draft.problems), values: lines(draft.values),
          pricing: { ...product.pricing, initialFee: numberOrNull(draft.initialFee), monthlyFee: null, plans: plansFromDraft(draft.plans) },
          resources: [...product.resources.filter((resource) => Boolean(resource.storagePath)), ...resourcesFromDraft(draft.resources, store.currentUser.id)]
        });
        notify("商材を保存しました");
      } else {
        const id = await store.createProduct({ name: draft.name.trim(), displayName: draft.name.trim(), tagline: draft.tagline.trim(), productType: draft.productType, status: draft.status, categoryNames: [] });
        await store.updateProduct(id, "basic", {
          summary: draft.summary.trim(), target: { industries: lines(draft.industries) } as Product["target"],
          problems: lines(draft.problems), values: lines(draft.values),
          pricing: { displayType: "estimate", initialFee: numberOrNull(draft.initialFee), monthlyFee: null, plans: plansFromDraft(draft.plans) } as Product["pricing"],
          resources: resourcesFromDraft(draft.resources, store.currentUser.id)
        });
        notify("商材を追加しました");
      }
      closeForm();
    } catch (error) { notify(error instanceof Error ? error.message : "保存できませんでした"); }
    finally { setBusy(false); }
  };
  const remove = async (product: Product) => {
    if (!window.confirm(`「${product.name}」を削除しますか？`)) return;
    setBusy(true);
    try { await store.deleteProduct(product.id); notify("商材を削除しました"); }
    catch (error) { notify(error instanceof Error ? error.message : "削除できませんでした"); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <StatusToast message={toast} onClose={() => setToast(null)} />
    <PageHeader title="商材管理" description="取り扱っている商材を一覧で管理します" actions={store.canEdit ? <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={openCreate} type="button"><Plus className="h-4 w-4" />商材を追加</button> : null} />
    <StatusBanner message={store.error} type="error" />
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 text-[#8A8186]"><Search className="h-4 w-4" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="商材名・概要で検索" value={query} /></label>
        <label className="flex shrink-0 items-center gap-2 text-sm text-[#6B7280]"><input checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} type="checkbox" />アーカイブも表示</label>
      </div>
      <div className="mt-4 flex items-center justify-between border-b border-[#E5E7EB] pb-3"><p className="text-sm font-medium text-[#374151]">{filtered.length}件の商材</p></div>
      {store.loading ? <p className="py-10 text-center text-sm text-[#8A8186]">読み込み中...</p> : filtered.length ? <div className="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((product) => <article className="flex min-h-48 cursor-pointer flex-col rounded-lg border border-[#E5E7EB] p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFFBFC]" key={product.id} onClick={() => setSelectedId(product.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(product.id); } }} role="button" tabIndex={0}>
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><ProductIcon product={product} /><div className="min-w-0"><h2 className="truncate font-semibold text-[#25242A]">{product.name}</h2>{product.tagline ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#6B7280]">{product.tagline}</p> : null}</div></div><span className="shrink-0 rounded-full bg-[#FFF0F3] px-2.5 py-1 text-xs font-medium text-[#C94F6A]">{productStatusLabels[product.status]}</span></div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6B7280]"><span className="rounded-md bg-[#F9FAFB] px-2 py-1">{pricingSummary(product)}</span>{product.pricing.plans.length ? <span className="rounded-md bg-[#FFF0F3] px-2 py-1 text-[#C94F6A]">{product.pricing.plans.length}プラン</span> : null}</div>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-[#5F585C]">{product.summary || "概要はまだ登録されていません"}</p>
        {store.canEdit ? <div className="mt-3 flex justify-end gap-2 border-t border-[#F0E7E9] pt-3"><button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] px-3 text-xs text-[#4B5563]" onClick={(event) => { event.stopPropagation(); openEdit(product); }} type="button"><Pencil className="h-3.5 w-3.5" />編集</button>{store.isAdmin ? <button aria-label={`${product.name}を削除`} className="grid h-8 w-8 place-items-center rounded-md border border-[#E5E7EB] text-[#C94F6A]" disabled={busy} onClick={(event) => { event.stopPropagation(); void remove(product); }} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}</div> : null}
      </article>)}</div> : <div className="grid min-h-52 place-items-center text-center"><div><p className="text-sm font-medium text-[#374151]">該当する商材はありません</p>{store.canEdit && !query ? <button className="mt-3 text-sm font-medium text-[#EC6F8B]" onClick={openCreate} type="button">最初の商材を追加</button> : null}</div></div>}
    </section>
    {selectedProduct ? <ProductDetailDrawer canEdit={store.canEdit} onClose={() => setSelectedId(null)} onEdit={() => { setSelectedId(null); openEdit(selectedProduct); }} onUpload={async (file, onProgress) => { const resource = await addResourceFile(selectedProduct, file, store.currentUser, onProgress); await store.updateProduct(selectedProduct.id, "resources", { resources: [...selectedProduct.resources, resource] }); notify("資料を追加しました"); }} product={selectedProduct} /> : null}
    {(creating || editingId) && draft ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }} role="presentation"><div aria-labelledby="product-form-title" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" role="dialog"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold" id="product-form-title">{editingId ? "商材を編集" : "商材を追加"}</h2><button aria-label="閉じる" onClick={closeForm} type="button"><X className="h-5 w-5" /></button></div><div className="mt-4"><ProductForm draft={draft} change={change} /></div><div className="mt-5 flex justify-end gap-2"><button className="h-9 rounded-lg border border-[#E9E1E4] px-4 text-sm" onClick={closeForm} type="button">キャンセル</button><button className="h-9 rounded-lg bg-[#EC6F8B] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !draft.name.trim()} onClick={() => void save()} type="button">{busy ? "保存中..." : "保存"}</button></div></div></div> : null}
  </div>;
}

function ProductDetailDrawer({ product, canEdit, onClose, onEdit, onUpload }: { product: Product; canEdit: boolean; onClose: () => void; onEdit: () => void; onUpload: (file: File, onProgress: (progress: number) => void) => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const upload = async (file?: File) => { if (!file || uploading) return; setUploading(true); setUploadProgress(0); try { await onUpload(file, setUploadProgress); } finally { setUploading(false); } };
  return <div className="fixed inset-0 z-50 bg-[#1F1F22]/20 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
    <aside aria-label={`${product.name}の詳細`} className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[#F0DEE2] bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><button className="inline-flex h-9 items-center gap-2 text-sm text-[#6B7280] hover:text-[#EC6F8B]" onClick={onClose} type="button"><ArrowLeft className="h-4 w-4" />一覧へ戻る</button><button aria-label="閉じる" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#FFF0F3]" onClick={onClose} type="button"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 flex items-start gap-4"><ProductIcon product={product} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold text-[#25242A]">{product.name}</h2><span className="rounded-full bg-[#FFF0F3] px-2.5 py-1 text-xs font-medium text-[#C94F6A]">{productStatusLabels[product.status]}</span></div>{product.tagline ? <p className="mt-2 text-sm leading-6 text-[#6B7280]">{product.tagline}</p> : null}</div>{canEdit ? <button className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 text-sm text-[#4B5563]" onClick={onEdit} type="button"><Pencil className="h-4 w-4" />編集</button> : null}</div>
      <section className="mt-6 rounded-xl border border-[#E5E7EB] p-5"><h3 className="font-semibold text-[#25242A]">概要</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#5F585C]">{product.summary || "概要はまだ登録されていません"}</p></section>
      <section className="mt-4 rounded-xl border border-[#E5E7EB] p-5"><h3 className="flex items-center gap-2 font-semibold text-[#25242A]"><CircleDollarSign className="h-4 w-4 text-[#EC6F8B]" />基本料金</h3><p className="mt-3 text-sm text-[#374151]">{product.pricing.initialFee != null ? `初期費用 ${yen(product.pricing.initialFee)}` : "初期費用は未設定"}</p>{product.pricing.plans.length ? <div className="mt-4 grid gap-3">{product.pricing.plans.map((plan) => <article className="rounded-lg bg-[#FCFAFB] p-4" key={plan.id}><h4 className="font-semibold text-[#25242A]">{plan.name}</h4>{plan.description ? <p className="mt-1 text-sm text-[#6B7280]">{plan.description}</p> : null}<p className="mt-3 text-sm text-[#374151]">{plan.monthlyFee != null ? `月額 ${yen(plan.monthlyFee)}` : "月額は要見積もり"}</p></article>)}</div> : <p className="mt-3 text-sm text-[#8A8186]">月額プランは未登録です。</p>}</section>
      <div className="mt-4"><DetailCard icon={Target} label="対象業種" value={product.target.industries.length ? product.target.industries.join("、") : "未設定"} /></div>
      <section className="mt-4 rounded-xl border border-[#E5E7EB] p-5"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold text-[#25242A]"><FileText className="h-4 w-4 text-[#EC6F8B]" />HP・資料</h3>{canEdit ? <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-[#F7CAD2] px-3 text-sm text-[#C94F6A]">{uploading ? `${uploadProgress}%` : "資料をアップロード"}<input className="hidden" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} type="file" /></label> : null}</div>{product.resources.length ? <div className="mt-3 grid gap-2">{product.resources.map((resource) => resource.url ? <a className="flex items-center justify-between gap-3 rounded-lg border border-[#F0E7E9] px-3 py-2.5 text-sm text-[#374151] hover:border-[#F7CAD2] hover:text-[#C94F6A]" href={resource.url} key={resource.id} rel="noreferrer" target="_blank"><span className="min-w-0"><span className="block truncate font-medium">{resource.title}</span><span className="mt-0.5 block text-xs text-[#8A8186]">{resource.storagePath ? "アップロード資料" : resourceTypeLabels[resource.type]}</span></span><ExternalLink className="h-4 w-4 shrink-0" /></a> : null)}</div> : <p className="mt-3 text-sm text-[#8A8186]">HPや資料はまだ登録されていません。</p>}</section>
      <DetailList title="解決する課題" values={product.problems} /><DetailList title="提供する価値" values={product.values} />
    </aside>
  </div>;
}

function DetailCard({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) { return <section className="rounded-xl border border-[#E5E7EB] p-4"><span className="inline-flex items-center gap-2 text-xs font-medium text-[#8A8186]"><Icon className="h-4 w-4 text-[#EC6F8B]" />{label}</span><p className="mt-2 text-sm leading-6 text-[#374151]">{value}</p></section>; }
function DetailList({ title, values }: { title: string; values: string[] }) { return <section className="mt-4 rounded-xl border border-[#E5E7EB] p-5"><h3 className="font-semibold text-[#25242A]">{title}</h3>{values.length ? <ul className="mt-3 space-y-2">{values.map((value, index) => <li className="flex gap-2 text-sm leading-6 text-[#5F585C]" key={`${value}-${index}`}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#EC6F8B]" />{value}</li>)}</ul> : <p className="mt-3 text-sm text-[#8A8186]">未設定</p>}</section>; }

function ProductIcon({ product }: { product: Product }) {
  return product.iconUrl ? <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#FFF0F3]"><Image alt={`${product.name}のアイコン`} className="object-cover" fill sizes="40px" src={product.iconUrl} /></span> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#FFF0F3] text-[#EC6F8B]"><Package className="h-5 w-5" /></span>;
}

function ProductForm({ draft, change }: { draft: Draft; change: <K extends keyof Draft>(key: K, value: Draft[K]) => void }) {
  return <div className="grid gap-5 sm:grid-cols-2">
    <Field label="商材名" onChange={(value) => change("name", value)} value={draft.name} />
    <Field label="一言説明" onChange={(value) => change("tagline", value)} value={draft.tagline} />
    <label className="text-sm font-medium text-[#4B4549]">種類<select className="mt-2 w-full rounded-lg border border-[#E9E1E4] bg-white px-3 py-2.5" onChange={(event) => change("productType", event.target.value as ProductType)} value={draft.productType}>{types.map((type) => <option key={type} value={type}>{productTypeLabels[type]}</option>)}</select></label>
    <label className="text-sm font-medium text-[#4B4549]">状態<select className="mt-2 w-full rounded-lg border border-[#E9E1E4] bg-white px-3 py-2.5" onChange={(event) => change("status", event.target.value as ProductStatus)} value={draft.status}>{statuses.map((status) => <option key={status} value={status}>{productStatusLabels[status]}</option>)}</select></label>
    <div className="sm:col-span-2"><Field label="概要" multiline onChange={(value) => change("summary", value)} value={draft.summary} /></div>
    <Field label="対象業種" multiline onChange={(value) => change("industries", value)} value={draft.industries} />
    <Field label="解決する課題" multiline onChange={(value) => change("problems", value)} value={draft.problems} />
    <Field label="提供する価値" multiline onChange={(value) => change("values", value)} value={draft.values} />
    <section className="rounded-xl border border-[#E9E1E4] p-4 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-[#4B4549]">公式HP・資料リンク</h3><p className="mt-1 text-xs leading-5 text-[#8A8186]">商材サイト、提案資料、料金表、サービス資料、事例などをまとめます。</p></div><button className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#F7CAD2] px-3 text-sm text-[#C94F6A]" onClick={() => change("resources", [...draft.resources, newDraftResource("service_document")])} type="button"><Plus className="h-4 w-4" />リンク追加</button></div><div className="mt-4 grid gap-3">{draft.resources.map((resource, index) => <ResourceEditor index={index} key={resource.id} resource={resource} onChange={(next) => change("resources", draft.resources.map((entry) => entry.id === resource.id ? next : entry))} onRemove={() => change("resources", draft.resources.filter((entry) => entry.id !== resource.id))} />)}</div></section>
    <section className="rounded-xl border border-[#E9E1E4] p-4 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-[#4B4549]">基本料金</h3><p className="mt-1 text-xs text-[#8A8186]">初期費用と月額プランをまとめて登録します。</p></div><button className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#F7CAD2] px-3 text-sm text-[#C94F6A]" onClick={() => change("plans", [...draft.plans, newDraftPlan()])} type="button"><Plus className="h-4 w-4" />プラン追加</button></div><div className="mt-4"><PriceInput label="初期費用" value={draft.initialFee} onChange={(value) => change("initialFee", value)} /></div><div className="mt-4 grid gap-3">{draft.plans.map((plan, index) => <PlanEditor key={plan.id} index={index} plan={plan} onChange={(next) => change("plans", draft.plans.map((entry) => entry.id === plan.id ? next : entry))} onRemove={() => change("plans", draft.plans.filter((entry) => entry.id !== plan.id))} />)}</div></section>
  </div>;
}

function PlanEditor({ plan, index, onChange, onRemove }: { plan: DraftPlan; index: number; onChange: (plan: DraftPlan) => void; onRemove: () => void }) {
  return <article className="rounded-xl border border-[#E9E1E4] bg-[#FFFBFC] p-4"><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-[#4B4549]">プラン {index + 1}</h4><button aria-label="プランを削除" className="grid h-8 w-8 place-items-center rounded-md text-[#C94F6A] hover:bg-white" onClick={onRemove} type="button"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="プラン名" value={plan.name} onChange={(name) => onChange({ ...plan, name })} /><Field label="プランの説明" value={plan.description} onChange={(description) => onChange({ ...plan, description })} /><div className="sm:col-span-2"><PriceInput label="月額料金" value={plan.monthlyFee} onChange={(monthlyFee) => onChange({ ...plan, monthlyFee })} /></div></div></article>;
}

function ResourceEditor({ resource, index, onChange, onRemove }: { resource: DraftResource; index: number; onChange: (resource: DraftResource) => void; onRemove: () => void }) {
  return <article className="rounded-xl border border-[#E9E1E4] bg-[#FFFBFC] p-4"><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-[#4B4549]">リンク {index + 1}</h4><button aria-label="リンクを削除" className="grid h-8 w-8 place-items-center rounded-md text-[#C94F6A] hover:bg-white" onClick={onRemove} type="button"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]"><label className="text-sm font-medium text-[#4B4549]">種類<select className="mt-2 w-full rounded-lg border border-[#E9E1E4] bg-white px-3 py-2.5" onChange={(event) => onChange({ ...resource, type: event.target.value as ProductResource["type"] })} value={resource.type}>{Object.entries(resourceTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label><Field label="表示名" onChange={(title) => onChange({ ...resource, title })} value={resource.title} /><div className="sm:col-span-2"><Field label="URL" onChange={(url) => onChange({ ...resource, url })} value={resource.url} /></div></div></article>;
}

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-sm font-medium text-[#4B4549]">{label}<div className="mt-2 flex overflow-hidden rounded-lg border border-[#E9E1E4] bg-white"><span className="grid place-items-center border-r border-[#E9E1E4] px-3 text-sm text-[#8A8186]">¥</span><input className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none" min="0" onChange={(event) => onChange(event.target.value)} placeholder="未設定" type="number" value={value} /></div></label>; }

function newDraftPlan(): DraftPlan { return { id: crypto.randomUUID(), name: "", description: "", monthlyFee: "", isActive: true }; }
function newDraftResource(type: ProductResource["type"]): DraftResource { return { id: crypto.randomUUID(), title: type === "website" ? "公式HP" : "", type, url: "" }; }
const resourceTypeLabels: Record<ProductResource["type"], string> = { website: "公式HP", proposal: "提案資料", pricing: "料金表", service_document: "サービス資料", case_document: "事例資料", demo: "デモ", simulation: "シミュレーション", contract_template: "契約書ひな形", other: "その他" };
function resourcesFromDraft(resources: DraftResource[], userId: string): ProductResource[] { const now = Timestamp.now(); return resources.filter((resource) => resource.url.trim()).map((resource) => ({ id: resource.id, title: resource.title.trim() || resourceTypeLabels[resource.type], type: resource.type, url: normalizeResourceUrl(resource.url), storagePath: null, fileName: null, description: "", visibility: resource.type === "website" ? "public" : "sales", createdBy: userId, createdAt: now, updatedAt: now })); }
function normalizeResourceUrl(value: string): string { const url = value.trim(); return /^https?:\/\//i.test(url) ? url : `https://${url}`; }
function numberOrNull(value: string): number | null { const normalized = value.trim(); if (!normalized) return null; const number = Number(normalized); return Number.isFinite(number) && number >= 0 ? number : null; }
function plansFromDraft(plans: DraftPlan[]): Product["pricing"]["plans"] { return plans.filter((plan) => plan.name.trim()).map((plan, index) => ({ id: plan.id, name: plan.name.trim(), description: plan.description.trim(), initialFee: null, monthlyFee: numberOrNull(plan.monthlyFee), oneTimeFee: null, features: [], recommended: false, isActive: plan.isActive, sortOrder: index + 1 })); }
function pricingSummary(product: Product): string { if (product.pricing.initialFee != null) return `初期費用 ${yen(product.pricing.initialFee)}`; return product.pricing.plans.length ? `${product.pricing.plans.length}つの料金プラン` : "料金未設定"; }

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const style = "mt-2 w-full rounded-lg border border-[#E9E1E4] bg-white px-3 py-2.5 text-sm text-[#25242A] outline-none focus:border-[#EC6F8B]";
  return <label className="block text-sm font-medium text-[#4B4549]">{label}{multiline ? <textarea className={`${style} min-h-24 resize-y`} onChange={(event) => onChange(event.target.value)} placeholder="1行に1つずつ" value={value} /> : <input className={style} onChange={(event) => onChange(event.target.value)} value={value} />}</label>;
}
