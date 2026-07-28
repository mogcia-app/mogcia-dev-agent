"use client";

import { BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, GitCompareArrows, Mic2, MoreVertical, Plus, Search, Share2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
type AnalysisTab = "before" | "after" | "compare" | "history";
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
  const selectedDeal = dealGroups.find((deal) => deal.id === dealId) ?? null;

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
            if (!response.ok) throw new Error("AIアドバイス生成に失敗しました。");
            setMessage("AIアドバイスを生成しました。");
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "AIアドバイス生成に失敗しました。");
          } finally {
            setGeneratingAdvice(false);
          }
        }}
        onSaveLogs={async (logs: ConversationLog[]) => {
          try {
            await updateTeleapoRecord(selectedRecord.id, { conversationLogs: sanitizeConversationLogs(logs), conversationLogsLocked: true, transcriptionStatus: "completed" });
            setMessage("話者ラベルを保存しました。");
            return true;
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "話者ラベルの保存に失敗しました。");
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
    return <DealAnalysisWorkspace activeTab={activeTab} deal={selectedDeal} onTabChange={setActiveTab} />;
  }

  return (
    <div className="">
      <PageHeader title="案件分析" description="会社・商材ごとに、テレアポから商談後までの分析履歴を確認できます。" />
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-3 text-sm font-bold text-[#777]">
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
        {!loading && dealGroups.length === 0 ? <EmptyState title="分析済みの案件がありません" description="アップロード後に話者分離またはAIアドバイスまで進めると、ここに表示されます。" /> : null}
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

function DealAnalysisWorkspace({ activeTab, deal, onTabChange }: { activeTab: AnalysisTab; deal: DealGroup; onTabChange: (tab: AnalysisTab) => void }) {
  const latest = deal.latestAdviceRecord ?? deal.latestRecord;
  const scoreDelta = deal.currentScore !== null && deal.previousScore !== null ? deal.currentScore - deal.previousScore : null;
  const tabs: Array<[AnalysisTab, string]> = [["before", "商談前"], ["after", "商談後"], ["compare", "比較・振り返り"], ["history", "履歴"]];
  return (
    <div className="space-y-4">
      <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#EC6F8B]">案件分析</p>
            <h1 className="mt-1 truncate text-2xl font-black text-[#2B2B2B]">{deal.companyName}</h1>
            <p className="mt-1 text-sm font-bold text-[#8A8186]">{deal.productName || "商材未設定"} / {deal.contactName || "担当者未設定"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" href={`/sales/upload?companyId=${deal.companyId ?? ""}&productId=${deal.productId ?? ""}` as Route}>
              <Plus className="h-4 w-4" />
              音声・商談を追加
            </Link>
            <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-sm font-bold text-[#6F676B]" type="button"><Sparkles className="h-4 w-4" />AI再分析</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-sm font-bold text-[#6F676B]" type="button"><FileText className="h-4 w-4" />PDF出力</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-sm font-bold text-[#6F676B]" type="button"><Share2 className="h-4 w-4" />共有</button>
            <button className="grid h-10 w-10 place-items-center rounded-none border border-[#F0DEE2] bg-white text-[#6F676B]" type="button" aria-label="その他"><MoreVertical className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <DealFact icon={<BarChart3 className="h-4 w-4" />} label="現在の見込み" value={`${deal.currentRank}${deal.currentScore !== null ? ` / ${deal.currentScore}` : ""}`} />
          <DealFact icon={<GitCompareArrows className="h-4 w-4" />} label="前回からの変化" value={scoreDelta === null ? "未確認" : `${scoreDelta > 0 ? "+" : ""}${scoreDelta}`} />
          <DealFact icon={<Clock3 className="h-4 w-4" />} label="最終接触日" value={formatDate(deal.latestRecord.recordedAt.toDate())} />
          <DealFact icon={<Mic2 className="h-4 w-4" />} label="音声・商談件数" value={`${deal.records.length}件`} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SmallDealInfo label="業種" value={deal.industry} />
            <SmallDealInfo label="担当者役職" value={deal.contactRole} />
            <SmallDealInfo label="商談フェーズ" value={phaseLabel(latest)} />
            <SmallDealInfo label="担当営業" value={deal.ownerName} />
          </div>
          {latest.audioDownloadUrl ? <audio className="w-full" controls src={latest.audioDownloadUrl} /> : <p className="rounded-none bg-[#FFFBFC] px-4 py-3 text-sm font-bold text-[#8A8186]">最新音声は未登録です。</p>}
        </div>
      </section>

      <div className="flex overflow-x-auto rounded-none border border-[#F0DEE2] bg-white p-1 shadow-sm">
        {tabs.map(([tab, label]) => (
          <button className={`h-10 shrink-0 rounded-none px-4 text-sm font-bold ${activeTab === tab ? "bg-[#EC6F8B] text-white" : "text-[#6F676B] hover:bg-[#FFFBFC]"}`} key={tab} onClick={() => onTabChange(tab)} type="button">
            {label}
          </button>
        ))}
      </div>

      {activeTab === "before" ? <BeforeMeetingTab deal={deal} /> : null}
      {activeTab === "after" ? <AfterMeetingTab deal={deal} /> : null}
      {activeTab === "compare" ? <CompareTab deal={deal} /> : null}
      {activeTab === "history" ? <HistoryTab deal={deal} /> : null}
    </div>
  );
}

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
          <InfoRows rows={[["決裁者", "未確認"], ["決裁者接触", "未確認"], ["予算", "未確認"], ["導入時期", latestAnalysis?.prospectScore.nextMeetingTiming], ["競合", "未確認"], ["稟議条件", "未確認"]]} />
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
      <Panel title="商談要約"><BulletList items={[latestMeeting.aiAdvice?.summary, latestMeeting.meetingMemo, latestMeeting.transcriptText?.slice(0, 240)].filter(Boolean) as string[]} empty="未確認" /></Panel>
      <Panel title="新たに判明した事実"><BulletList items={latestMeeting.aiAdvice?.missingInformation ?? []} empty="未確認" /></Panel>
      <Panel title="興味を示した内容"><BulletList items={latestMeeting.aiAdvice?.positiveCustomerSignals ?? []} empty="未確認" /></Panel>
      <Panel title="営業パフォーマンス分析"><InfoRows rows={[["発言比率", "推定"], ["質問数", "推定"], ["深掘り質問数", "推定"], ["決裁者確認", "未確認"], ["予算確認", "未確認"], ["クロージング", latestMeeting.aiAdvice?.shouldFollowUp ? "実施推奨" : "未確認"]]} /></Panel>
      <Panel title="良かった点"><BulletList items={latestMeeting.aiAdvice?.positives ?? []} empty="未確認" /></Panel>
      <Panel title="改善点"><BulletList items={latestMeeting.aiAdvice?.negatives ?? []} empty="未確認" /></Panel>
      <Panel title="商談後の見込み診断"><InfoRows rows={[["最新ランク", latestMeeting.aiAdvice?.prospectRank], ["最新スコア", latestMeeting.aiAdvice?.prospectScore?.toString()], ["フォロー時期", formatUrgency(latestMeeting.aiAdvice?.nextActionUrgency) || formatUrgency(latestMeeting.aiAdvice?.followupTiming)], ["上昇理由", latestMeeting.aiAdvice?.rankReason], ["受注阻害要因", latestMeeting.aiAdvice?.lostRisks?.join(" / ")], ["次回推奨", latestMeeting.aiAdvice?.followUpReason]]} /></Panel>
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
      <div className="mb-4 flex flex-wrap gap-2">{["すべて", "音声", "商談", "AI分析", "タスク", "メール", "メモ"].map((label) => <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]" key={label}>{label}</span>)}</div>
      <DealTimeline records={deal.records} />
    </Panel>
  );
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

function DealCard({ deal, isDeleting, onDelete }: { deal: DealGroup; isDeleting: boolean; onDelete: () => Promise<void> }) {
  const scoreDelta = deal.currentScore !== null && deal.previousScore !== null ? deal.currentScore - deal.previousScore : null;
  return (
    <article className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFF0F3] lg:grid-cols-[1fr_auto]">
      <Link className="min-w-0" href={`/sales/analysis?dealId=${deal.id}` as Route}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-none bg-white px-2.5 py-1 text-xs font-bold text-[#EC6F8B] ring-1 ring-[#F0E7E9]">案件</span>
            <span className="inline-flex items-center gap-1 rounded-none bg-[#EC6F8B] px-2.5 py-1 text-xs font-bold text-white">
              <Sparkles className="h-3.5 w-3.5" />
              {deal.currentRank}{deal.currentScore !== null ? ` / ${deal.currentScore}` : ""}
            </span>
            {scoreDelta !== null ? <span className="rounded-none bg-white px-2.5 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0E7E9]">前回比 {scoreDelta > 0 ? "+" : ""}{scoreDelta}</span> : null}
          </div>
          <h3 className="mt-3 truncate text-lg font-bold text-[#2B2B2B]">{deal.companyName}</h3>
          <p className="mt-1 text-sm font-semibold text-[#777]">{deal.productName} / {deal.contactName}</p>
          <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{deal.latestAdviceRecord?.aiAdvice?.summary || deal.latestRecord.transcriptText || "案件の接触履歴と分析を確認できます。"}</p>
        </div>
      </Link>
      <div className="grid content-between gap-3 text-sm font-bold text-[#8A8186] lg:min-w-52 lg:text-right">
        <Link className="grid gap-3" href={`/sales/analysis?dealId=${deal.id}` as Route}>
          <span className="inline-flex items-center gap-2 lg:justify-end"><CalendarDays className="h-4 w-4 text-[#EC6F8B]" />最終 {formatDate(deal.latestRecord.recordedAt.toDate())}</span>
          <span className="inline-flex items-center gap-2 lg:justify-end"><FileText className="h-4 w-4 text-[#EC6F8B]" />{deal.records.length}件の接触</span>
        </Link>
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-3 text-xs font-bold text-[#B65F6F] transition hover:bg-[#FFF0F3] disabled:opacity-50"
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
  return <div className="rounded-none bg-[#FFFBFC] p-4"><p className="flex items-center gap-2 text-xs font-bold text-[#9A8F94]">{icon}{label}</p><p className="mt-2 text-lg font-black text-[#2B2B2B]">{value || "未確認"}</p></div>;
}

function SmallDealInfo({ label, value }: { label: string; value?: string | null }) {
  return <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-bold text-[#6F676B]"><span className="mr-2 text-[#9A8F94]">{label}</span>{value || "未確認"}</p>;
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm"><h3 className="mb-4 text-lg font-bold text-[#2B2B2B]">{title}</h3>{children}</section>;
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
        <Link className="grid grid-cols-[1fr_auto] gap-3 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-bold text-[#6F676B]" href={`/sales/analysis?recordId=${record.id}` as Route} key={record.id}>
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
              <p className="font-bold text-[#2B2B2B]">{recordKindLabel(record)}</p>
              <p className="text-xs font-bold text-[#9A8F94]">{formatDate(record.recordedAt.toDate())}</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#6F676B]">参加者: {[record.contactName, ...(record.attendeeNames ?? [])].filter(Boolean).join(" / ") || "未確認"}</p>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{record.aiAdvice?.summary || record.transcriptText || "要約未作成"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-none bg-white px-2.5 py-1 text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{record.aiAdvice?.prospectRank ?? "未確認"} / {record.aiAdvice?.prospectScore ?? "-"}</span>
              <Link className="rounded-none bg-white px-2.5 py-1 text-[#6F676B] ring-1 ring-[#F0E7E9]" href={`/sales/analysis?recordId=${record.id}` as Route}>分析結果を開く</Link>
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
  return <div className="grid gap-2">{[["表面的", analysis.issues.explicit], ["本質的", analysis.issues.essential], ["潜在", analysis.issues.latent]].map(([label, items]) => <div className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={String(label)}><span className="mr-2 font-bold text-[#EC6F8B]">{String(label)}</span>{Array.isArray(items) && items.length ? items.slice(0, 2).map((item) => item.title).join(" / ") : "未確認"}</div>)}</div>;
}

function ComparisonTable({ base, detailed = false, target }: { base: TeleapoRecord; detailed?: boolean; target: TeleapoRecord }) {
  const rows = [
    ["主な課題", base.aiAdvice?.customerIssues?.join(" / "), target.aiAdvice?.customerIssues?.join(" / ")],
    ["温度感", base.aiAdvice?.temperature ? formatTemperature(base.aiAdvice.temperature) : undefined, target.aiAdvice?.temperature ? formatTemperature(target.aiAdvice.temperature) : undefined],
    ["見込みスコア", base.aiAdvice?.prospectScore?.toString(), target.aiAdvice?.prospectScore?.toString()],
    ["刺さる提案", base.aiAdvice?.meetingPreparation?.proposalStrategy.mainTheme, target.aiAdvice?.meetingPreparation?.proposalStrategy.mainTheme],
    ["決裁者", "未確認", "未確認"],
    ["予算", "未確認", "未確認"],
    ["導入時期", base.aiAdvice?.meetingPreparation?.prospectScore.nextMeetingTiming, target.aiAdvice?.meetingPreparation?.prospectScore.nextMeetingTiming],
    ["懸念", base.aiAdvice?.concerns?.join(" / "), target.aiAdvice?.concerns?.join(" / ")],
    ["次回アクション", base.aiAdvice?.nextActions?.join(" / "), target.aiAdvice?.nextActions?.join(" / ")]
  ];
  const visibleRows = detailed ? rows : rows.slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm font-semibold text-[#6F676B]">
        <thead><tr className="border-b border-[#F0DEE2] text-xs text-[#9A8F94]"><th className="py-2">比較項目</th><th className="py-2">テレアポ時の予測</th><th className="py-2">商談後に判明</th><th className="py-2">差分</th></tr></thead>
        <tbody>{visibleRows.map(([label, before, after]) => <tr className="border-b border-[#F8EEF1]" key={label}><td className="py-3 font-bold text-[#2B2B2B]">{label}</td><td className="py-3">{before || "未確認"}</td><td className="py-3">{after || "未確認"}</td><td className="py-3"><DiffBadge before={before} after={after} /></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function DiffBadge({ after, before }: { after?: string; before?: string }) {
  let label = "未確認のまま";
  if (before && after && before === after) label = "一致";
  if (before && after && before !== after) label = "仮説違い";
  if (!before && after) label = "新たに判明";
  return <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-bold text-[#EC6F8B]">{label}</span>;
}

function TaskPreview({ record }: { record: TeleapoRecord }) {
  const tasks = record.aiAdvice?.meetingPreparation?.nextActions ?? [];
  return <div className="space-y-2">{tasks.slice(0, 5).map((task) => <label className="grid grid-cols-[18px_1fr] gap-2 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={task.title}><input className="mt-1 accent-[#EC6F8B]" type="checkbox" /><span><span className="block font-bold text-[#2B2B2B]">{task.title}</span><span className="text-xs text-[#9A8F94]">{task.dueDate || "期限未確認"} / {task.completionCondition}</span></span></label>)}{tasks.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-3 py-6 text-center text-sm font-bold text-[#9A8F94]">未確認</p> : null}</div>;
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
        <p className="mb-2 text-sm font-bold text-[#8A8186]">質問への返答</p>
        {analysis.schedulingCall.questionResponses.length ? (
          <div className="space-y-2">
            {analysis.schedulingCall.questionResponses.slice(0, 4).map((item) => (
              <div className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={item.condition}>
                <p className="font-bold text-[#2B2B2B]">{item.condition}</p>
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
  return <div className="space-y-2">{orderedSections.map(([key, section]) => <div className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={key}><span className="font-bold text-[#2B2B2B]">{section.minutes} {section.objective}</span><p className="mt-1 line-clamp-2">{section.script.join(" ") || "未確認"}</p></div>)}</div>;
}

function ObjectionPreview({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const items = analysis?.objections.slice(0, 6) ?? [];
  return <div className="space-y-2">{items.map((item) => <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={item.objection}><span className="font-bold text-[#2B2B2B]">{item.objection}</span><span className="mt-1 block text-xs text-[#9A8F94]">{item.recommendedResponse}</span></p>)}{items.length === 0 ? <EmptyPreview /> : null}</div>;
}

function EmptyPreview() {
  return <p className="rounded-none bg-[#FFFBFC] px-3 py-6 text-center text-sm font-bold text-[#9A8F94]">未確認</p>;
}

function MiniBox({ items, title }: { items: string[]; title: string }) {
  return <div className="rounded-none bg-[#FFFBFC] p-3"><p className="font-bold text-[#2B2B2B]">{title}</p><BulletList items={items.slice(0, 4)} empty="未確認" /></div>;
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
  return date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
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

function formatScheduleCandidate(candidate: { label: string; datetime: string; reason: string }): string {
  const parsed = new Date(candidate.datetime);
  const dateText = Number.isNaN(parsed.getTime())
    ? candidate.datetime
    : parsed.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
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
    <button className={`h-9 rounded-none px-4 text-sm font-bold ${active ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function AnalysisRecordCard({ record }: { record: TeleapoRecord }) {
  const date = record.recordedAt.toDate().toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
  const hasAdvice = record.aiAdviceStatus === "completed" && Boolean(record.aiAdvice);
  const summary = record.aiAdvice?.summary || record.transcriptText || "分析内容を確認できます。";

  return (
    <Link className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] hover:bg-[#FFF0F3] lg:grid-cols-[1fr_auto]" href={`/sales/analysis?recordId=${record.id}` as Route}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-none bg-white px-2.5 py-1 text-xs font-bold text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
          <span className={`inline-flex items-center gap-1 rounded-none px-2.5 py-1 text-xs font-bold ${hasAdvice ? "bg-[#EC6F8B] text-white" : "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]"}`}>
            {hasAdvice ? <Sparkles className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {hasAdvice ? "AI分析済み" : "話者分離済み"}
          </span>
        </div>
        <h3 className="mt-3 truncate text-lg font-bold text-[#2B2B2B]">{record.customerName}</h3>
        <p className="mt-1 text-sm font-semibold text-[#777]">{record.productName || "商材未設定"} / {record.contactName || "担当者未設定"}</p>
        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{summary}</p>
      </div>
      <div className="grid content-between gap-3 text-sm font-bold text-[#8A8186] lg:min-w-48 lg:text-right">
        <span className="inline-flex items-center gap-2 lg:justify-end"><CalendarDays className="h-4 w-4 text-[#EC6F8B]" />{date}</span>
        <span className="inline-flex items-center gap-2 lg:justify-end"><FileText className="h-4 w-4 text-[#EC6F8B]" />{record.conversationLogs.length}ブロック</span>
      </div>
    </Link>
  );
}
