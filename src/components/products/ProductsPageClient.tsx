"use client";

import { Download, Edit2, ExternalLink, FileUp, Plus, Save, Search, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner } from "@/components/ui/status";
import { exportProductsCsv } from "@/lib/product-export";
import { createDefaultSalesPlaybooks, productTabs, productTypeLabels, toLines, fromLines, yen } from "@/lib/product-utils";
import { addResourceFile, uploadProductIcon } from "@/lib/products";
import { getUserDisplayNameById } from "@/lib/user-display";
import { useProducts } from "@/hooks/useProducts";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import { analyzeProduct, type ProductAnalysis } from "@/components/products/ProductAnalysisPageClient";
import type { Product, ProductCustomerSegment, ProductFeature, ProductMemo, ProductObjectionItem, ProductPlan, ProductResource, ProductSalesPlaybookEntry, ProductStatus, ProductTab, ProductType } from "@/types/product";
import type { TeleapoRecord } from "@/types/teleapo";

const pricingDisplayTypeLabels: Record<Product["pricing"]["displayType"], string> = {
  fixed: "固定料金",
  from: "下限料金から",
  range: "料金範囲",
  estimate: "見積もり",
  hidden: "非公開"
};

const resourceTypeLabels: Record<ProductResource["type"], string> = {
  website: "サイトURL",
  proposal: "提案資料",
  pricing: "料金表",
  service_document: "サービス資料",
  demo: "デモ",
  simulation: "シミュレーション",
  case_document: "事例資料",
  contract_template: "契約書テンプレート",
  other: "その他"
};

const resourceVisibilityLabels: Record<ProductResource["visibility"], string> = {
  internal: "社内限定",
  sales: "営業担当のみ",
  client_shareable: "クライアント共有可",
  public: "一般公開"
};

export function ProductsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const store = useProducts(selectedId);
  const selectedTab = (params.get("tab") as ProductTab | null) ?? "basic";
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [records, setRecords] = useState<TeleapoRecord[]>([]);

  useEffect(() => subscribeTeleapoRecords(setRecords, () => setRecords([])), []);

  const setProductRoute = useCallback((id: string, tab: ProductTab) => {
    router.replace(`${pathname}?id=${id}&tab=${tab}` as Route, { scroll: false });
  }, [pathname, router]);

  const showProductList = useCallback(() => {
    router.replace(pathname as Route, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    return store.products
      .filter((product) => {
        if (product.status === "archived") return false;
        if (!needle) return true;
        return [product.name, product.tagline, product.target.industries.join(" ")].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => (a.sortOrder || Number.MAX_SAFE_INTEGER) - (b.sortOrder || Number.MAX_SAFE_INTEGER) || b.updatedAt.toMillis() - a.updatedAt.toMillis());
  }, [debouncedQuery, store.products]);

  const selectedProduct = selectedId ? store.products.find((product) => product.id === selectedId) ?? null : null;
  const selectedAnalysis = selectedProduct ? analyzeProduct(selectedProduct, records) : null;
  return (
    <div>
      {!selectedProduct ? (
        <PageHeader
          title="商材管理"
          description="自社の提供商材を管理できます"
          actions={
            <>
              <button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しい商材を追加</button>
              <button className="inline-flex h-11 items-center gap-2 rounded-none bg-white px-5 text-sm font-bold text-[#6F676B] shadow-sm ring-1 ring-[#F0E7E9]" onClick={() => exportProductsCsv(filtered)} type="button"><Download className="h-4 w-4" />エクスポート</button>
            </>
          }
        />
      ) : null}
      <div className={selectedProduct ? "" : "mt-4"}><StatusBanner message={store.error} type="error" /></div>
      <div className={selectedProduct ? "mt-0" : "mt-5"}>
        {!selectedProduct ? (
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <div>
            <label className="flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#777]">
              <Search className="h-4 w-4" />
              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="商材名で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
          <div className="mt-4 space-y-3">
            {store.loading ? <ProductSkeleton /> : null}
            {!store.loading && filtered.length === 0 ? <EmptyProducts onCreate={() => setCreateOpen(true)} /> : null}
            {filtered.map((product) => (
              <ProductListItem
                key={product.id}
                product={product}
                active={false}
                onSelect={() => setProductRoute(product.id, "basic")}
              />
            ))}
          </div>
        </section>
        ) : (
        <section className="min-w-0">
            <ProductDetail
              onBack={showProductList}
              canEdit={store.canEdit}
              isAdmin={store.isAdmin}
              key={`${selectedProduct.id}-${productTabs.some((entry) => entry.value === selectedTab) ? selectedTab : "basic"}`}
              onDelete={async () => {
                await store.deleteProduct(selectedProduct.id);
                showProductList();
              }}
              memos={store.memos}
              onAddMemo={(input) => store.addMemo(selectedProduct.id, input)}
              onDeleteMemo={(memoId) => store.deleteMemo(selectedProduct.id, memoId)}
              onUpdateMemo={(memoId, input) => store.updateMemo(selectedProduct.id, memoId, input)}
              onSave={(tab, patch) => store.updateProduct(selectedProduct.id, tab, patch)}
              onTabChange={(tab) => setProductRoute(selectedProduct.id, tab)}
              product={selectedProduct}
              analysis={selectedAnalysis!}
              tab={productTabs.some((entry) => entry.value === selectedTab) ? selectedTab : "basic"}
              user={store.currentUser}
            />
        </section>
        )}
      </div>
      {isCreateOpen ? <CreateProductModal onClose={() => setCreateOpen(false)} onCreate={async (input) => { const id = await store.createProduct(input); setQuery(""); setDebouncedQuery(""); setCreateOpen(false); setProductRoute(id, "basic"); }} /> : null}
    </div>
  );
}

function ProductIcon({ product, size }: { product: Product; size: "sm" | "lg" }) {
  const className = size === "lg" ? "h-20 w-20 text-lg" : "h-14 w-14 text-sm";
  if (product.iconUrl) {
    // Firebase Storageの任意URLを小さな商材アイコンとして表示するため、ここは通常のimgを使う。
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" className={`${className} rounded-none object-cover ring-1 ring-[#F0E7E9]`} src={product.iconUrl} />;
  }
  return <span className={`grid ${className} place-items-center rounded-none bg-[#EC6F8B] font-bold text-white`}>{product.name.slice(0, 2)}</span>;
}

function ProductListItem({ product, active, onSelect }: { product: Product; active: boolean; onSelect: () => void }) {
  return (
    <div className={`grid w-full rounded-none border p-2 ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`}>
      <button className="grid min-w-0 grid-cols-[56px_1fr] items-center gap-3 p-1 text-left" onClick={onSelect} type="button">
        <ProductIcon product={product} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-[#2B2B2B]">{product.name}</span>
          {product.tagline ? <span className="mt-1 block truncate text-sm font-semibold text-[#777]">{product.tagline}</span> : null}
          <span className="mt-2 block text-xs font-semibold text-[#999]">更新日: {product.updatedAt.toDate().toLocaleDateString("ja-JP")}</span>
        </span>
      </button>
    </div>
  );
}

function ProductDetail({
  product,
  analysis,
  tab,
  canEdit,
  isAdmin,
  user,
  memos,
  onBack,
  onTabChange,
  onSave,
  onDelete,
  onAddMemo,
  onDeleteMemo,
  onUpdateMemo
}: {
  product: Product;
  analysis: ProductAnalysis;
  tab: ProductTab;
  canEdit: boolean;
  isAdmin: boolean;
  user: { id: string; name: string };
  memos: ProductMemo[];
  onBack: () => void;
  onTabChange: (tab: ProductTab) => void;
  onSave: (tab: ProductTab, patch: Partial<Product>) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddMemo: (input: { title: string; content: string; pinned: boolean }) => Promise<void>;
  onDeleteMemo: (memoId: string) => Promise<void>;
  onUpdateMemo: (memoId: string, input: { title: string; content: string; pinned: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(tab, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`商材「${product.name}」を削除しますか？\n\nこの操作は元に戻せません。`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-120px)] gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
      <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ProductIcon product={product} size="lg" />
            <div>
              <button className="mb-2 text-sm font-bold text-[#EC6F8B]" onClick={onBack} type="button">一覧へ戻る</button>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-[#2B2B2B]">{product.name}</h3>
              </div>
              {product.tagline ? <p className="mt-2 text-sm font-semibold text-[#777]">{product.tagline}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && tab !== "insights" ? <button className="h-10 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#EC6F8B]" onClick={() => setEditing(true)} type="button">編集</button> : null}
            {isAdmin ? <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#D94F6E] disabled:opacity-50" disabled={deleting} onClick={() => void remove()} type="button"><Trash2 className="h-4 w-4" />{deleting ? "削除中..." : "削除"}</button> : null}
            {product.resources.find((resource) => resource.type === "website" && resource.url) ? <a className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#6F676B]" href={product.resources.find((resource) => resource.type === "website" && resource.url)?.url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />サイトを開く</a> : null}
            {product.resources.find((resource) => resource.type === "proposal" && resource.url) ? <a className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#6F676B]" href={product.resources.find((resource) => resource.type === "proposal" && resource.url)?.url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />資料を開く</a> : null}
          </div>
        </div>
      </section>
      <section className="flex min-h-[calc(100vh-280px)] flex-col rounded-none border border-[#F0E7E9] bg-white shadow-sm">
        <ProductSectionNav activeTab={tab} onTabChange={onTabChange} />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto p-5 xl:p-6">
            {tab === "notes" ? <ProductNotesTab currentUserId={user.id} isAdmin={isAdmin} memos={memos} onCreate={onAddMemo} onDelete={onDeleteMemo} onUpdate={onUpdateMemo} /> : editing && tab !== "insights" ? <ProductEditForm draft={draft} isAdmin={isAdmin} tab={tab} user={user} onChange={setDraft} /> : <ProductReadView analysis={analysis} isAdmin={isAdmin} product={product} tab={tab} />}
            {tab !== "notes" && tab !== "insights" ? <div className="mt-6 flex justify-end gap-3 border-t border-[#F0E7E9] pt-5">
              {editing ? (
                <>
                  <button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" onClick={() => { setDraft(product); setEditing(false); }} type="button">キャンセル</button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()} type="button"><Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}</button>
                </>
              ) : canEdit ? (
                <button className="h-10 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#EC6F8B]" onClick={() => setEditing(true)} type="button">この項目を編集</button>
              ) : null}
            </div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductSectionNav({ activeTab, onTabChange }: { activeTab: ProductTab; onTabChange: (tab: ProductTab) => void }) {
  return (
    <nav className="border-b border-[#F0E7E9] px-4 py-3" aria-label="商材情報タブ">
      <div className="flex gap-2 overflow-x-auto">
        {productTabs.map((item) => (
          <button
            className={`h-9 shrink-0 rounded-none px-4 text-sm font-bold transition ${activeTab === item.value ? "bg-[#EC6F8B] text-white shadow-sm" : "bg-[#FFFBFC] text-[#6F676B] hover:bg-[#FFF0F3] hover:text-[#EC6F8B]"}`}
            key={item.value}
            onClick={() => onTabChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function ProductReadView({ product, tab, isAdmin, analysis }: { product: Product; tab: ProductTab; isAdmin: boolean; analysis: ProductAnalysis }) {
  if (tab === "basic") return <ProductOverview product={product} analysis={analysis} />;
  if (tab === "target") return <InfoGrid rows={[["対象業種", product.target.industries.join(" / ") || "未設定"], ["ターゲット地域", product.target.regions.join(" / ") || "未設定"], ["対象企業規模", product.target.companySizes.join(" / ") || "未設定"], ["想定担当者", product.target.roles.join(" / ") || "未設定"], ["想定決裁者", product.target.decisionMakerRoles.join(" / ") || "未設定"], ["向いている企業", product.target.suitableConditions.join(" / ") || "未設定"], ["向いていない企業", product.target.unsuitableConditions.join(" / ") || "未設定"], ["導入条件", product.target.requiredConditions.join(" / ") || "未設定"], ["対象外条件", product.target.disqualificationConditions.join(" / ") || "未設定"], ["刺さりやすい顧客条件", product.target.idealCustomerConditions.join(" / ") || "未設定"], ["見込みが薄い条件", product.target.lowPotentialConditions.join(" / ") || "未設定"], ["勝ちパターン", product.target.winningPatterns.join(" / ") || "未設定"], ["失注パターン", product.target.losingPatterns.join(" / ") || "未設定"], ["刺さった言葉", product.target.effectivePhrases.join(" / ") || "未設定"], ["避ける表現", product.target.avoidPhrases.join(" / ") || "未設定"], ["業種別提案角度", product.target.industryProposalAngles.map((item) => `${item.industry}: ${item.proposalAngle}${item.cautions ? `（注意: ${item.cautions}）` : ""}`).join("\n") || "未設定"]]} />;
  if (tab === "pricing") return <InfoGrid rows={[["料金表示方法", pricingDisplayTypeLabels[product.pricing.displayType] ?? "未設定"], ["初期費用", yen(product.pricing.initialFee)], ["月額費用", yen(product.pricing.monthlyFee)], ["最低料金", yen(product.pricing.minimumFee)], ["最高料金", yen(product.pricing.maximumFee)], ["最低契約期間", product.pricing.minimumContractMonths ? `${product.pricing.minimumContractMonths}ヶ月` : "未設定"], ["支払い条件", product.pricing.paymentTerms || "未設定"], ["更新条件", product.pricing.renewalTerms || "未設定"], ["解約条件", product.pricing.cancellationTerms || "未設定"], ...(isAdmin ? [["原価", yen(product.pricing.cost)], ["粗利目安", product.pricing.grossMarginRate ? `${product.pricing.grossMarginRate}%` : "未設定"]] as Array<[string, string]> : []), ["料金メモ", product.pricing.notes || "未設定"], ["料金プラン", formatPricingPlans(product.pricing.plans)]]} />;
  if (tab === "features") return <FeatureReadView product={product} />;
  if (tab === "implementation") return <ObjectionHandbookReadView product={product} />;
  if (tab === "sales") return <SalesSettingsReadView product={product} />;
  if (tab === "new") return <SalesPlaybookReadView product={product} segment="new" />;
  if (tab === "existing") return <SalesPlaybookReadView product={product} segment="existing" />;
  if (tab === "insights") return <ProductInsights analysis={analysis} />;
  if (tab === "resources") return <ResourceReadView product={product} />;
  return null;
}

function ProductOverview({ product, analysis }: { product: Product; analysis: ProductAnalysis }) {
  const actual = analysis.actual;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section>
        <p className="text-sm font-black text-[#EC6F8B]">この商材とは</p>
        <h2 className="mt-2 text-2xl font-black text-[#2B2B2B]">{product.displayName || product.name}</h2>
        {product.tagline ? <p className="mt-2 text-lg font-bold text-[#655D62]">{product.tagline}</p> : null}
        <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm font-semibold leading-7 text-[#6F676B]">{product.summary || "商材概要はまだ登録されていません。"}</p>
      </section>

      <div className="grid gap-8 border-y border-[#F0E7E9] py-7 md:grid-cols-3">
        <ProductKnowledgeList title="主な対象" items={product.target.industries} empty="対象業種を追加してください" />
        <ProductKnowledgeList title="解決すること" items={product.problems} empty="解決課題を追加してください" />
        <ProductKnowledgeList title="提供する価値" items={product.values} empty="提供価値を追加してください" />
      </div>

      <section className="bg-[#FFF8FA] p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-sm font-black text-[#EC6F8B]">MOGCIAの商材理解度</p><p className="mt-2 text-4xl font-black text-[#2B2B2B]">{analysis.score}%</p><p className="mt-2 text-sm font-semibold text-[#6F676B]">商材の良し悪しではなく、営業支援に使える情報の充足度です。</p></div>
          <a className="inline-flex h-10 items-center border border-[#F0DDE2] bg-white px-4 text-sm font-bold text-[#EC6F8B]" href={`?id=${product.id}&tab=${missingTab(analysis.missing[0])}`}>不足情報を追加</a>
        </div>
        <div className="mt-5 h-2 bg-[#F2E4E8]"><div className="h-full bg-[#EC6F8B]" style={{ width: `${analysis.score}%` }} /></div>
        {analysis.missing.length ? <div className="mt-5"><p className="text-xs font-black text-[#91868B]">不足している情報</p><ul className="mt-2 flex flex-wrap gap-2">{analysis.missing.map((item) => <li className="bg-white px-3 py-1.5 text-xs font-bold text-[#6F676B]" key={item}>{item}</li>)}</ul></div> : null}
      </section>

      <section>
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black text-[#2B2B2B]">最近の商談から</h2><a className="text-sm font-bold text-[#EC6F8B]" href={`?id=${product.id}&tab=insights`}>商談インサイトを見る</a></div>
        {actual.records.length ? <div className="mt-5 grid gap-7 md:grid-cols-2"><ProductKnowledgeList title="よく刺さっている" items={actual.positiveSignals} empty="具体的な反応はまだありません" /><ProductKnowledgeList title="よく出る懸念" items={actual.lossRisks} empty="懸念はまだ集計されていません" /></div> : <p className="mt-4 text-sm font-semibold text-[#8A8186]">この商材に紐づく商談データはまだありません。</p>}
      </section>
    </div>
  );
}

function ProductInsights({ analysis }: { analysis: ProductAnalysis }) {
  const actual = analysis.actual;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div><h2 className="text-2xl font-black text-[#2B2B2B]">商談インサイト</h2><p className="mt-2 text-sm font-semibold text-[#7A7075]">Product masterのPlaybookとは分けて、実際のテレアポ・商談から得た傾向を表示します。</p></div>
      <dl className="grid gap-4 border-y border-[#F0E7E9] py-6 sm:grid-cols-3 lg:grid-cols-5">
        {[['総件数', actual.records.length], ['テレアポ', actual.teleapoCount], ['商談', actual.meetingCount], ['分析済み', actual.analyzedCount], ['平均見込み', actual.averageProspectScore === null ? '—' : `${actual.averageProspectScore}%`]].map(([label, value]) => <div key={String(label)}><dt className="text-xs font-bold text-[#93888D]">{label}</dt><dd className="mt-1 text-xl font-black text-[#2B2B2B]">{value}</dd></div>)}
      </dl>
      {actual.analyzedCount < 5 ? <p className="border-l-2 border-[#EC6F8B] bg-[#FFF8FA] px-4 py-3 text-sm font-semibold text-[#6F676B]">まだ十分な分析データがありません。割合による断定はせず、取得できた具体的な反応だけを表示しています。</p> : null}
      <div className="grid gap-8 md:grid-cols-2"><ProductKnowledgeList title="最近よく刺さっている内容" items={actual.positiveSignals} empty="まだ抽出されていません" /><ProductKnowledgeList title="よく出る課題" items={actual.frequentIssues} empty="まだ抽出されていません" /><ProductKnowledgeList title="決まりそうな条件" items={actual.closingRequirements} empty="まだ抽出されていません" /><ProductKnowledgeList title="よく出る懸念・失注リスク" items={actual.lossRisks} empty="まだ抽出されていません" /></div>
      <section><h3 className="text-lg font-black text-[#2B2B2B]">最近の商談</h3>{actual.records.length ? <div className="mt-3 divide-y divide-[#F0E7E9]">{actual.records.slice(0, 8).map((record) => <a className="flex items-center justify-between gap-4 py-4" href={`/sales/analysis?recordId=${record.id}`} key={record.id}><span><span className="block text-sm font-black text-[#2B2B2B]">{record.customerName || "会社名未設定"}</span><span className="mt-1 block text-xs font-semibold text-[#8A8186]">{record.salesDomain === "meeting" ? "商談" : "テレアポ"} / {record.recordedAt.toDate().toLocaleDateString("ja-JP")}</span></span><span className="text-sm font-black text-[#EC6F8B]">{record.aiAdvice?.prospectRank ?? "未判定"}{typeof record.aiAdvice?.prospectScore === "number" ? ` / ${record.aiAdvice.prospectScore}` : ""}</span></a>)}</div> : <p className="mt-3 text-sm font-semibold text-[#8A8186]">商談データはまだありません。</p>}</section>
    </div>
  );
}

function ProductKnowledgeList({ empty, items, title }: { empty: string; items: string[]; title: string }) { return <div><h3 className="text-sm font-black text-[#2B2B2B]">{title}</h3>{items.length ? <ul className="mt-3 space-y-2">{items.map((item) => <li className="flex gap-2 text-sm font-semibold leading-6 text-[#6F676B]" key={item}><span className="text-[#EC6F8B]">•</span>{item}</li>)}</ul> : <p className="mt-3 text-sm font-semibold text-[#A0969A]">{empty}</p>}</div>; }
function missingTab(item?: string): ProductTab { if (!item) return "basic"; if (item.includes("資料") || item.includes("サイト")) return "resources"; if (item.includes("反論")) return "implementation"; if (item.includes("勝ち") || item.includes("失注") || item.includes("条件")) return "target"; return "basic"; }

function formatPricingPlans(plans: ProductPlan[]): string {
  if (plans.length === 0) return "未設定";
  return plans
    .map((plan) => {
      const fees = [
        `初期 ${yen(plan.initialFee)}`,
        `月額 ${yen(plan.monthlyFee)}`,
        plan.oneTimeFee ? `単発 ${yen(plan.oneTimeFee)}` : ""
      ].filter(Boolean).join(" / ");
      const flags = [plan.recommended ? "推奨" : "", plan.isActive ? "表示中" : "非表示"].filter(Boolean).join(" / ");
      return [plan.name, fees, plan.description, plan.features.join("・"), flags].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function SalesSettingsReadView({ product }: { product: Product }) {
  return <InfoGrid rows={[["想定商談時間", product.salesSettings.expectedMeetingMinutes ? `${product.salesSettings.expectedMeetingMinutes}分` : "未設定"], ["想定受注期間", product.salesSettings.expectedSalesCycleDays ? `${product.salesSettings.expectedSalesCycleDays}日` : "未設定"], ["営業ステージ", product.salesSettings.salesStages.join(" / ") || "未設定"], ["よくある反論カテゴリ", product.salesSettings.objectionCategories.join(" / ") || "未設定"], ["失注理由カテゴリ", product.salesSettings.lossReasonCategories.join(" / ") || "未設定"]]} />;
}

function ResourceReadView({ product }: { product: Product }) {
  if (product.resources.length === 0) return <Cards title="サイト・資料" items={[]} />;
  return (
    <div className="grid gap-3">
      {product.resources.map((resource) => (
        <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={resource.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#EC6F8B]">{resourceTypeLabels[resource.type] ?? "その他"} / {resourceVisibilityLabels[resource.visibility] ?? "未設定"}</p>
              <h3 className="mt-2 truncate text-lg font-bold text-[#2B2B2B]">{resource.title || "タイトル未設定"}</h3>
              {resource.description ? <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#6F676B]">{resource.description}</p> : null}
            </div>
            {resource.url ? <a className="inline-flex h-10 shrink-0 items-center justify-center rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#EC6F8B]" href={resource.url} rel="noreferrer" target="_blank">開く</a> : null}
          </div>
          {resource.url ? <p className="mt-3 break-all text-xs font-semibold text-[#8A8186]">{resource.url}</p> : null}
        </section>
      ))}
    </div>
  );
}

function ProductNotesTab({ memos, currentUserId, isAdmin, onCreate, onDelete, onUpdate }: { memos: ProductMemo[]; currentUserId: string; isAdmin: boolean; onCreate: (input: { title: string; content: string; pinned: boolean }) => Promise<void>; onDelete: (memoId: string) => Promise<void>; onUpdate: (memoId: string, input: { title: string; content: string; pinned: boolean }) => Promise<void> }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<ProductMemo | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const sortedMemos = useMemo(() => [...memos].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.toMillis() - a.createdAt.toMillis()), [memos]);
  const selectedMemo = sortedMemos.find((memo) => memo.id === selectedMemoId) ?? sortedMemos[0] ?? null;
  const canManageSelectedMemo = selectedMemo ? isAdmin || selectedMemo.createdBy === currentUserId : false;

  const remove = async (memoId: string) => {
    if (!window.confirm("このメモを削除しますか？")) return;
    await onDelete(memoId);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[#6F676B]">{sortedMemos.length}件のメモ</p>
        <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />メモを追加</button>
      </div>
      {sortedMemos.length === 0 ? <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-8 text-center text-sm font-bold text-[#8A8A8A]">メモはまだありません。</p> : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            {sortedMemos.map((memo) => {
              const active = selectedMemo?.id === memo.id;
              return (
                <button className={`w-full rounded-none border p-3 text-left transition ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} key={memo.id} onClick={() => setSelectedMemoId(memo.id)} type="button">
                  <span className="block truncate text-sm font-black text-[#2B2B2B]">{memo.pinned ? "固定: " : ""}{memo.title || "無題のメモ"}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[#8A8186]">{memo.createdByName ?? "作成者未設定"} / {memo.createdAt.toDate().toLocaleDateString("ja-JP")}</span>
                </button>
              );
            })}
          </div>
          <article className="min-h-80 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-5">
            {selectedMemo ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="break-words text-lg font-black text-[#2B2B2B]">{selectedMemo.pinned ? "固定: " : ""}{selectedMemo.title || "無題のメモ"}</h4>
                    <p className="mt-1 text-xs font-semibold text-[#777]">{selectedMemo.createdByName ?? "作成者未設定"} / {selectedMemo.createdAt.toDate().toLocaleDateString("ja-JP")}</p>
                  </div>
                  {canManageSelectedMemo ? (
                    <div className="flex shrink-0 gap-2">
                      <button className="grid h-9 w-9 place-items-center border border-[#F0E7E9] bg-white text-[#EC6F8B] transition hover:bg-[#FFF0F3]" onClick={() => setEditingMemo(selectedMemo)} type="button" aria-label="メモを編集">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button className="grid h-9 w-9 place-items-center border border-[#F6CBD2] bg-white text-[#E65A78] transition hover:bg-[#FFF0F3]" onClick={() => void remove(selectedMemo.id)} type="button" aria-label="メモを削除">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-5 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#2B2B2B]">{selectedMemo.content || "内容は未入力です。"}</p>
              </>
            ) : null}
          </article>
        </div>
      )}
      {createOpen ? <ProductMemoModal onClose={() => setCreateOpen(false)} onSubmit={async (input) => { await onCreate(input); setCreateOpen(false); }} /> : null}
      {editingMemo ? <ProductMemoModal initial={editingMemo} mode="edit" onClose={() => setEditingMemo(null)} onSubmit={async (input) => { await onUpdate(editingMemo.id, input); setEditingMemo(null); }} /> : null}
    </div>
  );
}

function ProductMemoModal({ mode = "create", initial, onClose, onSubmit }: { mode?: "create" | "edit"; initial?: { title: string; content: string; pinned: boolean }; onClose: () => void; onSubmit: (input: { title: string; content: string; pinned: boolean }) => Promise<void> }) {
  const [form, setForm] = useState({ title: initial?.title ?? "", content: initial?.content ?? "", pinned: initial?.pinned ?? false });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ title: form.title.trim(), content: form.content.trim(), pinned: form.pinned });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl">
        <h2 className="text-2xl font-bold text-[#2B2B2B]">{mode === "edit" ? "メモを編集" : "メモを追加"}</h2>
        <div className="mt-5 grid gap-4">
          <Input label="タイトル" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <Text label="内容" value={form.content} onChange={(content) => setForm({ ...form, content })} />
          <label className="flex items-center gap-2 text-sm font-bold text-[#655D62]"><input checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} type="checkbox" />固定表示</label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !form.title.trim()} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存"}</button>
        </div>
      </section>
    </div>
  );
}

function ObjectionHandbookReadView({ product }: { product: Product }) {
  const items = product.objectionHandbook ?? [];
  if (items.length === 0) return <Cards title="反論想定" items={[]} />;
  return (
    <div className="grid gap-4">
      {items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
        <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={item.id}>
          <p className="text-xs font-bold text-[#EC6F8B]">{item.category || "カテゴリ未設定"}</p>
          <h3 className="mt-2 text-lg font-bold text-[#2B2B2B]">{item.objection || "反論未設定"}</h3>
          <InfoGrid rows={[["回答例", item.responseExample || "未設定"], ["伝え方", item.howToTell || "未設定"], ["避ける表現", item.avoidPhrases?.join("\n") || "未設定"]]} />
        </section>
      ))}
    </div>
  );
}

function SalesPlaybookReadView({ product, segment }: { product: Product; segment: ProductCustomerSegment }) {
  const playbooks = product.salesSettings.salesPlaybooks ?? createDefaultSalesPlaybooks();
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <PlaybookSceneRead title="テレアポ" entry={playbooks.teleapo[segment]} />
      <PlaybookSceneRead title="商談" entry={playbooks.meeting[segment]} />
    </div>
  );
}

function PlaybookSceneRead({ entry, title }: { entry: ProductSalesPlaybookEntry; title: string }) {
  const configured = Boolean(entry.proposalDirection || entry.process || entry.talkScript || entry.keyQuestions.length || entry.materials.length);
  return <section><h3 className="text-lg font-black text-[#2B2B2B]">{title}</h3>{configured ? <InfoGrid rows={[["提案方針", entry.proposalDirection || "未設定"], ["進め方", entry.process || "未設定"], ["必ず確認すること", entry.keyQuestions.join("\n") || "未設定"], ["トーク例", entry.talkScript || "未設定"], ["必要資料", entry.materials.join("\n") || "未設定"], ["注意点", entry.cautions.join("\n") || "未設定"]]} /> : <div className="mt-3 border border-dashed border-[#E9E1E4] bg-[#FFFBFC] p-5"><p className="font-black text-[#2B2B2B]">まだPlaybookがありません。</p><p className="mt-2 text-sm font-semibold leading-6 text-[#7A7075]">MOGCIAはこの場面の質問や切り返しを十分に生成できません。「この項目を編集」からPlaybookを作成してください。</p></div>}</section>;
}

function ProductEditForm({ draft, tab, isAdmin, user, onChange }: { draft: Product; tab: ProductTab; isAdmin: boolean; user: { id: string; name: string }; onChange: (product: Product) => void }) {
  const set = (patch: Partial<Product>) => onChange({ ...draft, ...patch });
  if (tab === "basic") return <BasicProductEditor draft={draft} onChange={onChange} />;
  if (tab === "target") return <TargetEditor draft={draft} onChange={onChange} />;
  if (tab === "pricing") return <PricingEditor draft={draft} isAdmin={isAdmin} onChange={onChange} />;
  if (tab === "features") return <FeatureEditor draft={draft} onChange={onChange} />;
  if (tab === "implementation") return <ObjectionHandbookEditor draft={draft} onChange={onChange} />;
  if (tab === "sales") return <SalesSettingsEditor draft={draft} onChange={onChange} />;
  if (tab === "new") return <SalesPlaybookEditor draft={draft} segment="new" onChange={onChange} />;
  if (tab === "existing") return <SalesPlaybookEditor draft={draft} segment="existing" onChange={onChange} />;
  if (tab === "resources") return <ResourceEditor draft={draft} user={user} onChange={onChange} />;
  return null;
}

function EditGroup({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-4">
      <div className="mb-4">
        <h5 className="text-base font-bold text-[#2B2B2B]">{title}</h5>
        {description ? <p className="mt-1 text-sm font-semibold leading-5 text-[#8A8A8A]">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TargetEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const updateTarget = (patch: Partial<Product["target"]>) => onChange({ ...draft, target: { ...draft.target, ...patch } });
  return (
    <div className="grid gap-4">
      <EditGroup title="誰に売るか" description="業種・地域・規模・担当者など、商材分析で絞り込みに使う条件です。">
        <Text label="対象業種" value={toLines(draft.target.industries)} onChange={(value) => updateTarget({ industries: fromLines(value) })} />
        <Text label="ターゲット地域" value={toLines(draft.target.regions)} onChange={(value) => updateTarget({ regions: fromLines(value) })} />
        <Text label="対象企業規模" value={toLines(draft.target.companySizes)} onChange={(value) => updateTarget({ companySizes: fromLines(value) })} />
        <Text label="想定担当者" value={toLines(draft.target.roles)} onChange={(value) => updateTarget({ roles: fromLines(value) })} />
        <Text label="想定決裁者" value={toLines(draft.target.decisionMakerRoles)} onChange={(value) => updateTarget({ decisionMakerRoles: fromLines(value) })} />
      </EditGroup>
      <EditGroup title="向いている条件・対象外条件" description="商談前の見込み判定や、AIの提案方針に使います。">
        <Text label="向いている企業" value={toLines(draft.target.suitableConditions)} onChange={(value) => updateTarget({ suitableConditions: fromLines(value) })} />
        <Text label="向いていない企業" value={toLines(draft.target.unsuitableConditions)} onChange={(value) => updateTarget({ unsuitableConditions: fromLines(value) })} />
        <Text label="導入条件" value={toLines(draft.target.requiredConditions)} onChange={(value) => updateTarget({ requiredConditions: fromLines(value) })} />
        <Text label="対象外条件" value={toLines(draft.target.disqualificationConditions)} onChange={(value) => updateTarget({ disqualificationConditions: fromLines(value) })} />
        <Text label="刺さりやすい顧客条件" value={toLines(draft.target.idealCustomerConditions)} onChange={(value) => updateTarget({ idealCustomerConditions: fromLines(value) })} />
        <Text label="見込みが薄い条件" value={toLines(draft.target.lowPotentialConditions)} onChange={(value) => updateTarget({ lowPotentialConditions: fromLines(value) })} />
      </EditGroup>
      <EditGroup title="勝ち負けパターン・言葉" description="音声分析や営業アドバイスで、AIが参照する営業ルールです。">
        <Text label="勝ちパターン" value={toLines(draft.target.winningPatterns)} onChange={(value) => updateTarget({ winningPatterns: fromLines(value) })} />
        <Text label="失注パターン" value={toLines(draft.target.losingPatterns)} onChange={(value) => updateTarget({ losingPatterns: fromLines(value) })} />
        <Text label="刺さった言葉" value={toLines(draft.target.effectivePhrases)} onChange={(value) => updateTarget({ effectivePhrases: fromLines(value) })} />
        <Text label="避ける表現" value={toLines(draft.target.avoidPhrases)} onChange={(value) => updateTarget({ avoidPhrases: fromLines(value) })} />
      </EditGroup>
      <EditGroup title="業種別の提案角度" description="ゴルフ場・ホテル・美容など、業種ごとの刺さり方を分けて保存できます。">
        <div className="sm:col-span-2">
          <IndustryAnglesEditor draft={draft} onChange={onChange} />
        </div>
      </EditGroup>
    </div>
  );
}

function BasicProductEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const [iconProgress, setIconProgress] = useState(0);
  const [iconError, setIconError] = useState("");
  const set = (patch: Partial<Product>) => onChange({ ...draft, ...patch });
  const uploadIcon = async (file: File) => {
    try {
      setIconError("");
      setIconProgress(1);
      const icon = await uploadProductIcon(draft, file, setIconProgress);
      set({ ...icon });
    } catch (error) {
      setIconError(error instanceof Error ? error.message : "アイコンのアップロードに失敗しました。");
    } finally {
      setIconProgress(0);
    }
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-bold text-[#655D62]">アイコン</p>
        <div className="flex flex-wrap items-center gap-4 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4">
          <ProductIcon product={draft} size="lg" />
          <div className="grid gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#EC6F8B]">
              <FileUp className="h-4 w-4" />
              アイコンをアップロード
              <input accept="image/*" className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadIcon(file); }} />
            </label>
            {iconProgress > 0 ? <p className="text-xs font-bold text-[#EC6F8B]">アップロード中 {iconProgress}%</p> : <p className="text-xs font-semibold text-[#8A8A8A]">正方形の画像がおすすめです。アップロード後に保存してください。</p>}
            {iconError ? <p className="max-w-md text-xs font-bold leading-5 text-[#D9435F]">{iconError}</p> : null}
          </div>
        </div>
      </div>
      <Input label="商材名" value={draft.name} onChange={(name) => set({ name, displayName: name })} />
      <SelectField label="商材種別" value={draft.productType} options={Object.entries(productTypeLabels)} onChange={(value) => set({ productType: value as ProductType })} />
      <Input label="一言説明" value={draft.tagline} onChange={(tagline) => set({ tagline })} />
      <Text label="概要" value={draft.summary} onChange={(summary) => set({ summary })} />
      <Text label="提供価値" value={toLines(draft.values)} onChange={(value) => set({ values: fromLines(value) })} />
      <Text label="解決する課題" value={toLines(draft.problems)} onChange={(value) => set({ problems: fromLines(value) })} />
    </div>
  );
}

function IndustryAnglesEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const items = draft.target.industryProposalAngles ?? [];
  const update = (id: string, patch: Partial<Product["target"]["industryProposalAngles"][number]>) => {
    onChange({ ...draft, target: { ...draft.target, industryProposalAngles: items.map((item) => (item.id === id ? { ...item, ...patch } : item)) } });
  };
  const add = () => {
    onChange({ ...draft, target: { ...draft.target, industryProposalAngles: [...items, { id: crypto.randomUUID(), industry: "", proposalAngle: "", cautions: "" }] } });
  };
  const remove = (id: string) => {
    onChange({ ...draft, target: { ...draft.target, industryProposalAngles: items.filter((item) => item.id !== id) } });
  };
  return (
    <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[#655D62]">業種別の提案角度</p>
        <button className="h-9 rounded-none border border-[#F0E7E9] bg-white px-3 text-xs font-bold text-[#EC6F8B]" onClick={add} type="button">追加</button>
      </div>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <div className="grid gap-2 rounded-none border border-[#F0E7E9] bg-white p-3 md:grid-cols-[160px_1fr_1fr_auto]" key={item.id}>
            <input className="task-input" placeholder="業種" value={item.industry} onChange={(event) => update(item.id, { industry: event.target.value })} />
            <input className="task-input" placeholder="提案角度" value={item.proposalAngle} onChange={(event) => update(item.id, { proposalAngle: event.target.value })} />
            <input className="task-input" placeholder="注意点" value={item.cautions ?? ""} onChange={(event) => update(item.id, { cautions: event.target.value })} />
            <button className="h-11 rounded-none border border-[#F0E7E9] px-3 text-xs font-bold text-[#D94F6E]" onClick={() => remove(item.id)} type="button">削除</button>
          </div>
        ))}
        {items.length === 0 ? <p className="rounded-none border border-dashed border-[#F0E7E9] bg-white p-4 text-sm font-bold text-[#8A8A8A]">ゴルフ場向け、ホテル向けなど、業種ごとの提案角度を登録できます。</p> : null}
      </div>
    </div>
  );
}

function PricingEditor({ draft, isAdmin, onChange }: { draft: Product; isAdmin: boolean; onChange: (product: Product) => void }) {
  const setPricing = (pricing: Product["pricing"]) => onChange({ ...draft, pricing });
  const addPlan = () => setPricing({ ...draft.pricing, plans: [...draft.pricing.plans, { id: crypto.randomUUID(), name: "新しいプラン", features: [], recommended: false, isActive: true, sortOrder: draft.pricing.plans.length }] });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="料金表示方法" value={draft.pricing.displayType} options={Object.entries(pricingDisplayTypeLabels)} onChange={(value) => setPricing({ ...draft.pricing, displayType: value as Product["pricing"]["displayType"] })} />
      <Input label="初期費用" value={String(draft.pricing.initialFee ?? "")} onChange={(value) => setPricing({ ...draft.pricing, initialFee: numberOrNull(value) })} />
      <Input label="月額費用" value={String(draft.pricing.monthlyFee ?? "")} onChange={(value) => setPricing({ ...draft.pricing, monthlyFee: numberOrNull(value) })} />
      <Input label="最低料金" value={String(draft.pricing.minimumFee ?? "")} onChange={(value) => setPricing({ ...draft.pricing, minimumFee: numberOrNull(value) })} />
      <Input label="最高料金" value={String(draft.pricing.maximumFee ?? "")} onChange={(value) => setPricing({ ...draft.pricing, maximumFee: numberOrNull(value) })} />
      <Input label="最低契約期間（月）" value={String(draft.pricing.minimumContractMonths ?? "")} onChange={(value) => setPricing({ ...draft.pricing, minimumContractMonths: numberOrNull(value) })} />
      <Input label="支払い条件" value={draft.pricing.paymentTerms ?? ""} onChange={(value) => setPricing({ ...draft.pricing, paymentTerms: value })} />
      <Input label="更新条件" value={draft.pricing.renewalTerms ?? ""} onChange={(value) => setPricing({ ...draft.pricing, renewalTerms: value })} />
      <Input label="解約条件" value={draft.pricing.cancellationTerms ?? ""} onChange={(value) => setPricing({ ...draft.pricing, cancellationTerms: value })} />
      {isAdmin ? (
        <>
          <Input label="原価" value={String(draft.pricing.cost ?? "")} onChange={(value) => setPricing({ ...draft.pricing, cost: numberOrNull(value) })} />
          <Input label="粗利目安（%）" value={String(draft.pricing.grossMarginRate ?? "")} onChange={(value) => setPricing({ ...draft.pricing, grossMarginRate: numberOrNull(value) })} />
        </>
      ) : null}
      <div className="sm:col-span-2">
        <Text label="料金メモ" value={draft.pricing.notes ?? ""} onChange={(value) => setPricing({ ...draft.pricing, notes: value })} />
      </div>
      <div className="sm:col-span-2">
        <button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={addPlan} type="button">料金プランを追加</button>
        <div className="mt-3 grid gap-3">{draft.pricing.plans.map((plan) => <PlanRow key={plan.id} plan={plan} onChange={(next) => setPricing({ ...draft.pricing, plans: draft.pricing.plans.map((item) => item.id === plan.id ? next : item) })} />)}</div>
      </div>
    </div>
  );
}

function PlanRow({ plan, onChange }: { plan: ProductPlan; onChange: (plan: ProductPlan) => void }) {
  return (
    <div className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className="task-input min-h-14 text-base" placeholder="プラン名" value={plan.name} onChange={(event) => onChange({ ...plan, name: event.target.value })} />
        <input className="task-input min-h-14 text-base" placeholder="初期費用" value={plan.initialFee ?? ""} onChange={(event) => onChange({ ...plan, initialFee: numberOrNull(event.target.value) })} />
        <input className="task-input min-h-14 text-base" placeholder="月額" value={plan.monthlyFee ?? ""} onChange={(event) => onChange({ ...plan, monthlyFee: numberOrNull(event.target.value) })} />
        <input className="task-input min-h-14 text-base" placeholder="単発費用" value={plan.oneTimeFee ?? ""} onChange={(event) => onChange({ ...plan, oneTimeFee: numberOrNull(event.target.value) })} />
      </div>
      <textarea className="task-input min-h-32 resize-y text-base leading-7" placeholder="プラン説明" value={plan.description ?? ""} onChange={(event) => onChange({ ...plan, description: event.target.value })} />
      <textarea className="task-input min-h-32 resize-y text-base leading-7" placeholder="含まれる内容・機能（1行ずつ）" value={toLines(plan.features)} onChange={(event) => onChange({ ...plan, features: fromLines(event.target.value) })} />
      <div className="flex flex-wrap gap-2">
        <ToggleButton active={plan.recommended} label="推奨プラン" onClick={() => onChange({ ...plan, recommended: !plan.recommended })} />
        <ToggleButton active={plan.isActive} label="表示する" onClick={() => onChange({ ...plan, isActive: !plan.isActive })} />
      </div>
    </div>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`h-10 rounded-none px-4 text-sm font-bold ${active ? "bg-[#EC6F8B] text-white" : "border border-[#F0E7E9] bg-white text-[#6F676B]"}`} onClick={onClick} type="button">{label}</button>;
}

function FeatureReadView({ product }: { product: Product }) {
  const groups = groupFeatures(product.features);
  if (groups.length === 0) return <Cards title="機能" items={[]} />;
  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={group.category}>
          <h3 className="text-lg font-bold text-[#2B2B2B]">{group.category || "見出し未設定"}</h3>
          <div className="mt-3 grid gap-2">
            {group.features.map((feature) => (
              <div className="rounded-none bg-white px-4 py-3 ring-1 ring-[#F0E7E9]" key={feature.id}>
                <p className="font-bold text-[#2B2B2B]">{feature.name || "機能名未設定"}</p>
                {feature.description ? <p className="mt-1 text-sm font-semibold leading-6 text-[#6F676B]">{feature.description}</p> : null}
                <p className="mt-2 text-xs font-bold text-[#EC6F8B]">{feature.type === "standard" ? "標準機能" : "オプション"}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FeatureEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const groups = groupFeatures(draft.features);
  const addHeading = () => {
    const category = createUniqueFeatureHeading(draft.features);
    onChange({ ...draft, features: [...draft.features, createFeature(category, draft.features.length)] });
  };
  const addFeature = (category: string) => onChange({ ...draft, features: [...draft.features, createFeature(category, draft.features.length)] });
  const updateHeading = (group: { category: string; features: ProductFeature[] }, toCategory: string) => {
    const featureIds = new Set(group.features.map((feature) => feature.id));
    onChange({ ...draft, features: draft.features.map((feature) => featureIds.has(feature.id) ? { ...feature, category: toCategory } : feature) });
  };
  const removeFeature = (id: string) => {
    onChange({ ...draft, features: draft.features.filter((feature) => feature.id !== id).map((feature, index) => ({ ...feature, sortOrder: index })) });
  };

  return (
    <div>
      <button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={addHeading} type="button">見出しを追加</button>
      <div className="mt-3 grid gap-4">
        {groups.length ? groups.map((group) => (
          <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={group.features[0]?.id ?? group.category}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input className="task-input sm:max-w-sm" placeholder="見出し" value={group.category} onChange={(event) => updateHeading(group, event.target.value)} />
              <button className="h-10 rounded-none border border-[#F0E7E9] bg-white px-4 text-sm font-bold text-[#EC6F8B]" onClick={() => addFeature(group.category)} type="button">機能を追加</button>
            </div>
            <div className="mt-3 grid gap-3">
              {group.features.map((feature) => (
                <div className="grid gap-2 rounded-none border border-[#F0E7E9] bg-white p-3" key={feature.id}>
                  <div className="grid gap-2 lg:grid-cols-[1fr_180px_auto]">
                    <input className="task-input" placeholder="機能名（小見出し）" value={feature.name} onChange={(event) => updateFeature(draft, feature.id, { name: event.target.value }, onChange)} />
                    <SingleSelect options={[{ value: "standard", label: "標準機能" }, { value: "option", label: "オプション" }]} value={feature.type} onChange={(type) => updateFeature(draft, feature.id, { type: type as ProductFeature["type"] }, onChange)} />
                    <button className="h-11 rounded-none border border-[#F0E7E9] px-3 text-sm font-bold text-[#D94F6E]" onClick={() => removeFeature(feature.id)} type="button">削除</button>
                  </div>
                  <textarea className="task-input min-h-72 resize-y text-base leading-7" placeholder="機能の説明" value={feature.description ?? ""} onChange={(event) => updateFeature(draft, feature.id, { description: event.target.value }, onChange)} />
                </div>
              ))}
            </div>
          </section>
        )) : <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-6 text-sm font-bold text-[#8A8A8A]">見出しを追加して、機能を整理できます。</p>}
      </div>
    </div>
  );
}

function ObjectionHandbookEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  const items = draft.objectionHandbook ?? [];
  const add = () => onChange({ ...draft, objectionHandbook: [...items, createObjectionItem(items.length)] });
  const remove = (id: string) => onChange({ ...draft, objectionHandbook: items.filter((item) => item.id !== id).map((item, index) => ({ ...item, sortOrder: index })) });

  return (
    <div>
      <button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={add} type="button">反論を追加</button>
      <div className="mt-3 grid gap-4">
        {items.length ? items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
          <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={item.id}>
            <div className="grid gap-3 lg:grid-cols-[180px_1fr_auto]">
              <input className="task-input" placeholder="カテゴリ（料金など）" value={item.category} onChange={(event) => updateObjectionItem(draft, item.id, { category: event.target.value }, onChange)} />
              <input className="task-input" placeholder="よくある反論" value={item.objection} onChange={(event) => updateObjectionItem(draft, item.id, { objection: event.target.value }, onChange)} />
              <button className="h-11 rounded-none border border-[#F0E7E9] bg-white px-3 text-sm font-bold text-[#D94F6E]" onClick={() => remove(item.id)} type="button">削除</button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <textarea className="task-input min-h-80 resize-y text-base leading-7" placeholder="回答例" value={item.responseExample} onChange={(event) => updateObjectionItem(draft, item.id, { responseExample: event.target.value }, onChange)} />
              <textarea className="task-input min-h-80 resize-y text-base leading-7" placeholder="伝え方" value={item.howToTell ?? ""} onChange={(event) => updateObjectionItem(draft, item.id, { howToTell: event.target.value }, onChange)} />
              <textarea className="task-input min-h-72 resize-y text-base leading-7 lg:col-span-2" placeholder="避ける表現（1行ずつ）" value={toLines(item.avoidPhrases ?? [])} onChange={(event) => updateObjectionItem(draft, item.id, { avoidPhrases: fromLines(event.target.value) }, onChange)} />
            </div>
          </section>
        )) : <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-6 text-sm font-bold text-[#8A8A8A]">料金・効果・運用負担など、よく出る反論を追加できます。</p>}
      </div>
    </div>
  );
}

function SalesSettingsEditor({ draft, onChange }: { draft: Product; onChange: (product: Product) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="想定商談時間（分）" value={String(draft.salesSettings.expectedMeetingMinutes ?? "")} onChange={(value) => onChange({ ...draft, salesSettings: { ...draft.salesSettings, expectedMeetingMinutes: numberOrNull(value) } })} />
      <Input label="想定受注期間（日）" value={String(draft.salesSettings.expectedSalesCycleDays ?? "")} onChange={(value) => onChange({ ...draft, salesSettings: { ...draft.salesSettings, expectedSalesCycleDays: numberOrNull(value) } })} />
      <Text label="営業ステージ" value={toLines(draft.salesSettings.salesStages)} onChange={(value) => onChange({ ...draft, salesSettings: { ...draft.salesSettings, salesStages: fromLines(value) } })} />
      <Text label="よくある反論カテゴリ" value={toLines(draft.salesSettings.objectionCategories)} onChange={(value) => onChange({ ...draft, salesSettings: { ...draft.salesSettings, objectionCategories: fromLines(value) } })} />
      <Text label="失注理由カテゴリ" value={toLines(draft.salesSettings.lossReasonCategories)} onChange={(value) => onChange({ ...draft, salesSettings: { ...draft.salesSettings, lossReasonCategories: fromLines(value) } })} />
      <Text label="対象外条件" value={toLines(draft.salesSettings.disqualificationConditions)} onChange={(value) => onChange({ ...draft, salesSettings: { ...draft.salesSettings, disqualificationConditions: fromLines(value) } })} />
    </div>
  );
}

function SalesPlaybookEditor({ draft, segment, onChange }: { draft: Product; segment: ProductCustomerSegment; onChange: (product: Product) => void }) {
  const playbooks = draft.salesSettings.salesPlaybooks ?? createDefaultSalesPlaybooks();
  const updateEntry = (scene: "teleapo" | "meeting", patch: Partial<ProductSalesPlaybookEntry>) => {
    const entry = playbooks[scene][segment];
    onChange({
      ...draft,
      salesSettings: {
        ...draft.salesSettings,
        salesPlaybooks: {
          ...playbooks,
          [scene]: { ...playbooks[scene], [segment]: { ...entry, ...patch } }
        }
      }
    });
  };

  return (
    <div className="space-y-8">
      {(["teleapo", "meeting"] as const).map((scene) => { const entry = playbooks[scene][segment]; return <section className="border border-[#F0E7E9] p-4" key={scene}><h3 className="mb-4 text-lg font-black text-[#2B2B2B]">{scene === "teleapo" ? "テレアポ" : "商談"}</h3><div className="grid gap-4 lg:grid-cols-2"><Text label={segment === "new" ? "どんな提案をしていくか" : "継続・追加提案の方針"} value={entry.proposalDirection} onChange={(proposalDirection) => updateEntry(scene, { proposalDirection })} /><Text label="進め方" value={entry.process} onChange={(process) => updateEntry(scene, { process })} /><Text label="確認する質問" value={toLines(entry.keyQuestions)} onChange={(value) => updateEntry(scene, { keyQuestions: fromLines(value) })} /><Text label="トーク例" value={entry.talkScript} onChange={(talkScript) => updateEntry(scene, { talkScript })} /><Text label="必要資料" value={toLines(entry.materials)} onChange={(value) => updateEntry(scene, { materials: fromLines(value) })} /><Text label="注意点" value={toLines(entry.cautions)} onChange={(value) => updateEntry(scene, { cautions: fromLines(value) })} /></div></section>; })}
    </div>
  );
}

function ResourceEditor({ draft, user, onChange }: { draft: Product; user: { id: string; name: string }; onChange: (product: Product) => void }) {
  const [progress, setProgress] = useState(0);
  const addResource = (type: ProductResource["type"]) => onChange({
    ...draft,
    resources: [
      ...draft.resources,
      {
        id: crypto.randomUUID(),
        title: type === "website" ? "公式サイト" : "新しい資料",
        type,
        url: "",
        visibility: type === "website" ? "public" : "internal",
        description: "",
        createdBy: user.id,
        createdAt: draft.updatedAt,
        updatedAt: draft.updatedAt
      }
    ]
  });
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={() => addResource("website")} type="button">サイトURLを追加</button>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]">
          <FileUp className="h-4 w-4" />
          ファイル
          <input className="hidden" type="file" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const resource = await addResourceFile(draft, file, user, setProgress); onChange({ ...draft, resources: [...draft.resources, resource] }); }} />
        </label>
        {progress > 0 ? <span className="text-sm font-bold text-[#EC6F8B]">{progress}%</span> : null}
      </div>
      <div className="mt-3 grid gap-3">
        {draft.resources.map((resource) => (
          <div className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3" key={resource.id}>
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
              <input className="task-input min-h-14 text-base" placeholder="タイトル" value={resource.title} onChange={(event) => updateResource(draft, resource.id, { title: event.target.value }, onChange)} />
              <SingleSelect options={Object.entries(resourceTypeLabels).map(([value, label]) => ({ value, label }))} value={resource.type} onChange={(type) => updateResource(draft, resource.id, { type: type as ProductResource["type"] }, onChange)} />
              <SingleSelect options={Object.entries(resourceVisibilityLabels).map(([value, label]) => ({ value, label }))} value={resource.visibility} onChange={(visibility) => updateResource(draft, resource.id, { visibility: visibility as ProductResource["visibility"] }, onChange)} />
            </div>
            <input className="task-input min-h-14 text-base" placeholder="https://..." value={resource.url ?? ""} onChange={(event) => updateResource(draft, resource.id, { url: event.target.value }, onChange)} />
            <textarea className="task-input min-h-32 resize-y text-base leading-7" placeholder="メモ・用途" value={resource.description ?? ""} onChange={(event) => updateResource(draft, resource.id, { description: event.target.value }, onChange)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateProductModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: Pick<Product, "name" | "displayName" | "categoryNames" | "productType" | "tagline" | "status">) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", productType: "own_product" as ProductType, tagline: "", status: "active" as ProductStatus });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm"><section className="w-full max-w-xl rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl"><h2 className="text-2xl font-bold text-[#2B2B2B]">新しい商材を追加</h2><div className="mt-5 grid gap-4"><Input label="商材名" value={form.name} onChange={(name) => setForm({ ...form, name })} /><SelectField label="商材種別" value={form.productType} options={Object.entries(productTypeLabels)} onChange={(value) => setForm({ ...form, productType: value as ProductType })} /><Input label="一言説明" value={form.tagline} onChange={(tagline) => setForm({ ...form, tagline })} /></div><div className="mt-6 flex justify-end gap-3"><button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button><button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={!form.name.trim()} onClick={() => void onCreate({ ...form, displayName: form.name, categoryNames: [] })} type="button">作成</button></div></section></div>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="overflow-hidden rounded-none border border-[#F0E7E9] bg-white">
      {rows.map(([label, value]) => (
        <section className="grid gap-2 border-b border-[#F0E7E9] px-4 py-3 last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)]" key={label}>
          <p className="text-sm font-bold text-[#8A8A8A]">{label}</p>
          <ReadableValue value={value} />
        </section>
      ))}
    </div>
  );
}

function ReadableValue({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "未設定") return <p className="text-sm font-bold text-[#B2AAAE]">未設定</p>;
  const parts = trimmed.includes("\n") ? trimmed.split("\n") : trimmed.split(" / ");
  const cleanParts = parts.map((part) => part.trim()).filter(Boolean);
  if (cleanParts.length > 1 && cleanParts.every((part) => part.length <= 48)) {
    return (
      <div className="flex flex-wrap gap-2">
        {cleanParts.map((part, index) => <span className="rounded-none bg-[#FFFBFC] px-3 py-1 text-xs font-bold text-[#5F575C] ring-1 ring-[#F0E7E9]" key={`${part}-${index}`}>{part}</span>)}
      </div>
    );
  }
  if (cleanParts.length > 1) {
    return (
      <ul className="grid gap-1.5">
        {cleanParts.map((part, index) => <li className="text-sm font-semibold leading-6 text-[#2B2B2B]" key={`${part}-${index}`}>・{part}</li>)}
      </ul>
    );
  }
  return <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#2B2B2B]">{trimmed}</p>;
}

function Cards({ title, items }: { title: string; items: string[] }) {
  return <div><h4 className="mb-3 font-bold text-[#2B2B2B]">{title}</h4><div className="overflow-hidden rounded-none border border-[#F0E7E9] bg-white">{items.length ? items.map((item, index) => <p className="border-b border-[#F0E7E9] px-4 py-3 text-sm font-semibold leading-6 text-[#6F676B] last:border-b-0" key={`${item}-${index}`}>{item}</p>) : <p className="px-4 py-3 text-sm font-bold text-[#8A8A8A]">未登録です。</p>}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<input className="task-input min-h-14 text-base" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<textarea className="task-input min-h-80 resize-y text-base leading-7" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <SingleSelect label={label} options={options.map(([nextValue, nextLabel]) => ({ value: nextValue, label: nextLabel }))} value={value} onChange={onChange} />;
}

function EditorList({ children, onAdd }: { children: React.ReactNode; onAdd: () => void }) {
  return <div><button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#EC6F8B]" onClick={onAdd} type="button">追加</button><div className="mt-3 grid gap-3">{children}</div></div>;
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

function createFeature(category: string, sortOrder: number): ProductFeature {
  return { id: crypto.randomUUID(), name: "新しい機能", description: "", category, planIds: [], type: "standard", isPublic: true, sortOrder };
}

function createUniqueFeatureHeading(features: ProductFeature[]): string {
  const base = "新しい見出し";
  const names = new Set(features.map((feature) => feature.category || ""));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function groupFeatures(features: ProductFeature[]): Array<{ category: string; features: ProductFeature[] }> {
  const groups = new Map<string, ProductFeature[]>();
  features
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((feature) => {
      const category = feature.category || "";
      groups.set(category, [...(groups.get(category) ?? []), feature]);
    });
  return Array.from(groups.entries()).map(([category, groupedFeatures]) => ({ category, features: groupedFeatures }));
}

function createObjectionItem(sortOrder: number): ProductObjectionItem {
  return {
    id: crypto.randomUUID(),
    category: "",
    objection: "",
    responseExample: "",
    howToTell: "",
    avoidPhrases: [],
    sortOrder
  };
}

function updateObjectionItem(product: Product, id: string, patch: Partial<ProductObjectionItem>, onChange: (product: Product) => void) {
  onChange({ ...product, objectionHandbook: (product.objectionHandbook ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) });
}

function updateResource(product: Product, id: string, patch: Partial<ProductResource>, onChange: (product: Product) => void) {
  onChange({ ...product, resources: product.resources.map((resource) => resource.id === id ? { ...resource, ...patch } : resource) });
}

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() ? parsed : null;
}
