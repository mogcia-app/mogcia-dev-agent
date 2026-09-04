"use client";

import { BarChart3, CalendarDays, CheckCircle2, Clock3, Copy, FileText, GitCompareArrows, Mic2, MoreVertical, Plus, Search, Share2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { EmptyState, StatusBanner } from "@/components/ui/status";
import { splitConversationLogsIntoBlocks } from "@/lib/conversation-blocks";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { deleteTeleapoRecord, subscribeProducts, subscribeTeleapoRecords, subscribeTeleapoRecord, updateTeleapoRecord } from "@/lib/teleapo";
import { SpeakerWorkspace } from "@/components/sales/SalesUploadWorkspace";
import type { ConversationLog, MeetingPreparationAnalysis, ProductKnowledge, SalesDomain, TeleapoRecord } from "@/types/teleapo";

const adminUid = "TjDadmBAdVYaPEvG3ppfBLS4HGN2";

type FilterMode = "all" | SalesDomain;
type AnalysisTab = "before" | "after" | "compare" | "transcript" | "history";
type DealGroup = {
  id: string;
  companyId: string | null;
  companyName: string;
  productId: string | null;
  productName: string;
  contactName: string;
  contactRole: string;
  industry: string;
  ownerName: string;
  records: TeleapoRecord[];
  latestRecord: TeleapoRecord;
  firstRecord: TeleapoRecord;
  latestAdviceRecord: TeleapoRecord | null;
  teleapoAdviceRecord: TeleapoRecord | null;
  currentRank: string;
  currentScore: number | null;
  previousScore: number | null;
};

export function SalesAnalysisListPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get("recordId");
  const dealId = searchParams.get("dealId");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("before");
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<TeleapoRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TeleapoRecord | null>(null);
  const [products, setProducts] = useState<ProductKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isGeneratingAdvice, setGeneratingAdvice] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    return subscribeProducts(setProducts, () => setProducts([]));
  }, []);

  useEffect(() => {
    if (!recordId) return undefined;
    return subscribeTeleapoRecord(recordId, setSelectedRecord, (nextError) => setError(nextError.message));
  }, [recordId]);

  useEffect(() => {
    if (recordId) return undefined;
    return subscribeTeleapoRecords(
      (nextRecords) => {
        setRecords(nextRecords);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
  }, [recordId]);

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records
      .filter((record) => record.transcriptionStatus === "completed" || record.aiAdviceStatus === "completed")
      .filter((record) => !user || user.uid === adminUid || record.userId === user.uid)
      .filter((record) => filter === "all" || record.salesDomain === filter)
      .filter((record) => {
        if (!needle) return true;
        return [record.customerName, record.contactName, record.productName, record.meetingTitle, record.transcriptText].join(" ").toLowerCase().includes(needle);
      });
  }, [filter, query, records, user]);
  const dealGroups = useMemo(() => buildDealGroups(visibleRecords), [visibleRecords]);
  const selectedDeal = dealId ? dealGroups.find((deal) => deal.id === dealId || decodeDealId(deal.id) === dealId) ?? null : null;

  if (recordId && selectedRecord) {
    return (
      <SpeakerWorkspace
        key={`${selectedRecord.id}-${selectedRecord.updatedAt.toMillis()}`}
        compactReview
        error={error}
        isGeneratingAdvice={isGeneratingAdvice}
        isProcessing={false}
        message={message}
        onGenerateAdvice={async () => {
          if (!user) return;
          setGeneratingAdvice(true);
          setError("");
          try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/teleapo/${selectedRecord.id}/advice`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error("分析結果の作成に失敗しました。");
            setMessage("分析結果を作成しました。");
            router.replace(`/sales/analysis?dealId=${createDealId(selectedRecord)}` as Route);
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "分析結果の作成に失敗しました。");
          } finally {
            setGeneratingAdvice(false);
          }
        }}
        onSaveLogs={async (logs: ConversationLog[]) => {
          if (!user) return false;
          try {
            await updateTeleapoRecord(selectedRecord.id, { conversationLogs: sanitizeConversationLogs(logs), conversationLogsLocked: true, transcriptionStatus: "completed" });
            const token = await user.getIdToken();
            const response = await fetch(`/api/teleapo/${selectedRecord.id}/advice`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error("分析結果の作成に失敗しました。");
            setMessage("分析済み一覧に反映しました。");
            router.replace(`/sales/analysis?dealId=${createDealId(selectedRecord)}` as Route);
            return true;
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "分析済み一覧への反映に失敗しました。");
            return false;
          }
        }}
        onStartProcessing={async () => undefined}
        product={products.find((product) => product.id === selectedRecord.productId) ?? null}
        record={selectedRecord}
      />
    );
  }

  if (selectedDeal) {
    return <DealAnalysisWorkspace deal={selectedDeal} user={user} />;
  }

  return (
    <div className="">
      <PageHeader title="案件分析" description="会社・商材ごとに、テレアポから商談後までの分析履歴を確認できます。" />
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-3 text-sm font-medium text-[#777]">
          <Search className="h-4 w-4 text-[#EC6F8B]" />
          <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="会社名・担当者・商材で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="flex rounded-none border border-[#F0DEE2] bg-white p-1">
          <FilterButton active={filter === "all"} label="すべて" onClick={() => setFilter("all")} />
          <FilterButton active={filter === "teleapo"} label="テレアポ" onClick={() => setFilter("teleapo")} />
          <FilterButton active={filter === "meeting"} label="商談" onClick={() => setFilter("meeting")} />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <StatusBanner message={message} type="success" />
        <StatusBanner message={error} type="error" />
      </div>
      <section className="mt-5 rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
        {loading ? <SkeletonList count={6} media /> : null}
        {!loading && dealGroups.length === 0 ? <EmptyState title="分析済みの案件がありません" description="アップロード後に話者分離を保存すると、ここに表示されます。" /> : null}
        <div className="grid gap-3">
          {dealGroups.map((deal) => (
            <DealCard
              deal={deal}
              isDeleting={deletingDealId === deal.id}
              key={deal.id}
              onDelete={async () => {
                if (!window.confirm(`${deal.companyName} の分析データ ${deal.records.length}件を削除します。よろしいですか？`)) return;
                setDeletingDealId(deal.id);
                setError("");
                try {
                  await Promise.all(deal.records.map((record) => deleteTeleapoRecord(record.id)));
                  setMessage("分析データを削除しました。");
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "分析データの削除に失敗しました。");
                } finally {
                  setDeletingDealId(null);
                }
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DealAnalysisWorkspace({ deal, user }: { deal: DealGroup; user: User | null }) {
  const latest = deal.latestAdviceRecord ?? deal.latestRecord;
  const advice = latest.aiAdvice;
  const preparation = advice?.meetingPreparation;
  const scoreDelta = deal.currentScore !== null && deal.previousScore !== null ? deal.currentScore - deal.previousScore : null;
  const [isRegenerating, setRegenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const missing = uniqueStrings([
    ...(advice?.missingInformation ?? []),
    ...(preparation?.prospectScore.missingInformation ?? [])
  ]);
  const customerProblems = uniqueStrings([
    ...(advice?.customerIssues ?? []),
    ...(preparation?.issues.explicit.map((item) => item.title) ?? []),
    ...(preparation?.issues.essential.map((item) => item.title) ?? [])
  ]);
  const positiveSignals = uniqueStrings([
    ...(advice?.positiveCustomerSignals ?? []),
    ...(preparation?.prospectScore.positiveSignals.map((item) => item.text) ?? [])
  ]);
  const concerns = uniqueStrings([
    ...(advice?.concerns ?? []),
    ...(advice?.hesitationSignals ?? []),
    ...(preparation?.prospectScore.negativeSignals.map((item) => item.text) ?? [])
  ]);
  const risks = uniqueStrings([
    ...(advice?.lostRisks ?? []),
    ...(preparation?.riskPoints.map((item) => `${item.title}：${item.reason}`) ?? [])
  ]);
  const proposals = uniqueStrings([
    ...(preparation?.proposalStrategy.proposalPriority.map((item) => item.title) ?? []),
    ...(preparation?.proposalStrategy.winningApproach ?? []),
    ...(advice?.closingRequirements ?? [])
  ]);
  const questions = uniqueStrings([
    ...(advice?.nextMeetingQuestions ?? []),
    ...(advice?.meetingQuestions ?? []),
    ...(preparation?.questions.required.map((item) => item.question) ?? []),
    ...(preparation?.questions.decision.map((item) => item.question) ?? [])
  ]);
  const nextAction = advice?.nextActions?.[0] || preparation?.nextActions?.[0]?.title || advice?.followUpReason || "次回アクションを確認してください";
  const currentState = advice?.summary || advice?.rankReason || preparation?.prospectScore.reason || "分析結果を再生成すると、案件の現在地が表示されます。";
  const transcriptCount = latest.conversationLogs.length || (latest.transcriptText?.trim() ? 1 : 0);

  const regenerate = async () => {
    if (!user) return;
    setRegenerating(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/teleapo/${latest.id}/advice`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("AI再分析に失敗しました。");
      setNotice("最新の分析へ更新しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI再分析に失敗しました。");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="border-b border-[#E9E2E4] bg-white pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link className="text-sm font-medium text-[#8A8186] hover:text-[#EC6F8B]" href="/sales/analysis">← 商談分析</Link>
            <h1 className="mt-1 truncate text-base font-semibold text-[#2B2B2B]">{deal.companyName}</h1>
            <p className="mt-1 text-sm font-medium text-[#8A8186]">{deal.productName || "商材未設定"} / {deal.contactName || "担当者未設定"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {deal.companyId ? <Link className="inline-flex h-10 items-center px-3 text-sm font-medium text-[#6F676B] hover:text-[#EC6F8B]" href={`/sales/companies?companyId=${deal.companyId}` as Route}>Company</Link> : null}
            {deal.productId ? <Link className="inline-flex h-10 items-center px-3 text-sm font-medium text-[#6F676B] hover:text-[#EC6F8B]" href={`/products?productId=${deal.productId}` as Route}>Product</Link> : null}
            <button className="inline-flex h-10 items-center gap-2 border border-[#E9E2E4] bg-white px-4 text-sm font-medium text-[#6F676B] disabled:opacity-50" disabled={isRegenerating} onClick={() => void regenerate()} type="button"><Sparkles className="h-4 w-4" />{isRegenerating ? "再分析中" : "AI再分析"}</button>
            <button className="inline-flex h-10 items-center gap-2 border border-[#E9E2E4] bg-white px-4 text-sm font-medium text-[#6F676B]" onClick={() => window.print()} type="button"><FileText className="h-4 w-4" />PDF</button>
          </div>
        </div>
        {notice ? <p className="mt-4 text-sm font-medium text-[#EC6F8B]">{notice}</p> : null}
        <dl className="mt-6 grid gap-x-8 gap-y-3 border-y border-[#EFE8EA] py-4 sm:grid-cols-3 lg:grid-cols-4">
          <StrategyFact label="見込み" value={`${deal.currentRank}${deal.currentScore !== null ? ` / ${deal.currentScore}` : ""}`} />
          <StrategyFact label="前回比" value={scoreDelta === null ? "—" : `${scoreDelta > 0 ? "+" : ""}${scoreDelta}`} />
          <StrategyFact label="フェーズ" value={phaseLabel(latest)} />
          <StrategyFact label="担当営業" value={deal.ownerName} />
        </dl>
      </section>

      <StrategySection eyebrow="最重要" title="AIの判断" accent>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div><StrategyLabel>現在</StrategyLabel><p className="text-base font-medium leading-8 text-[#302A2D]">{currentState}</p></div>
          <div><StrategyLabel>次にやること</StrategyLabel><p className="text-base font-semibold text-[#EC6F8B]">{nextAction}</p><p className="mt-2 text-sm font-semibold text-[#776D72]">{formatUrgency(advice?.nextActionUrgency) || advice?.followupTiming || "時期を確認"}</p></div>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <StrategyList title="確認すること" items={missing.slice(0, 6)} />
          <StrategyList title="刺さっている内容" items={positiveSignals.length ? positiveSignals.slice(0, 6) : proposals.slice(0, 6)} />
          <StrategyList title="失注リスク" items={risks.slice(0, 5)} />
        </div>
      </StrategySection>

      <StrategySection title="顧客理解">
        <div className="grid gap-7 md:grid-cols-2">
          <StrategyList title="課題" items={customerProblems} />
          <StrategyList title="ニーズ・関心" items={positiveSignals} />
          <StrategyList title="現在の運用・状況" items={uniqueStrings([latest.meetingMemo ?? "", latest.memo ?? "", ...(advice?.closeReasons ?? [])])} />
          <div><StrategyLabel>決裁構造</StrategyLabel><p className="text-sm font-semibold leading-7 text-[#5F565A]">{findDecisionContext(advice, preparation) || "まだ確認できていないことに含めています。"}</p></div>
        </div>
      </StrategySection>

      <StrategySection title="次回営業">
        <div className="grid gap-7 md:grid-cols-2">
          <div><StrategyLabel>推奨アクション</StrategyLabel><p className="text-base font-semibold text-[#302A2D]">{nextAction}</p><p className="mt-2 text-sm font-semibold leading-7 text-[#776D72]">{advice?.followUpReason || advice?.followupTimingReason || "次回接触で未確認事項を解消し、次の合意を作ります。"}</p></div>
          <StrategyList title="聞くこと" items={questions.slice(0, 8)} />
          <StrategyList title="次回提案" items={proposals.slice(0, 8)} />
          <div className="flex flex-wrap content-start gap-2"><Link className="inline-flex h-10 items-center border border-[#E9E2E4] px-4 text-sm font-medium text-[#6F676B]" href="/tasks">タスク作成を依頼</Link><Link className="inline-flex h-10 items-center border border-[#E9E2E4] px-4 text-sm font-medium text-[#6F676B]" href="/calendar">予定追加を依頼</Link></div>
        </div>
        {(advice?.followupCallScript || preparation) ? <details className="mt-6 border-t border-[#EFE8EA] pt-4"><summary className="cursor-pointer text-sm font-semibold text-[#554C50]">トーク案を開く</summary><div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-[#5F565A]"><p>{advice?.followupCallScript || preparation?.openingTalk}</p>{preparation ? <ScriptPreview analysis={preparation} /> : null}</div></details> : null}
      </StrategySection>

      {(concerns.length || missing.length || risks.length) ? <StrategySection title="リスク・まだ確認できていないこと"><div className="grid gap-7 md:grid-cols-3"><StrategyList title="懸念" items={concerns} /><StrategyList title="未確認" items={missing} /><StrategyList title="失注リスク" items={risks} /></div></StrategySection> : null}

      {deal.records.length > 1 ? <StrategySection title="前回からの変化"><ComparisonTable base={deal.firstRecord} target={deal.latestRecord} detailed /><p className="mt-5 text-sm font-semibold leading-7 text-[#5F565A]">{buildComparisonSummary(deal.firstRecord, deal.latestRecord)}</p></StrategySection> : null}

      <details className="border-t border-[#E9E2E4] bg-white py-5"><summary className="cursor-pointer text-base font-semibold text-[#302A2D]">文字起こし</summary><div className="mt-5 space-y-5">{latest.audioDownloadUrl ? <audio className="w-full" controls src={latest.audioDownloadUrl} /> : null}<p className="text-sm font-semibold text-[#776D72]">{formatDate(latest.recordedAt.toDate())} ・ {transcriptCount ? `${transcriptCount}ブロック` : "文字起こしなし"}</p><TranscriptTab deal={deal} /></div></details>
      <details className="border-t border-[#E9E2E4] bg-white py-5"><summary className="cursor-pointer text-base font-semibold text-[#302A2D]">履歴</summary><div className="mt-5"><HistoryTab deal={deal} /></div></details>
    </div>
  );
}

function StrategySection({ accent = false, children, eyebrow, title }: { accent?: boolean; children: React.ReactNode; eyebrow?: string; title: string }) {
  return <section className={`border border-[#E9E2E4] p-6 ${accent ? "bg-[#FFF8FA]" : "bg-white"}`}>{eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#EC6F8B]">{eyebrow}</p> : null}<h2 className="mt-1 text-base font-semibold text-[#302A2D]">{title}</h2><div className="mt-6">{children}</div></section>;
}

function StrategyLabel({ children }: { children: React.ReactNode }) { return <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#968B90]">{children}</h3>; }
function StrategyFact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-[#968B90]">{label}</dt><dd className="mt-1 text-sm font-semibold text-[#302A2D]">{value || "—"}</dd></div>; }
function StrategyList({ items, title }: { items: string[]; title: string }) { const visible = uniqueStrings(items); return <div><StrategyLabel>{title}</StrategyLabel>{visible.length ? <ul className="space-y-2">{visible.map((item) => <li className="flex gap-2 text-sm font-semibold leading-6 text-[#5F565A]" key={item}><span className="text-[#EC6F8B]">•</span><span>{item}</span></li>)}</ul> : <p className="text-sm font-semibold text-[#A0969A]">該当情報なし</p>}</div>; }
function uniqueStrings(items: Array<string | null | undefined>): string[] { return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item) && item !== "未確認"))); }
function findDecisionContext(advice: TeleapoRecord["aiAdvice"], preparation: MeetingPreparationAnalysis | undefined): string { return uniqueStrings([...(advice?.closingRequirements ?? []), ...(preparation?.questions.decision.map((item) => item.purpose) ?? [])]).at(0) ?? ""; }

function DealOverviewTab({ deal }: { deal: DealGroup }) {
  const latestAnalysis = deal.teleapoAdviceRecord?.aiAdvice?.meetingPreparation ?? deal.latestAdviceRecord?.aiAdvice?.meetingPreparation;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(250px,0.8fr)_minmax(420px,1.5fr)_minmax(320px,1fr)]">
      <div className="space-y-4">
        <Panel title="見込み度の推移">
          <ScoreTimeline records={deal.records} />
        </Panel>
        <Panel title="担当者分析">
          <InfoRows rows={[
            ["タイプ", latestAnalysis?.contactAnalysis.type.join(" / ")],
            ["意思決定", latestAnalysis?.contactAnalysis.decisionStyle],
            ["数字への関心", latestAnalysis?.contactAnalysis.numericalInterest],
            ["警戒度", latestAnalysis?.contactAnalysis.salesResistance],
            ["推奨話法", latestAnalysis?.contactAnalysis.communicationRecommendations.join(" / ")],
            ["避ける話し方", latestAnalysis?.contactAnalysis.avoid.join(" / ")],
            ["信頼度", latestAnalysis ? `${Math.round(latestAnalysis.contactAnalysis.confidence * 100)}%` : undefined]
          ]} />
        </Panel>
        <Panel title="現在の主な課題">
          <IssueCompact analysis={latestAnalysis} />
        </Panel>
        <Panel title="決裁・予算情報">
          <InfoRows rows={[["決裁者", "未確認"], ["決裁者接触", "未確認"], ["予算", "未確認"], ["導入時期", formatUrgency(latestAnalysis?.prospectScore.nextMeetingTiming)], ["競合", "未確認"], ["稟議条件", "未確認"]]} />
        </Panel>
      </div>
      <Panel title="案件タイムライン">
        <DealTimeline records={deal.records} />
      </Panel>
      <div className="space-y-4">
        <Panel title="次にやること">
          <TaskPreview record={deal.latestAdviceRecord ?? deal.latestRecord} />
        </Panel>
        <Panel title="次回商談のゴール">
          <BulletList items={latestAnalysis?.preparation.objectives.slice(0, 5) ?? []} empty="未確認" />
        </Panel>
      </div>
    </div>
  );
}

function BeforeMeetingTab({ deal }: { deal: DealGroup }) {
  const teleapoRecord = deal.teleapoAdviceRecord;
  const analysis = teleapoRecord?.aiAdvice?.meetingPreparation;
  const advice = teleapoRecord?.aiAdvice;
  if (!teleapoRecord || !advice) return <EmptyState title="商談前分析がありません" description="テレアポのAI分析が完了すると、商談前の準備内容が表示されます。" />;
  if (!analysis) return <LegacyBeforeMeetingTab record={teleapoRecord} />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="反映元">
        <InfoRows rows={[
          ["分析元", recordLabel(teleapoRecord)],
          ["電話日時", formatDate(teleapoRecord.recordedAt.toDate())],
          ["会社名", teleapoRecord.customerName],
          ["先方担当者", teleapoRecord.contactName]
        ]} />
      </Panel>
      <Panel title="今回の勝ち筋"><BulletList items={analysis.proposalStrategy.winningApproach.slice(0, 5)} empty="未確認" /></Panel>
      <Panel title="確認すべき未確認事項"><BulletList items={analysis.prospectScore.missingInformation} empty="未確認" /></Panel>
      <Panel title="日程調整トークスクリプト"><ScheduleTalkPreview analysis={analysis} /></Panel>
      <Panel title="提案優先順位"><ProposalPreview analysis={analysis} /></Panel>
      <Panel title="必要資料"><MaterialPreview analysis={analysis} /></Panel>
      <Panel title="質問リスト"><QuestionPreview analysis={analysis} /></Panel>
      <Panel title="30分商談スクリプト"><ScriptPreview analysis={analysis} /></Panel>
      <Panel title="反論対策"><ObjectionPreview analysis={analysis} /></Panel>
      <Panel title="クロージング"><InfoRows rows={[["温度感高め", analysis.closingTalk.high], ["温度感普通", analysis.closingTalk.middle], ["温度感低め", analysis.closingTalk.low]]} /></Panel>
    </div>
  );
}

function LegacyBeforeMeetingTab({ record }: { record: TeleapoRecord }) {
  const advice = record.aiAdvice;
  if (!advice) return <EmptyState title="商談前分析がありません" description="テレアポのAI分析が完了すると、商談前の準備内容が表示されます。" />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="反映元">
        <InfoRows rows={[
          ["分析元", recordLabel(record)],
          ["電話日時", formatDate(record.recordedAt.toDate())],
          ["会社名", record.customerName],
          ["先方担当者", record.contactName]
        ]} />
      </Panel>
      <Panel title="見込み診断">
        <InfoRows rows={[
          ["ランク", advice.prospectRank],
          ["スコア", String(advice.prospectScore)],
          ["温度感", formatTemperature(advice.temperature)],
          ["追うタイミング", formatUrgency(advice.nextActionUrgency)],
          ["温度感の根拠", advice.temperatureReason ?? advice.scoreReason],
          ["判定理由", advice.rankReason]
        ]} />
      </Panel>
      <Panel title="テレアポ要約">
        <p className="text-sm font-semibold leading-7 text-[#6F676B]">{advice.summary || "未確認"}</p>
      </Panel>
      <Panel title="課題・懸念">
        <BulletList items={[...advice.customerIssues, ...advice.concerns]} empty="未確認" />
      </Panel>
      <Panel title="打ち合わせで注意すること">
        <BulletList items={advice.meetingWarnings} empty="未確認" />
      </Panel>
      <Panel title="必ず確認する質問">
        <BulletList items={[...advice.meetingQuestions, ...(advice.nextMeetingQuestions ?? [])]} empty="未確認" />
      </Panel>
      <Panel title="日程調整電話">
        <BulletList items={[...advice.scheduleCallScript.candidates.map(formatScheduleCandidate), advice.scheduleCallScript.script]} empty="未確認" />
      </Panel>
      <Panel title="必要資料">
        <BulletList items={[...advice.materials, ...(advice.requiredMaterials ?? []), ...(advice.additionalMaterials ?? [])]} empty="未確認" />
      </Panel>
      <Panel title="当日打ち合わせの流れ">
        <BulletList items={[
          ...advice.meetingScript.greeting,
          ...advice.meetingScript.hearing,
          ...advice.meetingScript.issue整理,
          ...advice.meetingScript.proposal,
          ...advice.meetingScript.qa,
          ...advice.meetingScript.nextAction
        ]} empty="未確認" />
      </Panel>
      <Panel title="次にやること">
        <BulletList items={advice.nextActions} empty="未確認" />
      </Panel>
    </div>
  );
}

function AfterMeetingTab({ deal }: { deal: DealGroup }) {
  const meetingRecords = deal.records.filter((record) => record.salesDomain === "meeting");
  const latestMeeting = meetingRecords.at(-1);
  if (!latestMeeting) return <EmptyState title="商談後データがありません" description="商談後アップロードを追加すると、振り返りを表示できます。" />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="商談後の見込み診断"><InfoRows rows={[["最新ランク", latestMeeting.aiAdvice?.prospectRank], ["最新スコア", latestMeeting.aiAdvice?.prospectScore?.toString()], ["フォロー判断", latestMeeting.aiAdvice?.shouldFollowUp ? "フォローアップする" : "追わない"], ["フォロー時期", formatUrgency(latestMeeting.aiAdvice?.nextActionUrgency) || formatUrgency(latestMeeting.aiAdvice?.followupTiming)], ["判定理由", latestMeeting.aiAdvice?.rankReason], ["フォロー理由", latestMeeting.aiAdvice?.followUpReason]]} /></Panel>
      <Panel title="次の追客方針"><InfoRows rows={[["方法", formatFollowUpMethod(latestMeeting.aiAdvice?.followUpMethod)], ["いつ追うか", formatUrgency(latestMeeting.aiAdvice?.nextActionUrgency) || formatUrgency(latestMeeting.aiAdvice?.followupTiming)], ["理由", latestMeeting.aiAdvice?.followupTimingReason], ["次回推奨", latestMeeting.aiAdvice?.followUpReason]]} /></Panel>
      <Panel title="商談要約"><BulletList items={[latestMeeting.aiAdvice?.summary].filter(Boolean) as string[]} empty="未確認" /></Panel>
      <Panel title="良かった点"><BulletList items={latestMeeting.aiAdvice?.positives ?? []} empty="未確認" /></Panel>
      <Panel title="ダメだった点・弱かった点"><BulletList items={latestMeeting.aiAdvice?.negatives ?? []} empty="未確認" /></Panel>
      <Panel title="顧客が前向きだった発言"><BulletList items={latestMeeting.aiAdvice?.positiveCustomerSignals ?? []} empty="未確認" /></Panel>
      <Panel title="顧客が迷っていた発言"><BulletList items={latestMeeting.aiAdvice?.hesitationSignals ?? []} empty="未確認" /></Panel>
      <Panel title="決まりそうな条件"><BulletList items={latestMeeting.aiAdvice?.closingRequirements ?? []} empty="未確認" /></Panel>
      <Panel title="足りない情報"><BulletList items={latestMeeting.aiAdvice?.missingInformation ?? []} empty="未確認" /></Panel>
      <Panel title="失注リスク"><BulletList items={latestMeeting.aiAdvice?.lostRisks ?? []} empty="未確認" /></Panel>
      <Panel title="追っかけ方針"><InfoRows rows={[
        ["フォローする理由", latestMeeting.aiAdvice?.followUpReason],
        ["いつするか", formatUrgency(latestMeeting.aiAdvice?.nextActionUrgency) || formatUrgency(latestMeeting.aiAdvice?.followupTiming)],
        ["タイミングの理由", latestMeeting.aiAdvice?.followupTimingReason],
        ["方法", formatFollowUpMethod(latestMeeting.aiAdvice?.followUpMethod)],
        ["電話で伝えること", latestMeeting.aiAdvice?.followupCallScript],
        ["メール文面", latestMeeting.aiAdvice?.followupEmail]
      ]} /></Panel>
    </div>
  );
}

function CompareTab({ deal }: { deal: DealGroup }) {
  return (
    <div className="space-y-4">
      <Panel title="比較対象">
        <div className="grid gap-3 md:grid-cols-2">
          <select className="task-input" defaultValue={deal.firstRecord.id}>{deal.records.map((record) => <option key={record.id} value={record.id}>{recordLabel(record)}</option>)}</select>
          <select className="task-input" defaultValue={deal.latestRecord.id}>{deal.records.map((record) => <option key={record.id} value={record.id}>{recordLabel(record)}</option>)}</select>
        </div>
      </Panel>
      <Panel title="比較・振り返り">
        <ComparisonTable base={deal.firstRecord} target={deal.latestRecord} detailed />
      </Panel>
      <Panel title="AI総合分析">
        <p className="text-sm font-semibold leading-7 text-[#6F676B]">{buildComparisonSummary(deal.firstRecord, deal.latestRecord)}</p>
      </Panel>
      <Panel title="営業仮説の精度">
        <div className="grid gap-3 md:grid-cols-3">
          <MiniBox title="合っていた仮説" items={deal.latestRecord.aiAdvice?.closeReasons ?? []} />
          <MiniBox title="外れていた仮説" items={deal.latestRecord.aiAdvice?.gapFromTeleapo ?? []} />
          <MiniBox title="改善すべき聞き方" items={deal.latestRecord.aiAdvice?.meetingQuestions ?? []} />
        </div>
      </Panel>
    </div>
  );
}

function HistoryTab({ deal }: { deal: DealGroup }) {
  return (
    <Panel title="履歴">
      <div className="mb-4 flex flex-wrap gap-2">{["すべて", "音声", "商談", "AI分析", "タスク", "メール", "メモ"].map((label) => <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-medium text-[#EC6F8B]" key={label}>{label}</span>)}</div>
      <DealTimeline records={deal.records} />
    </Panel>
  );
}

function TranscriptTab({ deal }: { deal: DealGroup }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const records = [...deal.records].sort((a, b) => b.recordedAt.toMillis() - a.recordedAt.toMillis());
  const allText = records.map(formatRecordTranscript).filter(Boolean).join("\n\n---\n\n");

  const copyText = async (id: string, text: string) => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
  };

  if (!records.some((record) => record.conversationLogs.length > 0 || record.transcriptText?.trim())) {
    return <EmptyState title="文字起こしがありません" description="音声アップロード後に話者分離を保存すると、ここに文字起こし内容が表示されます。" />;
  }

  return (
    <div className="space-y-4">
      <Panel title="文字起こし">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#8A8186]">{records.length}件のアップロード内容を表示しています。</p>
          <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-sm font-medium text-[#6F676B] disabled:opacity-50" disabled={!allText.trim()} onClick={() => void copyText("all", allText)} type="button">
            <Copy className="h-4 w-4" />
            {copiedId === "all" ? "コピー済み" : "すべてコピー"}
          </button>
        </div>
        <div className="space-y-4">
          {records.map((record) => {
            const text = formatRecordTranscript(record);
            return (
              <article className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#2B2B2B]">{recordLabel(record)}</p>
                    <p className="mt-1 text-xs font-medium text-[#9A8F94]">{record.conversationLogs.length ? `${record.conversationLogs.length}ブロック` : "全文テキスト"}</p>
                  </div>
                  <button className="inline-flex h-9 items-center gap-2 rounded-none bg-white px-3 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9] disabled:opacity-50" disabled={!text.trim()} onClick={() => void copyText(record.id, text)} type="button">
                    <Copy className="h-3.5 w-3.5" />
                    {copiedId === record.id ? "コピー済み" : "コピー"}
                  </button>
                </div>
                <div className="mt-4 max-h-[520px] overflow-auto rounded-none bg-white p-4 text-sm font-semibold leading-7 text-[#4F474B] ring-1 ring-[#F0E7E9]">
                  {record.conversationLogs.length ? (
                    <div className="space-y-3">
                      {record.conversationLogs.map((log) => (
                        <p className="whitespace-pre-wrap" key={log.id}>
                          <span className="font-semibold text-[#EC6F8B]">{conversationSpeakerLabels[log.speaker]}: </span>
                          {log.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{record.transcriptText || "文字起こしは未登録です。"}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

const conversationSpeakerLabels: Record<ConversationLog["speaker"], string> = {
  sales: "営業",
  customer: "顧客",
  participant: "参加者",
  unknown: "不明"
};

function formatRecordTranscript(record: TeleapoRecord): string {
  const header = `${recordLabel(record)} / ${record.customerName || "会社名未設定"} / ${record.productName || "商材未設定"}`;
  const body = record.conversationLogs.length
    ? record.conversationLogs.map((log) => `${conversationSpeakerLabels[log.speaker]}: ${log.text}`).join("\n")
    : record.transcriptText?.trim() ?? "";
  return [header, body].filter(Boolean).join("\n");
}

function sanitizeConversationLogs(logs: ConversationLog[]): ConversationLog[] {
  return splitConversationLogsIntoBlocks(logs)
    .map((log, index) => ({
      id: log.id || `log-${index + 1}`,
      speaker: log.speaker,
      text: log.text.trim(),
      startSec: typeof log.startSec === "number" ? log.startSec : null,
      endSec: typeof log.endSec === "number" ? log.endSec : null
    }))
    .filter((log) => log.text.length > 0);
}

function buildDealGroups(records: TeleapoRecord[]): DealGroup[] {
  const groups = new Map<string, TeleapoRecord[]>();
  records.forEach((record) => {
    const id = createDealId(record);
    groups.set(id, [...(groups.get(id) ?? []), record]);
  });
  return Array.from(groups.entries())
    .map(([id, groupRecords]) => {
      const sortedRecords = [...groupRecords].sort((a, b) => a.recordedAt.toMillis() - b.recordedAt.toMillis());
      const latestRecord = sortedRecords[sortedRecords.length - 1];
      const firstRecord = sortedRecords[0];
      const adviceRecords = sortedRecords.filter((record) => record.aiAdviceStatus === "completed" && record.aiAdvice);
      const latestAdviceRecord = adviceRecords[adviceRecords.length - 1] ?? null;
      const teleapoAdviceRecords = adviceRecords.filter((record) => record.salesDomain === "teleapo" && record.aiAdvice);
      const teleapoAdviceRecord = teleapoAdviceRecords[teleapoAdviceRecords.length - 1] ?? null;
      const currentScore = latestAdviceRecord?.aiAdvice?.prospectScore ?? latestAdviceRecord?.aiAdvice?.meetingPreparation?.prospectScore.score ?? null;
      const previousAdviceRecord = adviceRecords.length >= 2 ? adviceRecords[adviceRecords.length - 2] : null;
      const previousScore = previousAdviceRecord?.aiAdvice?.prospectScore ?? previousAdviceRecord?.aiAdvice?.meetingPreparation?.prospectScore.score ?? null;
      const currentRank = latestAdviceRecord?.aiAdvice?.prospectRank ?? latestAdviceRecord?.aiAdvice?.meetingPreparation?.prospectScore.rank ?? "未確認";
      return {
        id,
        companyId: latestRecord.companyId ?? null,
        companyName: latestRecord.customerName || "会社名未設定",
        productId: latestRecord.productId ?? null,
        productName: latestRecord.productName || "商材未設定",
        contactName: latestRecord.contactName || firstRecord.contactName || "未確認",
        contactRole: latestRecord.role || firstRecord.role || "未確認",
        industry: latestRecord.industry || firstRecord.industry || "未確認",
        ownerName: latestRecord.userName || firstRecord.userName || "未確認",
        records: sortedRecords,
        latestRecord,
        firstRecord,
        latestAdviceRecord,
        teleapoAdviceRecord,
        currentRank,
        currentScore,
        previousScore
      };
    })
    .sort((a, b) => b.latestRecord.recordedAt.toMillis() - a.latestRecord.recordedAt.toMillis());
}

function createDealId(record: TeleapoRecord): string {
  return [record.companyId || record.customerName || "unknown-company", record.productId || record.productName || "unknown-product"].map(encodeURIComponent).join("__");
}

function decodeDealId(value: string): string {
  try {
    return value.split("__").map(decodeURIComponent).join("__");
  } catch {
    return value;
  }
}

function DealCard({ deal, isDeleting, onDelete }: { deal: DealGroup; isDeleting: boolean; onDelete: () => Promise<void> }) {
  const scoreDelta = deal.currentScore !== null && deal.previousScore !== null ? deal.currentScore - deal.previousScore : null;
  return (
    <article className="relative grid cursor-pointer gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFF0F3] lg:grid-cols-[1fr_auto]">
      <Link aria-label={`${deal.companyName}の案件分析を開く`} className="absolute inset-0 z-10" href={`/sales/analysis?dealId=${deal.id}` as Route} />
      <div className="pointer-events-none min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-none bg-white px-2.5 py-1 text-xs font-medium text-[#EC6F8B] ring-1 ring-[#F0E7E9]">案件</span>
          <span className="inline-flex items-center gap-1 rounded-none bg-[#EC6F8B] px-2.5 py-1 text-xs font-medium text-white">
            <Sparkles className="h-3.5 w-3.5" />
            {deal.currentRank}{deal.currentScore !== null ? ` / ${deal.currentScore}` : ""}
          </span>
          {scoreDelta !== null ? <span className="rounded-none bg-white px-2.5 py-1 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9]">前回比 {scoreDelta > 0 ? "+" : ""}{scoreDelta}</span> : null}
        </div>
        <h3 className="mt-3 truncate text-base font-medium text-[#2B2B2B]">{deal.companyName}</h3>
        <p className="mt-1 text-sm font-semibold text-[#777]">{deal.productName} / {deal.contactName}</p>
        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{deal.latestAdviceRecord?.aiAdvice?.summary || deal.latestRecord.transcriptText || "案件の接触履歴と分析を確認できます。"}</p>
      </div>
      <div className="grid content-between gap-3 text-sm font-medium text-[#8A8186] lg:min-w-28 lg:text-right">
        <button
          className="relative z-20 inline-flex h-9 items-center justify-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-3 text-xs font-medium text-[#B65F6F] transition hover:bg-[#FFF0F3] disabled:opacity-50"
          disabled={isDeleting}
          onClick={() => void onDelete()}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isDeleting ? "削除中" : "削除"}
        </button>
      </div>
    </article>
  );
}

function DealFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-none bg-[#FFFBFC] p-4"><p className="flex items-center gap-2 text-xs font-medium text-[#9A8F94]">{icon}{label}</p><p className="mt-2 text-base font-semibold text-[#2B2B2B]">{value || "未確認"}</p></div>;
}

function SmallDealInfo({ label, value }: { label: string; value?: string | null }) {
  return <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-medium text-[#6F676B]"><span className="mr-2 text-[#9A8F94]">{label}</span>{value || "未確認"}</p>;
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm"><h3 className="mb-4 text-base font-medium text-[#2B2B2B]">{title}</h3>{children}</section>;
}

function InfoRows({ rows }: { rows: Array<[string, string | undefined | null]> }) {
  return <div className="space-y-2 text-sm font-semibold text-[#6F676B]">{rows.map(([label, value]) => <p className="rounded-none bg-[#FFFBFC] px-3 py-2" key={label}><span className="mr-3 text-[#9A8F94]">{label}</span>{value || "未確認"}</p>)}</div>;
}

function BulletList({ empty, items }: { empty: string; items: string[] }) {
  const visible = items.filter(Boolean);
  return <ul className="space-y-2 text-sm font-semibold leading-6 text-[#6F676B]">{visible.map((item) => <li className="rounded-none bg-[#FFFBFC] px-3 py-2" key={item}>・{item}</li>)}{visible.length === 0 ? <li className="rounded-none bg-[#FFFBFC] px-3 py-6 text-center text-[#9A8F94]">{empty}</li> : null}</ul>;
}

function ScoreTimeline({ records }: { records: TeleapoRecord[] }) {
  return (
    <div className="space-y-3">
      {records.map((record) => (
        <Link className="grid grid-cols-[1fr_auto] gap-3 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-medium text-[#6F676B]" href={`/sales/analysis?dealId=${createDealId(record)}` as Route} key={record.id}>
          <span>{recordKindLabel(record)}後</span>
          <span className="text-[#EC6F8B]">{record.aiAdvice?.prospectRank ?? record.aiAdvice?.meetingPreparation?.prospectScore.rank ?? "未確認"} / {record.aiAdvice?.prospectScore ?? record.aiAdvice?.meetingPreparation?.prospectScore.score ?? "-"}</span>
        </Link>
      ))}
    </div>
  );
}

function DealTimeline({ records }: { records: TeleapoRecord[] }) {
  return (
    <div className="space-y-4">
      {records.map((record) => (
        <article className="relative border-l border-[#F3C4CE] pl-5" key={record.id}>
          <span className="absolute -left-2 top-1 grid h-4 w-4 place-items-center rounded-none bg-[#EC6F8B]" />
          <div className="rounded-none bg-[#FFFBFC] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-[#2B2B2B]">{recordKindLabel(record)}</p>
              <p className="text-xs font-medium text-[#9A8F94]">{formatDate(record.recordedAt.toDate())}</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#6F676B]">参加者: {[record.contactName, ...(record.attendeeNames ?? [])].filter(Boolean).join(" / ") || "未確認"}</p>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{record.aiAdvice?.summary || record.transcriptText || "要約未作成"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-none bg-white px-2.5 py-1 text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{record.aiAdvice?.prospectRank ?? "未確認"} / {record.aiAdvice?.prospectScore ?? "-"}</span>
              <Link className="rounded-none bg-white px-2.5 py-1 text-[#6F676B] ring-1 ring-[#F0E7E9]" href={`/sales/analysis?dealId=${createDealId(record)}` as Route}>分析結果を開く</Link>
              <Link className="rounded-none bg-white px-2.5 py-1 text-[#6F676B] ring-1 ring-[#F0E7E9]" href={`/sales/analysis?recordId=${record.id}#conversation-log` as Route}>文字起こし</Link>
            </div>
            {record.audioDownloadUrl ? <audio className="mt-3 w-full" controls src={record.audioDownloadUrl} /> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function IssueCompact({ analysis }: { analysis?: MeetingPreparationAnalysis }) {
  if (!analysis) return <BulletList items={[]} empty="未確認" />;
  return <div className="grid gap-2">{[["表面的", analysis.issues.explicit], ["本質的", analysis.issues.essential], ["潜在", analysis.issues.latent]].map(([label, items]) => <div className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={String(label)}><span className="mr-2 font-medium text-[#EC6F8B]">{String(label)}</span>{Array.isArray(items) && items.length ? items.slice(0, 2).map((item) => item.title).join(" / ") : "未確認"}</div>)}</div>;
}

function ComparisonTable({ base, detailed = false, target }: { base: TeleapoRecord; detailed?: boolean; target: TeleapoRecord }) {
  const rows = [
    ["主な課題", base.aiAdvice?.customerIssues?.join(" / "), target.aiAdvice?.customerIssues?.join(" / ")],
    ["温度感", base.aiAdvice?.temperature ? formatTemperature(base.aiAdvice.temperature) : undefined, target.aiAdvice?.temperature ? formatTemperature(target.aiAdvice.temperature) : undefined],
    ["見込みスコア", base.aiAdvice?.prospectScore?.toString(), target.aiAdvice?.prospectScore?.toString()],
    ["刺さる提案", base.aiAdvice?.meetingPreparation?.proposalStrategy.mainTheme, target.aiAdvice?.meetingPreparation?.proposalStrategy.mainTheme],
    ["決裁者", "未確認", "未確認"],
    ["予算", "未確認", "未確認"],
    ["導入時期", formatUrgency(base.aiAdvice?.meetingPreparation?.prospectScore.nextMeetingTiming), formatUrgency(target.aiAdvice?.meetingPreparation?.prospectScore.nextMeetingTiming)],
    ["懸念", base.aiAdvice?.concerns?.join(" / "), target.aiAdvice?.concerns?.join(" / ")],
    ["次回アクション", base.aiAdvice?.nextActions?.join(" / "), target.aiAdvice?.nextActions?.join(" / ")]
  ];
  const visibleRows = detailed ? rows : rows.slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm font-semibold text-[#6F676B]">
        <thead><tr className="border-b border-[#F0DEE2] text-xs text-[#9A8F94]"><th className="py-2">比較項目</th><th className="py-2">テレアポ時の予測</th><th className="py-2">商談後に判明</th><th className="py-2">差分</th></tr></thead>
        <tbody>{visibleRows.map(([label, before, after]) => <tr className="border-b border-[#F8EEF1]" key={label}><td className="py-3 font-medium text-[#2B2B2B]">{label}</td><td className="py-3">{before || "未確認"}</td><td className="py-3">{after || "未確認"}</td><td className="py-3"><DiffBadge before={before} after={after} /></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function DiffBadge({ after, before }: { after?: string; before?: string }) {
  let label = "未確認のまま";
  if (before && after && before === after) label = "一致";
  if (before && after && before !== after) label = "仮説違い";
  if (!before && after) label = "新たに判明";
  return <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-medium text-[#EC6F8B]">{label}</span>;
}

function TaskPreview({ record }: { record: TeleapoRecord }) {
  const tasks = record.aiAdvice?.meetingPreparation?.nextActions ?? [];
  return <div className="space-y-2">{tasks.slice(0, 5).map((task) => <label className="grid grid-cols-[18px_1fr] gap-2 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={task.title}><input className="mt-1 accent-[#EC6F8B]" type="checkbox" /><span><span className="block font-medium text-[#2B2B2B]">{task.title}</span><span className="text-xs text-[#9A8F94]">{task.dueDate || "期限未確認"} / {task.completionCondition}</span></span></label>)}{tasks.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-3 py-6 text-center text-sm font-medium text-[#9A8F94]">未確認</p> : null}</div>;
}

function ProposalPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const items = analysis?.proposalStrategy.proposalPriority ?? [];
  return <div className="space-y-2">{items.map((item, index) => <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={item.title}>{index + 1}位 {item.title} / 適合度 {item.score} / {item.reason}</p>)}{items.length === 0 ? <EmptyPreview /> : null}</div>;
}

function ScheduleTalkPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  return (
    <div className="space-y-3">
      <InfoRows rows={[
        ["冒頭", analysis.schedulingCall.opening],
        ["前回のお礼", analysis.schedulingCall.previousCallReference],
        ["目的確認", analysis.schedulingCall.purposeConfirmation],
        ["候補日提示", analysis.schedulingCall.dateProposalScript],
        ["所要時間", analysis.schedulingCall.durationGuide],
        ["参加者確認", analysis.schedulingCall.participantConfirmation],
        ["形式確認", analysis.schedulingCall.meetingFormatConfirmation],
        ["締め", analysis.schedulingCall.closing]
      ]} />
      <div>
        <p className="mb-2 text-sm font-medium text-[#8A8186]">質問への返答</p>
        {analysis.schedulingCall.questionResponses.length ? (
          <div className="space-y-2">
            {analysis.schedulingCall.questionResponses.slice(0, 4).map((item) => (
              <div className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={item.condition}>
                <p className="font-medium text-[#2B2B2B]">{item.condition}</p>
                <p className="mt-1">{item.response}</p>
                <p className="mt-1 text-xs text-[#9A8F94]">次: {item.nextAction || "未確認"}</p>
              </div>
            ))}
          </div>
        ) : <EmptyPreview />}
      </div>
    </div>
  );
}

function MaterialPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const items = [...(analysis?.preparation.requiredMaterials ?? []), ...(analysis?.proposalStrategy.recommendedMaterials ?? [])];
  return <div className="space-y-2">{items.map((item) => <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={`${item.name}-${item.timing}`}>{item.name} / {item.timing} / {item.purpose}</p>)}{items.length === 0 ? <EmptyPreview /> : null}</div>;
}

function QuestionPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const questions = [...(analysis?.questions.required ?? []), ...(analysis?.questions.deepDive ?? [])];
  return <div className="space-y-2">{questions.slice(0, 8).map((item) => <label className="grid grid-cols-[18px_1fr] gap-2 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={item.question}><input className="mt-1 accent-[#EC6F8B]" type="checkbox" /><span>{item.question}<span className="mt-1 block text-xs text-[#9A8F94]">{item.purpose}</span></span></label>)}{questions.length === 0 ? <EmptyPreview /> : null}</div>;
}

function ScriptPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const scripts = analysis?.meetingScript;
  if (!scripts) return null;
  const orderedSections = [
    ["opening", scripts.opening],
    ["hearing", scripts.hearing],
    ["issueSummary", scripts.issueSummary],
    ["proposal", scripts.proposal],
    ["demo", scripts.demo],
    ["pricing", scripts.pricing],
    ["closing", scripts.closing]
  ] as const;
  return <div className="space-y-2">{orderedSections.map(([key, section]) => <div className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={key}><span className="font-medium text-[#2B2B2B]">{section.minutes} {section.objective}</span><p className="mt-1 line-clamp-2">{section.script.join(" ") || "未確認"}</p></div>)}</div>;
}

function ObjectionPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const items = analysis?.objections.slice(0, 6) ?? [];
  return <div className="space-y-2">{items.map((item) => <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={item.objection}><span className="font-medium text-[#2B2B2B]">{item.objection}</span><span className="mt-1 block text-xs text-[#9A8F94]">{item.recommendedResponse}</span></p>)}{items.length === 0 ? <EmptyPreview /> : null}</div>;
}

function EmptyPreview() {
  return <p className="rounded-none bg-[#FFFBFC] px-3 py-6 text-center text-sm font-medium text-[#9A8F94]">未確認</p>;
}

function MiniBox({ items, title }: { items: string[]; title: string }) {
  return <div className="rounded-none bg-[#FFFBFC] p-3"><p className="font-medium text-[#2B2B2B]">{title}</p><BulletList items={items.slice(0, 4)} empty="未確認" /></div>;
}

function recordKindLabel(record: TeleapoRecord): string {
  if (record.salesDomain === "teleapo") return "テレアポ";
  return record.meetingTitle || "商談";
}

function recordLabel(record: TeleapoRecord): string {
  return `${recordKindLabel(record)} / ${formatDate(record.recordedAt.toDate())}`;
}

function phaseLabel(record: TeleapoRecord): string {
  if (record.salesDomain === "teleapo") return "商談前";
  if (record.aiAdvice?.prospectRank === "A") return "契約前";
  return "商談後";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { dateStyle: "medium" });
}

function formatTemperature(temperature?: string): string {
  if (temperature === "high") return "高め";
  if (temperature === "middle") return "普通";
  if (temperature === "low") return "低め";
  return "未確認";
}

function formatUrgency(urgency?: string): string {
  if (urgency === "today") return "当日中";
  if (urgency === "next_business_day") return "翌営業日";
  if (urgency === "within_3_days") return "3営業日以内";
  if (urgency === "next_week") return "1週間以内";
  if (urgency === "long_term") return "長期フォロー";
  if (urgency === "none") return "追わない";
  if (!urgency) return "未確認";
  return urgency;
}

function formatFollowUpMethod(method?: string): string {
  if (method === "phone") return "電話";
  if (method === "email") return "メール";
  if (method === "chat") return "チャット";
  if (method === "meeting") return "次回商談";
  if (method === "none") return "追わない";
  return "未確認";
}

function formatScheduleCandidate(candidate: { label: string; datetime: string; reason: string }): string {
  const parsed = new Date(candidate.datetime);
  const dateText = Number.isNaN(parsed.getTime())
    ? candidate.datetime
    : parsed.toLocaleDateString("ja-JP", { dateStyle: "medium" });
  return `${candidate.label}: ${dateText}${candidate.reason ? `（${candidate.reason}）` : ""}`;
}

function buildComparisonSummary(base: TeleapoRecord, target: TeleapoRecord): string {
  const beforeIssue = base.aiAdvice?.customerIssues?.[0] || "未確認";
  const afterIssue = target.aiAdvice?.customerIssues?.[0] || "未確認";
  if (beforeIssue === afterIssue) return `初回時点の主要課題「${beforeIssue}」は、最新接触でも大きく変わっていません。次回は未確認事項を減らし、決裁・予算・導入時期を確認してください。`;
  return `初回時点では「${beforeIssue}」が主な課題でしたが、最新接触では「${afterIssue}」がより重要に見えます。次回は古い仮説に寄せすぎず、最新の課題に合わせて提案方針を調整してください。`;
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`h-9 rounded-none px-4 text-sm font-medium ${active ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function AnalysisRecordCard({ record }: { record: TeleapoRecord }) {
  const date = record.recordedAt.toDate().toLocaleDateString("ja-JP", { dateStyle: "medium" });
  const hasAdvice = record.aiAdviceStatus === "completed" && Boolean(record.aiAdvice);
  const summary = record.aiAdvice?.summary || record.transcriptText || "分析内容を確認できます。";

  return (
    <Link className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFF0F3] lg:grid-cols-[1fr_auto]" href={`/sales/analysis?dealId=${createDealId(record)}` as Route}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-none bg-white px-2.5 py-1 text-xs font-medium text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
          <span className={`inline-flex items-center gap-1 rounded-none px-2.5 py-1 text-xs font-medium ${hasAdvice ? "bg-[#EC6F8B] text-white" : "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]"}`}>
            {hasAdvice ? <Sparkles className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {hasAdvice ? "AI分析済み" : "話者分離済み"}
          </span>
        </div>
        <h3 className="mt-3 truncate text-base font-medium text-[#2B2B2B]">{record.customerName}</h3>
        <p className="mt-1 text-sm font-semibold text-[#777]">{record.productName || "商材未設定"} / {record.contactName || "担当者未設定"}</p>
        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{summary}</p>
      </div>
      <div className="grid content-between gap-3 text-sm font-medium text-[#8A8186] lg:min-w-48 lg:text-right">
        <span className="inline-flex items-center gap-2 lg:justify-end"><CalendarDays className="h-4 w-4 text-[#EC6F8B]" />{date}</span>
        <span className="inline-flex items-center gap-2 lg:justify-end"><FileText className="h-4 w-4 text-[#EC6F8B]" />{record.conversationLogs.length}ブロック</span>
      </div>
    </Link>
  );
}
