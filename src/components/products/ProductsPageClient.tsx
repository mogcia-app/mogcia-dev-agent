"use client";

import { Archive, Copy, Download, ExternalLink, FileUp, Plus, Save, Search, Star } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { EmptyState, StatusBanner } from "@/components/ui/status";
import { exportProductsCsv } from "@/lib/product-export";
import { productStatusLabels, productTabs, productTypeLabels, toLines, fromLines, yen } from "@/lib/product-utils";
import { addResourceFile } from "@/lib/products";
import { useProducts } from "@/hooks/useProducts";
import type { Product, ProductFeature, ProductFlowStep, ProductHearingItem, ProductPlan, ProductResource, ProductStatus, ProductTab, ProductType } from "@/types/product";

const statusFilters: Array<ProductStatus | "all"> = ["all", "active", "draft", "paused", "archived"];

export function ProductsPageClient() {
  const store = useProducts();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const selectedTab = (params.get("tab") as ProductTab | null) ?? "basic";
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [isCreateOpen, setCreateOpen] = useState(false);

  const setProductRoute = useCallback((id: string, tab: ProductTab) => {
    router.replace(`${pathname}?id=${id}&tab=${tab}` as Route, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    return store.products.filter((product) => {
      if (status !== "all" && product.status !== status) return false;
      if (favoriteOnly && !product.favoriteUserIds.includes(store.user?.uid ?? "")) return false;
      if (!needle) return true;
      return [product.name, product.displayName, product.tagline, product.categoryNames.join(" "), product.target.industries.join(" ")].join(" ").toLowerCase().includes(needle);
    });
  }, [debouncedQuery, favoriteOnly, status, store.products, store.user?.uid]);

  const selectedProduct = filtered.find((product) => product.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selectedId && selectedProduct) setProductRoute(selectedProduct.id, selectedTab);
  }, [selectedId, selectedProduct, selectedTab, setProductRoute]);

  return (
    <div className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader
        title="商材管理"
        description="自社の提供商材を管理できます"
        actions={
          <>
            <button className="inline-flex h-11 items-center gap-2 rounded-full bg-[#EC6F8B] px-5 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しい商材を追加</button>
            <button className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#6F676B] shadow-sm ring-1 ring-[#F0E7E9]" onClick={() => exportProductsCsv(filtered)} type="button"><Download className="h-4 w-4" />エクスポート</button>
          </>
        }
      />
      <div className="mt-4"><StatusBanner message={store.error} type="error" /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="rounded-lg border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-md border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#777]">
              <Search className="h-4 w-4" />
              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="商材名・カテゴリで検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button className={`grid h-11 w-11 place-items-center rounded-md border border-[#F0E7E9] ${favoriteOnly ? "bg-[#FFF0F3] text-[#EC6F8B]" : "bg-white text-[#777]"}`} onClick={() => setFavoriteOnly((current) => !current)} type="button" aria-label="お気に入りのみ"><Star className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statusFilters.map((item) => (
              <button className={`h-9 rounded-full border px-3 text-xs font-bold ${status === item ? "border-[#EC6F8B] bg-[#EC6F8B] text-white" : "border-[#F0E7E9] bg-white text-[#6F676B]"}`} key={item} onClick={() => setStatus(item)} type="button">
                {item === "all" ? "すべて" : productStatusLabels[item]}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {store.loading ? <ProductSkeleton /> : null}
            {!store.loading && filtered.length === 0 ? <EmptyProducts onCreate={() => setCreateOpen(true)} /> : null}
            {filtered.map((product) => (
              <ProductListItem key={product.id} product={product} active={selectedProduct?.id === product.id} favorite={product.favoriteUserIds.includes(store.user?.uid ?? "")} onSelect={() => setProductRoute(product.id, selectedTab)} onFavorite={() => void store.toggleFavorite(product)} />
            ))}
          </div>
        </section>
        <section className="min-w-0">
          {selectedProduct ? (
            <ProductDetail
              canEdit={store.canEdit}
              isAdmin={store.isAdmin}
              key={selectedProduct.id}
              onArchive={() => void store.archiveProduct(selectedProduct.id)}
              onDuplicate={async () => {
                const id = await store.duplicateProduct(selectedProduct);
                setProductRoute(id, "basic");
              }}
              onSave={(tab, patch) => store.updateProduct(selectedProduct.id, tab, patch)}
              onTabChange={(tab) => setProductRoute(selectedProduct.id, tab)}
              product={selectedProduct}
              tab={productTabs.some((entry) => entry.value === selectedTab) ? selectedTab : "basic"}
              user={store.currentUser}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[#F0E7E9] bg-white p-12 text-center text-sm font-bold text-[#8A8A8A]">左の一覧から商材を選択してください</div>
          )}
        </section>
      </div>
      {isCreateOpen ? <CreateProductModal onClose={() => setCreateOpen(false)} onCreate={async (input) => { const id = await store.createProduct(input); setCreateOpen(false); setProductRoute(id, "basic"); }} /> : null}
    </div>
  );
}

function ProductListItem({ product, active, favorite, onSelect, onFavorite }: { product: Product; active: boolean; favorite: boolean; onSelect: () => void; onFavorite: () => void }) {
  return (
    <button className={`grid w-full grid-cols-[56px_1fr_32px] items-center gap-3 rounded-lg border p-3 text-left ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} onClick={onSelect} type="button">
      <span className="grid h-14 w-14 place-items-center rounded-md bg-[#EC6F8B] text-sm font-bold text-white">{product.name.slice(0, 2)}</span>
      <span className="min-w-0">
        <span className="block truncate text-base font-bold text-[#2B2B2B]">{product.name}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-[#777]">{product.tagline || product.displayName}</span>
        <span className="mt-2 inline-flex rounded-full bg-[#F3FAF0] px-2 py-1 text-xs font-bold text-[#5E9B61]">{productStatusLabels[product.status]}</span>
        <span className="ml-2 text-xs font-semibold text-[#999]">更新日: {product.updatedAt.toDate().toLocaleDateString("ja-JP")}</span>
      </span>
      <span role="button" tabIndex={0} className="grid h-8 w-8 place-items-center text-[#EC6F8B]" onClick={(event) => { event.stopPropagation(); onFavorite(); }} onKeyDown={(event) => { if (event.key === "Enter") onFavorite(); }}><Star className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></span>
    </button>
  );
}

function ProductDetail({ product, tab, canEdit, isAdmin, user, onTabChange, onSave, onDuplicate, onArchive }: { product: Product; tab: ProductTab; canEdit: boolean; isAdmin: boolean; user: { id: string; name: string }; onTabChange: (tab: ProductTab) => void; onSave: (tab: ProductTab, patch: Partial<Product>) => Promise<void>; onDuplicate: () => Promise<void>; onArchive: () => void; }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(tab, draft);
    setSaving(false);
    setEditing(false);
  };

  const archive = () => {
    if (window.confirm("この商材をアーカイブしますか？\n\nアーカイブ後もデータは削除されません。商談や分析データとの紐付けは維持されます。")) onArchive();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#F0E7E9] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-20 w-20 place-items-center rounded-md bg-[#EC6F8B] text-lg font-bold text-white">{product.name.slice(0, 2)}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-[#2B2B2B]">{product.name}</h3>
                <span className="rounded-full bg-[#F3FAF0] px-3 py-1 text-xs font-bold text-[#5E9B61]">{productStatusLabels[product.status]}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[#777]">{product.displayName}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? <button className="h-10 rounded-full border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#EC6F8B]" onClick={() => setEditing(true)} type="button">編集</button> : null}
            {isAdmin ? <button className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#6F676B]" onClick={() => void onDuplicate()} type="button"><Copy className="h-4 w-4" />複製</button> : null}
            {isAdmin ? <button className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#6F676B]" onClick={archive} type="button"><Archive className="h-4 w-4" />アーカイブ</button> : null}
            {product.resources.find((resource) => resource.type === "proposal" && resource.url) ? <a className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#6F676B]" href={product.resources.find((resource) => resource.type === "proposal" && resource.url)?.url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />提案資料を開く</a> : null}
            {product.resources.find((resource) => resource.type === "demo" && resource.url) ? <a className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#6F676B]" href={product.resources.find((resource) => resource.type === "demo" && resource.url)?.url ?? "#"} target="_blank" rel="noreferrer">デモを見る</a> : null}
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-[#F0E7E9] bg-white shadow-sm">
        <div className="flex overflow-x-auto border-b border-[#F0E7E9]">
          {productTabs.map((item) => <button className={`h-12 shrink-0 px-4 text-sm font-bold ${tab === item.value ? "border-b-2 border-[#EC6F8B] text-[#EC6F8B]" : "text-[#6F676B]"}`} key={item.value} onClick={() => onTabChange(item.value)} type="button">{item.label}</button>)}
        </div>
        <div className="p-5">
          {editing ? <ProductEditForm draft={draft} isAdmin={isAdmin} tab={tab} user={user} onChange={setDraft} /> : <ProductReadView isAdmin={isAdmin} product={product} tab={tab} />}
          {editing ? (
            <div className="mt-5 flex justify-end gap-3">
              <button className="h-11 rounded-full border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={() => { setDraft(product); setEditing(false); }} type="button">キャンセル</button>
              <button className="inline-flex h-11 items-center gap-2 rounded-full bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()} type="button"><Save className="h-4 w-4" />保存</button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ProductReadView({ product, tab, isAdmin }: { product: Product; tab: ProductTab; isAdmin: boolean }) {
  if (tab === "basic") return <InfoGrid rows={[["商材名", product.name], ["表示名", product.displayName], ["slug", product.slug], ["カテゴリ", product.categoryNames.join(" / ") || "未設定"], ["商材種別", productTypeLabels[product.productType]], ["一言説明", product.tagline || "未設定"], ["概要", product.summary || "未設定"], ["提供価値", product.values.join(" / ") || "未設定"], ["解決する課題", product.problems.join(" / ") || "未設定"], ["商材責任者", product.ownerName || "未設定"], ["ステータス", productStatusLabels[product.status]], ["作成日", product.createdAt.toDate().toLocaleString("ja-JP")], ["最終更新日", product.updatedAt.toDate().toLocaleString("ja-JP")]]} />;
  if (tab === "target") return <InfoGrid rows={[["対象業種", product.target.industries.join(" / ") || "未設定"], ["対象企業規模", product.target.companySizes.join(" / ") || "未設定"], ["想定担当者", product.target.roles.join(" / ") || "未設定"], ["想定決裁者", product.target.decisionMakerRoles.join(" / ") || "未設定"], ["向いている企業", product.target.suitableConditions.join(" / ") || "未設定"], ["向いていない企業", product.target.unsuitableConditions.join(" / ") || "未設定"], ["導入条件", product.target.requiredConditions.join(" / ") || "未設定"], ["対象外条件", product.target.disqualificationConditions.join(" / ") || "未設定"]]} />;
  if (tab === "pricing") return <InfoGrid rows={[["料金表示方法", product.pricing.displayType], ["初期費用", yen(product.pricing.initialFee)], ["月額費用", yen(product.pricing.monthlyFee)], ["最低料金", yen(product.pricing.minimumFee)], ["最高料金", yen(product.pricing.maximumFee)], ["最低契約期間", product.pricing.minimumContractMonths ? `${product.pricing.minimumContractMonths}ヶ月` : "未設定"], ["支払い条件", product.pricing.paymentTerms || "未設定"], ["更新条件", product.pricing.renewalTerms || "未設定"], ["解約条件", product.pricing.cancellationTerms || "未設定"], ...(isAdmin ? [["原価", yen(product.pricing.cost)], ["粗利目安", product.pricing.grossMarginRate ? `${product.pricing.grossMarginRate}%` : "未設定"]] as Array<[string, string]> : []), ["料金プラン", product.pricing.plans.map((plan) => `${plan.name}: 初期 ${yen(plan.initialFee)} / 月額 ${yen(plan.monthlyFee)}`).join(" / ") || "未設定"]]} />;
  if (tab === "features") return <Cards title="機能" items={product.features.map((feature) => `${feature.name} / ${feature.category || "カテゴリ未設定"} / ${feature.type === "standard" ? "標準" : "オプション"}`)} />;
  if (tab === "implementation") return <Cards title="導入・運用" items={[...product.implementation.flowSteps.map((step) => `${step.sortOrder + 1}. ${step.title}`), ...(product.implementation.notes ?? [])]} />;
  if (tab === "sales") return <InfoGrid rows={[["営業目標", product.salesSettings.targetMonthlyDeals ? `${product.salesSettings.targetMonthlyDeals}件/月` : "未設定"], ["想定商談時間", product.salesSettings.expectedMeetingMinutes ? `${product.salesSettings.expectedMeetingMinutes}分` : "未設定"], ["想定受注期間", product.salesSettings.expectedSalesCycleDays ? `${product.salesSettings.expectedSalesCycleDays}日` : "未設定"], ["商談ステージ", product.salesSettings.salesStages.join(" / ") || "未設定"], ["反論カテゴリ", product.salesSettings.objectionCategories.join(" / ") || "未設定"], ["失注理由", product.salesSettings.lossReasonCategories.join(" / ") || "未設定"], ["必須ヒアリング", product.salesSettings.requiredHearingItems.map((item) => item.label).join(" / ") || "未設定"]]} />;
  if (tab === "resources") return <Cards title="資料・デモ" items={product.resources.map((resource) => `${resource.title} / ${resource.type} / ${resource.visibility}`)} />;
  return <ProductHistory productId={product.id} />;
}

function ProductEditForm({ draft, tab, isAdmin, user, onChange }: { draft: Product; tab: ProductTab; isAdmin: boolean; user: { id: string; name: string }; onChange: (product: Product) => void }) {
  const set = (patch: Partial<Product>) => onChange({ ...draft, ...patch });
  if (tab === "basic") return <div className="grid gap-4 sm:grid-cols-2"><Input label="商材名" value={draft.name} onChange={(name) => set({ name })} /><Input label="表示名" value={draft.displayName} onChange={(displayName) => set({ displayName })} /><Input label="カテゴリ" value={draft.categoryNames.join(", ")} onChange={(value) => set({ categoryNames: value.split(",").map((item) => item.trim()).filter(Boolean) })} /><SelectField label="商材種別" value={draft.productType} options={Object.entries(productTypeLabels)} onChange={(value) => set({ productType: value as ProductType })} /><SelectField label="ステータス" value={draft.status} options={Object.entries(productStatusLabels)} onChange={(value) => set({ status: value as ProductStatus })} /><Input label="一言説明" value={draft.tagline} onChange={(tagline) => set({ tagline })} /><Text label="概要" value={draft.summary} onChange={(summary) => set({ summary })} /><Text label="提供価値" value={toLines(draft.values)} onChange={(value) => set({ values: fromLines(value) })} /><Text label="解決する課題" value={toLines(draft.problems)} onChange={(value) => set({ problems: fromLines(value) })} /></div>;
  if (tab === "target") return <div className="grid gap-4 sm:grid-cols-2"><Text label="対象業種" value={toLines(draft.target.industries)} onChange={(value) => set({ target: { ...draft.target, industries: fromLines(value) } })} /><Text label="対象企業規模" value={toLines(draft.target.companySizes)} onChange={(value) => set({ target: { ...draft.target, companySizes: fromLines(value) } })} /><Text label="想定担当者" value={toLines(draft.target.roles)} onChange={(value) => set({ target: { ...draft.target, roles: fromLines(value) } })} /><Text label="想定決裁者" value={toLines(draft.target.decisionMakerRoles)} onChange={(value) => set({ target: { ...draft.target, decisionMakerRoles: fromLines(value) } })} /><Text label="向いている企業" value={toLines(draft.target.suitableConditions)} onChange={(value) => set({ target: { ...draft.target, suitableConditions: fromLines(value) } })} /><Text label="向いていない企業" value={toLines(draft.target.unsuitableConditions)} onChange={(value) => set({ target: { ...draft.target, unsuitableConditions: fromLines(value) } })} /></div>;
  if (tab === "pricing") return <PricingEditor draft={draft} isAdmin={isAdmin} onChange={onChange} />;
  if (tab === "features") return <FeatureEditor draft={draft} onChange={onChange} />;
  if (tab === "implementation") return <ImplementationEditor draft={draft} onChange={onChange} />;
  if (tab === "sales") return <SalesEditor draft={draft} onChange={onChange} />;
  if (tab === "resources") return <ResourceEditor draft={draft} user={user} onChange={onChange} />;
  return <p className="text-sm font-bold text-[#8A8A8A]">変更履歴は編集できません。</p>;
}

function PricingEditor({ draft, isAdmin, onChange }: { draft: Product; isAdmin: boolean; onChange: (product: Product) => void }) {
  const setPricing = (pricing: Product["pricing"]) => onChange({ ...draft, pricing });
  const addPlan = () => setPricing({ ...draft.pricing, plans: [...draft.pricing.plans, { id: crypto.randomUUID(), name: "新しいプラン", features: [], recommended: false, isActive: true, sortOrder: draft.pricing.plans.length }] });
  return <div className="grid gap-4 sm:grid-cols-2"><Input label="初期費用" value={String(draft.pricing.initialFee ?? "")} onChange={(value) => setPricing({ ...draft.pricing, initialFee: numberOrNull(value) })} /><Input label="月額費用" value={String(draft.pricing.monthlyFee ?? "")} onChange={(value) => setPricing({ ...draft.pricing, monthlyFee: numberOrNull(value) })} /><Input label="最低契約期間（月）" value={String(draft.pricing.minimumContractMonths ?? "")} onChange={(value) => setPricing({ ...draft.pricing, minimumContractMonths: numberOrNull(value) })} /><Input label="支払い条件" value={draft.pricing.paymentTerms ?? ""} onChange={(value) => setPricing({ ...draft.pricing, paymentTerms: value })} />{isAdmin ? <><Input label="原価" value={String(draft.pricing.cost ?? "")} onChange={(value) => setPricing({ ...draft.pricing, cost: numberOrNull(value) })} /><Input label="粗利目安（%）" value={String(draft.pricing.grossMarginRate ?? "")} onChange={(value) => setPricing({ ...draft.pricing, grossMarginRate: numberOrNull(value) })} /></> : null}<div className="sm:col-span-2"><button className="h-10 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={addPlan} type="button">料金プランを追加</button><div className="mt-3 grid gap-3">{draft.pricing.plans.map((plan) => <PlanRow key={plan.id} plan={plan} onChange={(next) => setPricing({ ...draft.pricing, plans: draft.pricing.plans.map((item) => item.id === plan.id ? next : item) })} />)}</div></div></div>;
}

function PlanRow({ plan, onChange }: { plan: ProductPlan; onChange: (plan: ProductPlan) => void }) {
  return <div className="grid gap-2 rounded-md border border-[#F0E7E9] p-3 sm:grid-cols-3"><input className="task-input" value={plan.name} onChange={(event) => onChange({ ...plan, name: event.target.value })} /><input className="task-input" placeholder="初期費用" value={plan.initialFee ?? ""} onChange={(event) => onChange({ ...plan, initialFee: numberOrNull(event.target.value) })} /><input className="task-input" placeholder="月額" value={plan.monthlyFee ?? ""} onChange={(event) => onChange({ ...plan, monthlyFee: numberOrNull(event.target.value) })} /></div>;
}

function FeatureEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const add = () => onChange({ ...draft, features: [...draft.features, { id: crypto.randomUUID(), name: "新しい機能", description: "", category: "", planIds: [], type: "standard", isPublic: true, sortOrder: draft.features.length }] });
  return <EditorList onAdd={add}>{draft.features.map((feature) => <div className="grid gap-2 rounded-md border border-[#F0E7E9] p-3 sm:grid-cols-3" key={feature.id}><input className="task-input" value={feature.name} onChange={(event) => updateFeature(draft, feature.id, { name: event.target.value }, onChange)} /><input className="task-input" value={feature.category ?? ""} onChange={(event) => updateFeature(draft, feature.id, { category: event.target.value }, onChange)} /><select className="task-input" value={feature.type} onChange={(event) => updateFeature(draft, feature.id, { type: event.target.value as ProductFeature["type"] }, onChange)}><option value="standard">標準機能</option><option value="option">オプション</option></select></div>)}</EditorList>;
}

function ImplementationEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const add = () => onChange({ ...draft, implementation: { ...draft.implementation, flowSteps: [...draft.implementation.flowSteps, { id: crypto.randomUUID(), title: "新しいステップ", owner: "mogcia", sortOrder: draft.implementation.flowSteps.length }] } });
  return <EditorList onAdd={add}>{draft.implementation.flowSteps.map((step) => <div className="grid gap-2 rounded-md border border-[#F0E7E9] p-3 sm:grid-cols-3" key={step.id}><input className="task-input" value={step.title} onChange={(event) => updateStep(draft, step.id, { title: event.target.value }, onChange)} /><select className="task-input" value={step.owner} onChange={(event) => updateStep(draft, step.id, { owner: event.target.value as ProductFlowStep["owner"] }, onChange)}><option value="mogcia">MOGCIA</option><option value="client">クライアント</option><option value="both">両方</option></select><input className="task-input" placeholder="目安日数" value={step.estimatedDays ?? ""} onChange={(event) => updateStep(draft, step.id, { estimatedDays: numberOrNull(event.target.value) }, onChange)} /></div>)}</EditorList>;
}

function SalesEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const set = (salesSettings: Product["salesSettings"]) => onChange({ ...draft, salesSettings });
  const addHearing = () => set({ ...draft.salesSettings, requiredHearingItems: [...draft.salesSettings.requiredHearingItems, { id: crypto.randomUUID(), label: "新しい質問", inputType: "text", required: true, sortOrder: draft.salesSettings.requiredHearingItems.length }] });
  return <div className="grid gap-4 sm:grid-cols-2"><Input label="想定商談時間（分）" value={String(draft.salesSettings.expectedMeetingMinutes ?? "")} onChange={(value) => set({ ...draft.salesSettings, expectedMeetingMinutes: numberOrNull(value) })} /><Input label="想定受注期間（日）" value={String(draft.salesSettings.expectedSalesCycleDays ?? "")} onChange={(value) => set({ ...draft.salesSettings, expectedSalesCycleDays: numberOrNull(value) })} /><Text label="商談ステージ" value={toLines(draft.salesSettings.salesStages)} onChange={(value) => set({ ...draft.salesSettings, salesStages: fromLines(value) })} /><Text label="反論カテゴリ" value={toLines(draft.salesSettings.objectionCategories)} onChange={(value) => set({ ...draft.salesSettings, objectionCategories: fromLines(value) })} /><Text label="失注理由カテゴリ" value={toLines(draft.salesSettings.lossReasonCategories)} onChange={(value) => set({ ...draft.salesSettings, lossReasonCategories: fromLines(value) })} /><div><button className="h-10 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={addHearing} type="button">ヒアリング項目を追加</button>{draft.salesSettings.requiredHearingItems.map((item) => <input className="task-input mt-2" key={item.id} value={item.label} onChange={(event) => set({ ...draft.salesSettings, requiredHearingItems: draft.salesSettings.requiredHearingItems.map((entry) => entry.id === item.id ? { ...entry, label: event.target.value } : entry) })} />)}</div></div>;
}

function ResourceEditor({ draft, user, onChange }: { draft: Product; user: { id: string; name: string }; onChange: (product: Product) => void }) {
  const [progress, setProgress] = useState(0);
  const addUrl = () => onChange({ ...draft, resources: [...draft.resources, { id: crypto.randomUUID(), title: "新しい資料", type: "proposal", url: "", visibility: "internal", createdBy: user.id, createdAt: draft.updatedAt, updatedAt: draft.updatedAt }] });
  return <div><div className="flex gap-2"><button className="h-10 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={addUrl} type="button">URL資料を追加</button><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]"><FileUp className="h-4 w-4" />ファイル<input className="hidden" type="file" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const resource = await addResourceFile(draft, file, user, setProgress); onChange({ ...draft, resources: [...draft.resources, resource] }); }} /></label>{progress > 0 ? <span className="text-sm font-bold text-[#EC6F8B]">{progress}%</span> : null}</div><div className="mt-3 grid gap-3">{draft.resources.map((resource) => <div className="grid gap-2 rounded-md border border-[#F0E7E9] p-3 sm:grid-cols-3" key={resource.id}><input className="task-input" value={resource.title} onChange={(event) => updateResource(draft, resource.id, { title: event.target.value }, onChange)} /><input className="task-input" value={resource.url ?? ""} onChange={(event) => updateResource(draft, resource.id, { url: event.target.value }, onChange)} /><select className="task-input" value={resource.visibility} onChange={(event) => updateResource(draft, resource.id, { visibility: event.target.value as ProductResource["visibility"] }, onChange)}><option value="internal">社内限定</option><option value="sales">営業担当のみ</option><option value="client_shareable">クライアント共有可</option><option value="public">一般公開</option></select></div>)}</div></div>;
}

function ProductHistory({ productId }: { productId: string }) {
  const [logs, setLogs] = useState<Array<{ id: string; actorName?: string; action: string; targetTab: string; createdAt?: { toDate: () => Date } }>>([]);
  useEffect(() => {
    void import("@/lib/products").then(({ subscribeProductChangeLogs }) => subscribeProductChangeLogs(productId, setLogs, () => setLogs([])));
  }, [productId]);
  return <div className="space-y-3">{logs.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">変更履歴はまだありません。</p> : logs.map((log) => <div className="rounded-md border border-[#F0E7E9] bg-[#FFFBFC] p-3" key={log.id}><p className="font-bold text-[#2B2B2B]">{log.action}</p><p className="mt-1 text-sm font-semibold text-[#777]">{log.actorName || "不明"} / {log.targetTab} / {log.createdAt?.toDate().toLocaleString("ja-JP") ?? ""}</p></div>)}</div>;
}

function CreateProductModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: Pick<Product, "name" | "displayName" | "categoryNames" | "productType" | "tagline" | "status">) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", displayName: "", categoryNames: "", productType: "own_product" as ProductType, tagline: "", status: "draft" as ProductStatus });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm"><section className="w-full max-w-xl rounded-lg border border-[#F0E7E9] bg-white p-5 shadow-2xl"><h2 className="text-2xl font-bold text-[#2B2B2B]">新しい商材を追加</h2><div className="mt-5 grid gap-4"><Input label="商材名" value={form.name} onChange={(name) => setForm({ ...form, name, displayName: form.displayName || name })} /><Input label="表示名" value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} /><Input label="カテゴリ" value={form.categoryNames} onChange={(categoryNames) => setForm({ ...form, categoryNames })} /><SelectField label="商材種別" value={form.productType} options={Object.entries(productTypeLabels)} onChange={(value) => setForm({ ...form, productType: value as ProductType })} /><Input label="一言説明" value={form.tagline} onChange={(tagline) => setForm({ ...form, tagline })} /></div><div className="mt-6 flex justify-end gap-3"><button className="h-11 rounded-full border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button><button className="h-11 rounded-full bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={!form.name.trim()} onClick={() => void onCreate({ ...form, categoryNames: form.categoryNames.split(",").map((item) => item.trim()).filter(Boolean) })} type="button">作成</button></div></section></div>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return <div className="grid gap-4">{rows.map(([label, value]) => <div className="grid gap-2 md:grid-cols-[160px_1fr]" key={label}><p className="text-sm font-bold text-[#777]">{label}</p><p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#2B2B2B]">{value}</p></div>)}</div>;
}

function Cards({ title, items }: { title: string; items: string[] }) {
  return <div><h4 className="mb-3 font-bold text-[#2B2B2B]">{title}</h4><div className="grid gap-3">{items.length ? items.map((item) => <p className="rounded-md border border-[#F0E7E9] bg-[#FFFBFC] p-3 text-sm font-semibold text-[#6F676B]" key={item}>{item}</p>) : <p className="text-sm font-bold text-[#8A8A8A]">未登録です。</p>}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<input className="task-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<textarea className="task-input min-h-24 resize-none" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<select className="task-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([nextValue, nextLabel]) => <option key={nextValue} value={nextValue}>{nextLabel}</option>)}</select></label>;
}

function EditorList({ children, onAdd }: { children: React.ReactNode; onAdd: () => void }) {
  return <div><button className="h-10 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={onAdd} type="button">追加</button><div className="mt-3 grid gap-3">{children}</div></div>;
}

function ProductSkeleton() {
  return <SkeletonList count={5} media />;
}

function EmptyProducts({ onCreate }: { onCreate: () => void }) {
  return <EmptyState actionLabel="新しい商材を追加" description="最初の商材を追加して、営業・提案に必要な情報を整理しましょう。" onAction={onCreate} title="商材がまだ登録されていません" />;
}

function updateFeature(product: Product, id: string, patch: Partial<ProductFeature>, onChange: (product: Product) => void) {
  onChange({ ...product, features: product.features.map((feature) => feature.id === id ? { ...feature, ...patch } : feature) });
}

function updateStep(product: Product, id: string, patch: Partial<ProductFlowStep>, onChange: (product: Product) => void) {
  onChange({ ...product, implementation: { ...product.implementation, flowSteps: product.implementation.flowSteps.map((step) => step.id === id ? { ...step, ...patch } : step) } });
}

function updateResource(product: Product, id: string, patch: Partial<ProductResource>, onChange: (product: Product) => void) {
  onChange({ ...product, resources: product.resources.map((resource) => resource.id === id ? { ...resource, ...patch } : resource) });
}

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() ? parsed : null;
}
