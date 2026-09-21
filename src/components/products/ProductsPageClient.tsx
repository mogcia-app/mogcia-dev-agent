"use client";

import { Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBanner, StatusToast } from "@/components/ui/status";
import { useProducts } from "@/hooks/useProducts";
import { productStatusLabels, productTypeLabels, yen } from "@/lib/product-utils";
import type { Product, ProductStatus, ProductType } from "@/types/product";

type Draft = {
  name: string; tagline: string; summary: string; productType: ProductType; status: ProductStatus;
  industries: string; problems: string; values: string; monthlyFee: string;
};
const statuses: ProductStatus[] = ["active", "draft", "paused", "archived"];
const types: ProductType[] = ["own_product", "operation_service", "web_production", "custom_development", "sales_package", "other"];
const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const blankDraft = (): Draft => ({ name: "", tagline: "", summary: "", productType: "own_product", status: "draft", industries: "", problems: "", values: "", monthlyFee: "" });
const draftFrom = (product: Product): Draft => ({
  name: product.name, tagline: product.tagline, summary: product.summary, productType: product.productType,
  status: product.status, industries: product.target.industries.join("\n"), problems: product.problems.join("\n"),
  values: product.values.join("\n"), monthlyFee: product.pricing.monthlyFee?.toString() ?? ""
});

export function ProductsPageClient() {
  const store = useProducts();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return store.products.filter((product) => (showArchived || product.status !== "archived") && (!needle || `${product.name} ${product.tagline} ${product.summary}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => (a.sortOrder || Number.MAX_SAFE_INTEGER) - (b.sortOrder || Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ja"));
  }, [store.products, query, showArchived]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3000); };
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const closeForm = () => { setCreating(false); setEditingId(null); setDraft(null); };
  const openCreate = () => { setEditingId(null); setDraft(blankDraft()); setCreating(true); };
  const openEdit = (product: Product) => { setCreating(false); setEditingId(product.id); setDraft(draftFrom(product)); };

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
          pricing: { ...product.pricing, monthlyFee: draft.monthlyFee.trim() ? Number(draft.monthlyFee) : null }
        });
        notify("商材を保存しました");
      } else {
        const id = await store.createProduct({ name: draft.name.trim(), displayName: draft.name.trim(), tagline: draft.tagline.trim(), productType: draft.productType, status: draft.status, categoryNames: [] });
        await store.updateProduct(id, "basic", {
          summary: draft.summary.trim(), target: { industries: lines(draft.industries) } as Product["target"],
          problems: lines(draft.problems), values: lines(draft.values),
          pricing: { displayType: "estimate", monthlyFee: draft.monthlyFee.trim() ? Number(draft.monthlyFee) : null } as Product["pricing"]
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
      {store.loading ? <p className="py-10 text-center text-sm text-[#8A8186]">読み込み中...</p> : filtered.length ? <div className="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((product) => <article className="flex min-h-48 flex-col rounded-lg border border-[#E5E7EB] p-4" key={product.id}>
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><ProductIcon product={product} /><div className="min-w-0"><h2 className="truncate font-semibold text-[#25242A]">{product.name}</h2>{product.tagline ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#6B7280]">{product.tagline}</p> : null}</div></div><span className="shrink-0 rounded-full bg-[#FFF0F3] px-2.5 py-1 text-xs font-medium text-[#C94F6A]">{productStatusLabels[product.status]}</span></div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6B7280]"><span className="rounded-md bg-[#F9FAFB] px-2 py-1">{productTypeLabels[product.productType]}</span><span className="rounded-md bg-[#F9FAFB] px-2 py-1">{product.pricing.monthlyFee != null ? `月額 ${yen(product.pricing.monthlyFee)}` : "料金未設定"}</span></div>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-[#5F585C]">{product.summary || "概要はまだ登録されていません"}</p>
        {store.canEdit ? <div className="mt-3 flex justify-end gap-2 border-t border-[#F0E7E9] pt-3"><button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E5E7EB] px-3 text-xs text-[#4B5563]" onClick={() => openEdit(product)} type="button"><Pencil className="h-3.5 w-3.5" />編集</button>{store.isAdmin ? <button aria-label={`${product.name}を削除`} className="grid h-8 w-8 place-items-center rounded-md border border-[#E5E7EB] text-[#C94F6A]" disabled={busy} onClick={() => void remove(product)} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}</div> : null}
      </article>)}</div> : <div className="grid min-h-52 place-items-center text-center"><div><p className="text-sm font-medium text-[#374151]">該当する商材はありません</p>{store.canEdit && !query ? <button className="mt-3 text-sm font-medium text-[#EC6F8B]" onClick={openCreate} type="button">最初の商材を追加</button> : null}</div></div>}
    </section>
    {(creating || editingId) && draft ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }} role="presentation"><div aria-labelledby="product-form-title" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" role="dialog"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold" id="product-form-title">{editingId ? "商材を編集" : "商材を追加"}</h2><button aria-label="閉じる" onClick={closeForm} type="button"><X className="h-5 w-5" /></button></div><div className="mt-4"><ProductForm draft={draft} change={change} /></div><div className="mt-5 flex justify-end gap-2"><button className="h-9 rounded-lg border border-[#E9E1E4] px-4 text-sm" onClick={closeForm} type="button">キャンセル</button><button className="h-9 rounded-lg bg-[#EC6F8B] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !draft.name.trim()} onClick={() => void save()} type="button">{busy ? "保存中..." : "保存"}</button></div></div></div> : null}
  </div>;
}

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
    <label className="block text-sm font-medium text-[#4B4549]">月額料金<input className="mt-2 w-full rounded-lg border border-[#E9E1E4] bg-white px-3 py-2.5 text-sm" min="0" onChange={(event) => change("monthlyFee", event.target.value)} placeholder="未設定なら空欄" type="number" value={draft.monthlyFee} /></label>
  </div>;
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const style = "mt-2 w-full rounded-lg border border-[#E9E1E4] bg-white px-3 py-2.5 text-sm text-[#25242A] outline-none focus:border-[#EC6F8B]";
  return <label className="block text-sm font-medium text-[#4B4549]">{label}{multiline ? <textarea className={`${style} min-h-24 resize-y`} onChange={(event) => onChange(event.target.value)} placeholder="1行に1つずつ" value={value} /> : <input className={style} onChange={(event) => onChange(event.target.value)} value={value} />}</label>;
}
