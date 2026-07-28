"use client";

import { AlertCircle, BookOpenCheck, CheckCircle2, FileText, Package, Search, Sparkles, Target, TrendingUp } from "lucide-react";
import Image from "next/image";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingCard } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";
import { subscribeProductsMaster } from "@/lib/products";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import type { Product } from "@/types/product";
import type { TeleapoRecord } from "@/types/teleapo";

type ProductAnalysis = {
  product: Product;
  score: number;
  level: "good" | "partial" | "weak";
  missing: string[];
  strengths: string[];
  sections: Array<{ label: string; score: number; detail: string }>;
  actual: ProductActualAnalysis;
};

type ProductActualAnalysis = {
  records: TeleapoRecord[];
  analyzedCount: number;
  teleapoCount: number;
  meetingCount: number;
  averageProspectScore: number | null;
  rankCounts: Array<{ rank: string; count: number }>;
  frequentIssues: string[];
  positiveSignals: string[];
  closingRequirements: string[];
  lossRisks: string[];
  finalResults: Array<{ label: string; count: number }>;
};

export function ProductAnalysisPageClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<TeleapoRecord[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedProductId = params.get("id");

  useEffect(() => {
    return subscribeProductsMaster(
      (nextProducts) => {
        const activeProducts = nextProducts.filter((product) => product.status !== "archived");
        setProducts(activeProducts);
        setLoading(false);
      },
      () => {
        setError("商材情報を取得できませんでした。");
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    return subscribeTeleapoRecords(setRecords, () => setRecords([]));
  }, []);

  const analyses = useMemo(() => products.map((product) => analyzeProduct(product, records)).sort((a, b) => b.actual.analyzedCount - a.actual.analyzedCount || b.score - a.score), [products, records]);
  const selectedAnalysis = selectedProductId ? analyses.find((analysis) => analysis.product.id === selectedProductId) ?? null : null;
  const filteredAnalyses = analyses.filter((analysis) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return [analysis.product.name, analysis.product.summary, analysis.product.tagline].some((value) => value.toLowerCase().includes(keyword));
  });
  const averageScore = analyses.length ? Math.round(analyses.reduce((sum, analysis) => sum + analysis.score, 0) / analyses.length) : 0;
  const weakCount = analyses.filter((analysis) => analysis.level === "weak").length;

  if (isLoading) return <LoadingCard title="商材分析を読み込み中です" description="AI参照用の入力状況を確認しています..." />;

  const selectProduct = (productId: string) => {
    router.replace(`${pathname}?id=${productId}` as Route, { scroll: false });
  };

  return (
    <div className="space-y-5">
      {!selectedAnalysis ? (
        <PageHeader
          title="商材分析"
          description="AIが営業提案・反論対策・商談準備で参照しやすい状態かを確認できます"
          imageSrc="/m-dev-2.png"
        />
      ) : null}
      <StatusBanner message={error} type="error" />

      {!selectedAnalysis ? (
      <>
        <div className="grid gap-4 lg:grid-cols-3">
          <SummaryMetric title="平均AI参照スコア" value={`${averageScore}%`} icon={<Sparkles className="h-5 w-5" />} />
          <SummaryMetric title="分析対象商材" value={`${analyses.length}件`} icon={<Package className="h-5 w-5" />} />
          <SummaryMetric title="要改善" value={`${weakCount}件`} icon={<AlertCircle className="h-5 w-5" />} />
        </div>
        <section className="rounded-none border border-[#F0DEE2] bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B9ADB2]" />
            <input
              className="h-11 w-full rounded-none border border-[#F0DEE2] bg-white pl-10 pr-3 text-sm font-semibold text-[#4D464A] outline-none transition focus:border-[#EC6F8B]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="商材名で検索"
              value={query}
            />
          </div>
          <div className="mt-4 max-h-[680px] space-y-2 overflow-auto pr-1">
            {filteredAnalyses.map((analysis) => (
              <button
                className={`grid w-full grid-cols-[48px_1fr_auto] items-center gap-3 rounded-none border p-3 text-left transition ${
                  "border-[#F0DEE2] bg-white hover:bg-[#FFFBFC]"
                }`}
                key={analysis.product.id}
                onClick={() => selectProduct(analysis.product.id)}
                type="button"
              >
                <ProductIcon product={analysis.product} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[#2B2B2B]">{analysis.product.name}</span>
                  {analysis.product.tagline ? <span className="mt-1 block truncate text-xs font-semibold text-[#8A8186]">{analysis.product.tagline}</span> : null}
                </span>
                <ScoreBadge score={analysis.score} />
              </button>
            ))}
            {filteredAnalyses.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-4 py-8 text-center text-sm font-bold text-[#8A8186]">該当する商材がありません。</p> : null}
          </div>
        </section>
      </>
      ) : <AnalysisDetail analysis={selectedAnalysis} />}
    </div>
  );
}

function AnalysisDetail({ analysis }: { analysis: ProductAnalysis }) {
  const [activeTab, setActiveTab] = useState<"data" | "input">("data");
  const product = analysis.product;
  const playbook = product.salesSettings.salesPlaybooks;
  return (
    <section className="space-y-4">
      <div className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <ProductIcon large product={product} />
            <div className="min-w-0">
              <h2 className="mt-1 truncate text-2xl font-bold text-[#2B2B2B]">{product.name}</h2>
              {product.summary ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#6F676B]">{product.summary}</p> : null}
            </div>
          </div>
          <div className="min-w-[132px] rounded-none bg-[#FFF0F3] px-4 py-3 text-center">
            <p className="text-[11px] font-bold text-[#EC6F8B]">AI参照スコア</p>
            <p className="mt-0.5 text-2xl font-black text-[#EC6F8B]">{analysis.score}%</p>
            <p className="mt-0.5 text-[11px] font-bold text-[#8A8186]">{formatLevel(analysis.level)}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-none bg-[#F5E8EC]">
          <div className="h-full rounded-none bg-[#EC6F8B]" style={{ width: `${analysis.score}%` }} />
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#F0DEE2]">
        <DetailTabButton active={activeTab === "data"} label="分析データ" onClick={() => setActiveTab("data")} />
        <DetailTabButton active={activeTab === "input"} label="入力チェック" onClick={() => setActiveTab("input")} />
      </div>

      {activeTab === "data" ? (
        <div className="space-y-4">
          <ActualAnalysisSection actual={analysis.actual} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#2B2B2B]">分析サマリー</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {analysis.sections.map((section) => (
                  <div className="rounded-none bg-[#FFFBFC] p-4" key={section.label}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-[#2B2B2B]">{section.label}</p>
                      <ScoreBadge score={section.score} />
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#6F676B]">{section.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#2B2B2B]">営業プレイブック確認</h3>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <PlaybookCard title="テレアポ / 新規" entry={playbook.teleapo.new} />
                <PlaybookCard title="テレアポ / 既存" entry={playbook.teleapo.existing} />
                <PlaybookCard title="商談 / 新規" entry={playbook.meeting.new} />
                <PlaybookCard title="商談 / 既存" entry={playbook.meeting.existing} />
              </div>
            </section>

            <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#2B2B2B]">AIが参照できる内容</h3>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <MiniList title="提案価値" items={product.values} />
                <MiniList title="解決課題" items={product.problems} />
                <MiniList title="対象業種" items={product.target.industries} />
                <MiniList title="ターゲット地域" items={product.target.regions} />
                <MiniList title="導入条件" items={product.target.requiredConditions} />
                <MiniList title="対象外条件" items={product.target.disqualificationConditions} />
                <MiniList title="刺さりやすい条件" items={product.target.idealCustomerConditions} />
                <MiniList title="見込みが薄い条件" items={product.target.lowPotentialConditions} />
                <MiniList title="勝ちパターン" items={product.target.winningPatterns} />
                <MiniList title="失注パターン" items={product.target.losingPatterns} />
                <MiniList title="刺さった言葉" items={product.target.effectivePhrases} />
                <MiniList title="避ける表現" items={product.target.avoidPhrases} />
                <MiniList title="資料" items={product.resources.map((resource) => resource.title)} />
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#2B2B2B]">優先して埋めたい項目</h3>
              <div className="mt-4 space-y-2">
                {analysis.missing.map((item) => (
                  <p className="flex gap-2 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-bold text-[#6F676B]" key={item}>
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#EC6F8B]" />
                    {item}
                  </p>
                ))}
                {analysis.missing.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-3 py-8 text-center text-sm font-bold text-[#8A8186]">主要項目は揃っています。</p> : null}
              </div>
            </section>

            <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#2B2B2B]">強いところ</h3>
              <div className="mt-4 space-y-2">
                {analysis.strengths.map((item) => (
                  <p className="flex gap-2 rounded-none bg-[#F7FCF8] px-3 py-2 text-sm font-bold text-[#55765E]" key={item}>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    {item}
                  </p>
                ))}
              </div>
            </section>

            <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#2B2B2B]">反論想定</h3>
              <div className="mt-4 space-y-3">
                {product.objectionHandbook.slice(0, 5).map((item) => (
                  <div className="rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold text-[#6F676B]" key={item.id}>
                    <p className="font-bold text-[#2B2B2B]">{item.objection || item.category}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8A8186]">{item.responseExample || "回答例未設定"}</p>
                  </div>
                ))}
                {product.objectionHandbook.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-3 py-8 text-center text-sm font-bold text-[#8A8186]">反論想定が未登録です。</p> : null}
              </div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

function DetailTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-11 border-b-2 px-4 text-sm font-bold transition ${active ? "border-[#EC6F8B] text-[#EC6F8B]" : "border-transparent text-[#6F676B] hover:text-[#EC6F8B]"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ActualAnalysisSection({ actual }: { actual: ProductActualAnalysis }) {
  return (
    <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#2B2B2B]">実際の分析データ</h3>
          <p className="mt-1 text-sm font-semibold text-[#8A8186]">アップロード済みのテレアポ・商談AI分析から集計しています。</p>
        </div>
        <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]">分析済み {actual.analyzedCount}件</span>
      </div>

      {actual.records.length === 0 ? (
        <p className="mt-4 rounded-none bg-[#FFFBFC] px-4 py-8 text-center text-sm font-bold text-[#8A8186]">この商材に紐づく分析データはまだありません。</p>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <CompactMetric title="総件数" value={`${actual.records.length}件`} />
            <CompactMetric title="テレアポ" value={`${actual.teleapoCount}件`} />
            <CompactMetric title="商談" value={`${actual.meetingCount}件`} />
            <CompactMetric title="平均見込み" value={actual.averageProspectScore === null ? "未判定" : `${actual.averageProspectScore}%`} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <SimplePanel title="見込みランク分布">
              <div className="flex flex-wrap gap-2">
                {actual.rankCounts.map((item) => <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]" key={item.rank}>{item.rank} {item.count}件</span>)}
                {actual.rankCounts.length === 0 ? <EmptyTiny text="ランク判定がまだありません" /> : null}
              </div>
            </SimplePanel>
            <SimplePanel title="最終結果">
              <div className="flex flex-wrap gap-2">
                {actual.finalResults.map((item) => <span className="rounded-none bg-[#FFFBFC] px-3 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0DEE2]" key={item.label}>{item.label} {item.count}件</span>)}
                {actual.finalResults.length === 0 ? <EmptyTiny text="商談診断シートの結果がまだありません" /> : null}
              </div>
            </SimplePanel>
            <SimplePanel title="よく出る課題・関心">
              <TinyList items={actual.frequentIssues} />
            </SimplePanel>
            <SimplePanel title="刺さった点・前向きな反応">
              <TinyList items={actual.positiveSignals} />
            </SimplePanel>
            <SimplePanel title="決まりそうな条件">
              <TinyList items={actual.closingRequirements} />
            </SimplePanel>
            <SimplePanel title="失注リスク">
              <TinyList items={actual.lossRisks} />
            </SimplePanel>
          </div>
          <SimplePanel title="最近の分析">
            <div className="grid gap-2">
              {actual.records.slice(0, 5).map((record) => (
                <div className="grid gap-2 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B] md:grid-cols-[120px_1fr_auto]" key={record.id}>
                  <span className="font-bold text-[#EC6F8B]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
                  <span className="min-w-0 truncate">{record.customerName} / {record.contactName || "担当者未設定"}</span>
                  <span>{record.aiAdvice?.prospectRank ?? record.aiAdvice?.meetingPreparation?.prospectScore.rank ?? "未判定"}</span>
                </div>
              ))}
            </div>
          </SimplePanel>
        </div>
      )}
    </section>
  );
}

function SummaryMetric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[#8A8186]">{title}</p>
        <span className="grid h-10 w-10 place-items-center rounded-none bg-[#FFF0F3] text-[#EC6F8B]">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-black text-[#2B2B2B]">{value}</p>
    </div>
  );
}

function ProductIcon({ large = false, product }: { large?: boolean; product: Product }) {
  const size = large ? 72 : 48;
  if (product.iconUrl) {
    return (
      <span className={`relative block shrink-0 overflow-hidden rounded-none bg-[#FFF0F3] ${large ? "h-[72px] w-[72px]" : "h-12 w-12"}`}>
        <Image alt="" className="object-cover" fill sizes={`${size}px`} src={product.iconUrl} />
      </span>
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-none bg-[#FFF0F3] text-[#EC6F8B] ${large ? "h-[72px] w-[72px]" : "h-12 w-12"}`}>
      <Package className={large ? "h-8 w-8" : "h-5 w-5"} />
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-black text-[#EC6F8B]">{score}%</span>;
}

function PlaybookCard({ entry, title }: { entry: Product["salesSettings"]["salesPlaybooks"]["teleapo"]["new"]; title: string }) {
  const score = scoreTextFields([entry.proposalDirection, entry.process, entry.talkScript], [...entry.keyQuestions, ...entry.materials, ...entry.cautions], 6);
  return (
    <div className="rounded-none bg-[#FFFBFC] p-4">
      <div className="flex items-center justify-between">
        <p className="font-bold text-[#2B2B2B]">{title}</p>
        <ScoreBadge score={score} />
      </div>
      <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-[#6F676B]">{entry.proposalDirection || "提案方針未設定"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <SmallCheck active={entry.keyQuestions.length > 0} label="質問" />
        <SmallCheck active={entry.talkScript.trim().length > 0} label="台本" />
        <SmallCheck active={entry.materials.length > 0} label="資料" />
      </div>
    </div>
  );
}

function MiniList({ items, title }: { items: string[]; title: string }) {
  const cleanItems = items.map((item) => item.replace(/^[・\-\s]+/, "").trim()).filter(Boolean);
  return (
    <div className="rounded-none bg-[#FFFBFC] p-4">
      <p className="font-bold text-[#2B2B2B]">{title}</p>
      <ul className="mt-3 space-y-1 text-sm font-semibold leading-6 text-[#6F676B]">
        {cleanItems.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>・{item}</li>)}
        {cleanItems.length === 0 ? <li className="text-[#A79DA2]">未設定</li> : null}
      </ul>
    </div>
  );
}

function CompactMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-none bg-[#FFFBFC] p-3">
      <p className="text-xs font-bold text-[#8A8186]">{title}</p>
      <p className="mt-1 text-xl font-black text-[#2B2B2B]">{value}</p>
    </div>
  );
}

function SimplePanel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-none bg-[#FFFBFC] p-4">
      <p className="font-bold text-[#2B2B2B]">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TinyList({ items }: { items: string[] }) {
  if (items.length === 0) return <EmptyTiny text="まだ十分な分析データがありません" />;
  return (
    <ul className="space-y-1 text-sm font-semibold leading-6 text-[#6F676B]">
      {items.map((item, index) => <li key={`${item}-${index}`}>・{item}</li>)}
    </ul>
  );
}

function EmptyTiny({ text }: { text: string }) {
  return <p className="text-sm font-bold text-[#A79DA2]">{text}</p>;
}

function SmallCheck({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`rounded-none px-2.5 py-1 text-xs font-bold ${active ? "bg-[#F7FCF8] text-[#55765E]" : "bg-[#F5F1F2] text-[#9A8F94]"}`}>
      {label}
    </span>
  );
}

function EmptyAnalysis() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-none border border-[#F0DEE2] bg-white p-8 text-center shadow-sm">
      <div>
        <BookOpenCheck className="mx-auto h-10 w-10 text-[#EC6F8B]" />
        <h3 className="mt-4 text-xl font-bold text-[#2B2B2B]">商材がまだありません</h3>
        <p className="mt-2 text-sm font-semibold text-[#8A8186]">商材管理で商材を追加すると、AI参照状態を確認できます。</p>
      </div>
    </section>
  );
}

function analyzeProduct(product: Product, records: TeleapoRecord[]): ProductAnalysis {
  const sections = [
    {
      label: "基本情報",
      score: scoreTextFields([product.summary, product.tagline], [...product.values, ...product.problems], 6),
      detail: "概要、価値、解決課題が入っているほどAIが提案文を作りやすくなります。"
    },
    {
      label: "ターゲット",
      score: scoreTextFields([], [...product.target.industries, ...product.target.regions, ...product.target.roles, ...product.target.requiredConditions, ...product.target.disqualificationConditions, ...product.target.idealCustomerConditions, ...product.target.lowPotentialConditions], 12),
      detail: "対象業種、役職、導入条件、対象外条件があると見込み判定が安定します。"
    },
    {
      label: "料金・契約",
      score: scorePricing(product),
      detail: "料金、契約期間、支払い条件があると商談後の見積・反論対応に使えます。"
    },
    {
      label: "機能",
      score: Math.min(100, product.features.length * 18),
      detail: "機能と小見出しが増えるほど、提案優先順位を具体化できます。"
    },
    {
      label: "反論想定",
      score: Math.min(100, product.objectionHandbook.length * 20),
      detail: "料金・効果・運用負担などの回答例がAIの切り返しに反映されます。"
    },
    {
      label: "資料・デモ",
      score: Math.min(100, product.resources.length * 16),
      detail: "提案資料、料金表、事例、デモURLがあると商談準備に出せます。"
    },
    {
      label: "営業プレイブック",
      score: scorePlaybooks(product),
      detail: "テレアポ/商談、新規/既存の方針があると、案件別アドバイスがぶれにくくなります。"
    },
    {
      label: "勝ち・失注パターン",
      score: scoreTextFields([], [...product.target.winningPatterns, ...product.target.losingPatterns, ...product.target.effectivePhrases, ...product.target.avoidPhrases, ...product.target.industryProposalAngles.map((item) => item.proposalAngle)], 10),
      detail: "契約・失注につながる共通点や言い回しがあると、商材分析から案件へ提案方針を返せます。"
    }
  ];
  const score = Math.round(sections.reduce((sum, section) => sum + section.score, 0) / sections.length);
  const missing = buildMissingItems(product, sections);
  const strengths = sections.filter((section) => section.score >= 70).map((section) => `${section.label}が比較的揃っています`);
  return {
    product,
    score,
    level: score >= 75 ? "good" : score >= 45 ? "partial" : "weak",
    missing,
    strengths: strengths.length ? strengths : ["まず基本情報を整えるとAI分析に使いやすくなります"],
    sections,
    actual: analyzeActualProductData(product, records)
  };
}

function analyzeActualProductData(product: Product, records: TeleapoRecord[]): ProductActualAnalysis {
  const productRecords = records
    .filter((record) => record.productId === product.id || (!!record.productName && record.productName === product.name))
    .sort((a, b) => b.recordedAt.toMillis() - a.recordedAt.toMillis());
  const analyzedRecords = productRecords.filter((record) => record.aiAdviceStatus === "completed" && record.aiAdvice);
  const scores = analyzedRecords
    .map((record) => record.aiAdvice?.prospectScore ?? record.aiAdvice?.meetingPreparation?.prospectScore.score ?? null)
    .filter((score): score is number => typeof score === "number");
  const ranks = analyzedRecords
    .map((record) => record.aiAdvice?.prospectRank ?? record.aiAdvice?.meetingPreparation?.prospectScore.rank ?? "")
    .filter(Boolean);
  const finalResults = productRecords.map((record) => finalResultLabel(record.diagnosisSheet?.finalResult)).filter(Boolean);
  return {
    records: productRecords,
    analyzedCount: analyzedRecords.length,
    teleapoCount: productRecords.filter((record) => record.salesDomain === "teleapo").length,
    meetingCount: productRecords.filter((record) => record.salesDomain === "meeting").length,
    averageProspectScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    rankCounts: countValues(ranks),
    frequentIssues: topItems(analyzedRecords.flatMap((record) => [
      ...(record.aiAdvice?.customerIssues ?? []),
      ...(record.aiAdvice?.meetingPreparation?.issues.explicit.map((item) => item.title) ?? []),
      ...(record.aiAdvice?.meetingPreparation?.issues.essential.map((item) => item.title) ?? []),
      record.diagnosisSheet?.biggestIssue,
      record.diagnosisSheet?.trueCustomerIssue
    ])),
    positiveSignals: topItems(analyzedRecords.flatMap((record) => [
      ...(record.aiAdvice?.positiveCustomerSignals ?? []),
      ...(record.aiAdvice?.meetingPreparation?.prospectScore.positiveSignals.map((item) => item.text) ?? []),
      ...(record.aiAdvice?.meetingPreparation?.winningPoints ?? []),
      record.diagnosisSheet?.resonatedPoint,
      record.diagnosisSheet?.effectiveProposal
    ])),
    closingRequirements: topItems(analyzedRecords.flatMap((record) => [
      ...(record.aiAdvice?.closingRequirements ?? []),
      ...(record.aiAdvice?.meetingPreparation?.preparation.mustDecideByEnd ?? []),
      record.diagnosisSheet?.nextProposal,
      record.diagnosisSheet?.nextAction
    ])),
    lossRisks: topItems(analyzedRecords.flatMap((record) => [
      ...(record.aiAdvice?.lostRisks ?? []),
      ...(record.aiAdvice?.meetingPreparation?.riskPoints.map((item) => item.title) ?? []),
      record.diagnosisSheet?.concerns,
      record.diagnosisSheet?.lossReason,
      record.diagnosisSheet?.ineffectiveProposal
    ])),
    finalResults: countValues(finalResults)
  };
}

function countValues(values: string[]): Array<{ label: string; rank: string; count: number }> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).map(([label, count]) => ({ label, rank: label, count })).sort((a, b) => b.count - a.count);
}

function topItems(values: Array<string | undefined | null>, limit = 5): string[] {
  const cleaned = values
    .map((value) => (value ?? "").replace(/^[・\-\s]+/, "").trim())
    .filter((value) => value.length > 0 && value !== "未確認" && value !== "未設定");
  return countValues(cleaned).slice(0, limit).map((item) => item.label);
}

function finalResultLabel(value?: string): string {
  if (value === "contracted") return "契約";
  if (value === "considering") return "継続検討";
  if (value === "lost") return "失注";
  if (value === "not_target") return "対象外";
  return "";
}

function scoreTextFields(texts: string[], arrays: string[], targetCount: number): number {
  const textScore = texts.filter((text) => text.trim().length >= 12).length * 20;
  const arrayScore = Math.min(60, Math.round((arrays.filter(Boolean).length / targetCount) * 60));
  return Math.min(100, textScore + arrayScore);
}

function scorePricing(product: Product): number {
  let score = 0;
  if (product.pricing.initialFee || product.pricing.monthlyFee || product.pricing.minimumFee || product.pricing.maximumFee) score += 30;
  if (product.pricing.plans.length > 0) score += 30;
  if (product.pricing.paymentTerms?.trim()) score += 15;
  if (product.pricing.minimumContractMonths) score += 15;
  if (product.pricing.notes?.trim()) score += 10;
  return Math.min(100, score);
}

function scorePlaybooks(product: Product): number {
  const entries = [
    product.salesSettings.salesPlaybooks.teleapo.new,
    product.salesSettings.salesPlaybooks.teleapo.existing,
    product.salesSettings.salesPlaybooks.meeting.new,
    product.salesSettings.salesPlaybooks.meeting.existing
  ];
  const total = entries.reduce((sum, entry) => sum + scoreTextFields([entry.proposalDirection, entry.process, entry.talkScript], [...entry.keyQuestions, ...entry.materials, ...entry.cautions], 6), 0);
  return Math.round(total / entries.length);
}

function buildMissingItems(product: Product, sections: ProductAnalysis["sections"]): string[] {
  const missing: string[] = [];
  if (!product.summary.trim()) missing.push("商材概要");
  if (product.values.length === 0) missing.push("提供価値");
  if (product.problems.length === 0) missing.push("解決する課題");
  if (product.target.requiredConditions.length === 0) missing.push("導入条件");
  if (product.target.disqualificationConditions.length === 0) missing.push("対象外条件");
  if (product.target.idealCustomerConditions.length === 0) missing.push("刺さりやすい顧客条件");
  if (product.target.lowPotentialConditions.length === 0) missing.push("見込みが薄い条件");
  if (product.target.winningPatterns.length === 0) missing.push("勝ちパターン");
  if (product.target.losingPatterns.length === 0) missing.push("失注パターン");
  if (product.objectionHandbook.length === 0) missing.push("反論想定");
  if (product.resources.length === 0) missing.push("提案資料・デモ");
  sections.filter((section) => section.score < 35).forEach((section) => missing.push(`${section.label}の入力補強`));
  return Array.from(new Set(missing)).slice(0, 8);
}

function formatLevel(level: ProductAnalysis["level"]): string {
  if (level === "good") return "AI参照しやすい";
  if (level === "partial") return "一部補強したい";
  return "入力補強が必要";
}
