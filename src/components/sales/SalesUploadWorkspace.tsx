"use client";

import { CalendarDays, CheckCircle2, FileVideo, Mic2, Pencil, Sparkles, UploadCloud } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AIProcessingCard, LoadingSpinner } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  createTeleapoRecord,
  maxTeleapoDurationSec,
  parseTranscriptToLogs,
  subscribeProducts,
  subscribeTeleapoRecord,
  updateTeleapoRecord,
  uploadTeleapoFile
} from "@/lib/teleapo";
import type { CallPurpose, CallResult, ConversationLog, NextContactType, ProductKnowledge, SalesDomain, TeleapoRecord, TeleapoSpeaker } from "@/types/teleapo";

type InputMode = "teleapo_audio" | "meeting_transcript";

const callPurposeOptions: Array<[CallPurpose, string]> = [
  ["first_appointment", "初回アポ獲得"],
  ["document_followup", "資料送付後フォロー"],
  ["inquiry", "問い合わせ対応"],
  ["referral_call", "紹介先架電"]
];

const callResultOptions: Array<[CallResult, string]> = [
  ["appointment", "アポ獲得"],
  ["considering", "検討"],
  ["document_sent", "資料送付"],
  ["no_answer", "不在"],
  ["rejected", "拒否"],
  ["reception_blocked", "受付止まり"]
];

const nextContactOptions: Array<[NextContactType, string]> = [
  ["none", "なし"],
  ["followup_call", "追っかけ電話"],
  ["email", "メール"],
  ["meeting_scheduled", "商談予定"]
];

const speakerLabels: Record<TeleapoSpeaker, string> = {
  sales: "営業",
  customer: "顧客",
  participant: "同席者",
  unknown: "不明"
};

export function SalesUploadWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordId = searchParams.get("recordId");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<ProductKnowledge[]>([]);
  const [record, setRecord] = useState<TeleapoRecord | null>(null);
  const [mode, setMode] = useState<InputMode>("teleapo_audio");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isProcessing, setProcessing] = useState(false);
  const [isGeneratingAdvice, setGeneratingAdvice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "",
    contactName: "",
    recordedAt: toDatetimeLocalValue(new Date()),
    productId: "",
    productName: "",
    callPurpose: "first_appointment" as CallPurpose,
    callResult: "considering" as CallResult,
    nextContactType: "none" as NextContactType,
    industry: "",
    role: "",
    phone: "",
    leadSource: "",
    memo: "",
    expectedIssue: "",
    reactionMemo: "",
    attendeeNames: "",
    transcriptText: "",
    location: "",
    meetingTitle: "",
    meetingMemo: ""
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => subscribeProducts(setProducts, () => setProducts([])), []);

  useEffect(() => {
    if (!recordId) return undefined;
    return subscribeTeleapoRecord(recordId, setRecord, (nextError) => setError(nextError.message));
  }, [recordId]);

  const selectedProduct = useMemo(() => products.find((product) => product.id === form.productId) ?? null, [form.productId, products]);
  const isSpeakersMode = Boolean(recordId);
  const durationInvalid = durationSec !== null && durationSec > maxTeleapoDurationSec;
  const canSubmit =
    Boolean(user) &&
    Boolean(form.customerName.trim()) &&
    Boolean(form.contactName.trim()) &&
    Boolean(form.recordedAt) &&
    Boolean(form.productName.trim()) &&
    (mode === "meeting_transcript" ? Boolean(form.transcriptText.trim()) : Boolean(selectedFile)) &&
    !durationInvalid;

  const selectProduct = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    setForm((current) => ({ ...current, productId, productName: product?.name ?? "" }));
  };

  const onFileChange = async (file: File | null) => {
    setError(null);
    setSelectedFile(file);
    setDurationSec(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp4")) {
      setError(".mp4 ファイルを選択してください。");
      return;
    }
    const duration = await readMediaDuration(file);
    setDurationSec(duration);
    if (duration > maxTeleapoDurationSec) setError("15分以内のmp4だけアップロードできます。");
  };

  const submit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const isMeeting = mode === "meeting_transcript";
      const transcriptText = isMeeting ? form.transcriptText.trim() : "";
      const conversationLogs = isMeeting ? parseTranscriptToLogs(transcriptText) : [];
      const newRecordId = await createTeleapoRecord({
        userId: user.uid,
        userName: user.displayName || user.email || "営業",
        salesDomain: isMeeting ? "meeting" : "teleapo",
        sourceTeleapoId: null,
        customerName: form.customerName.trim(),
        contactName: form.contactName.trim(),
        productId: form.productId || null,
        productName: form.productName.trim(),
        customerType: "new",
        callPurpose: form.callPurpose,
        callResult: form.callResult,
        nextContactType: form.nextContactType,
        recordedAt: Timestamp.fromDate(new Date(form.recordedAt)),
        attendeeNames: form.attendeeNames.split(",").map((name) => name.trim()).filter(Boolean),
        industry: form.industry.trim(),
        role: form.role.trim(),
        phone: form.phone.trim(),
        leadSource: form.leadSource.trim(),
        memo: form.memo.trim(),
        expectedIssue: form.expectedIssue.trim(),
        reactionMemo: form.reactionMemo.trim(),
        location: form.location.trim(),
        meetingTitle: form.meetingTitle.trim(),
        meetingMemo: form.meetingMemo.trim(),
        transcriptionStatus: isMeeting ? "completed" : "uploaded",
        transcriptionModel: process.env.NEXT_PUBLIC_OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
        transcriptText,
        conversationLogs,
        audioDurationSec: durationSec
      });
      if (!isMeeting && selectedFile) {
        const uploaded = await uploadTeleapoFile({ userId: user.uid, recordId: newRecordId, file: selectedFile, onProgress: setUploadProgress });
        await updateTeleapoRecord(newRecordId, {
          audioFilePath: uploaded.path,
          audioDownloadUrl: uploaded.url,
          audioDurationSec: durationSec,
          transcriptionStatus: "uploaded"
        });
      }
      router.replace(`/sales/upload?recordId=${newRecordId}` as Route);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const startProcessing = async () => {
    if (!record || !user) return;
    setProcessing(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/teleapo/${record.id}/process`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("話者分離の開始に失敗しました。");
      setMessage("Cloud Runへ処理を依頼しました。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "処理開始に失敗しました。");
    } finally {
      setProcessing(false);
    }
  };

  const saveLogs = async (logs: ConversationLog[]) => {
    if (!record) return;
    await updateTeleapoRecord(record.id, { conversationLogs: logs, transcriptionStatus: "completed" });
  };

  const generateAdvice = async () => {
    if (!record || !user) return;
    setGeneratingAdvice(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/teleapo/${record.id}/advice`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("AIアドバイス生成に失敗しました。");
      setMessage("AIアドバイスを生成しました。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AIアドバイス生成に失敗しました。");
    } finally {
      setGeneratingAdvice(false);
    }
  };

  if (isSpeakersMode && record) {
    return (
      <SpeakerWorkspace
        key={`${record.id}-${record.updatedAt.toMillis()}`}
        isGeneratingAdvice={isGeneratingAdvice}
        isProcessing={isProcessing}
        message={message}
        onGenerateAdvice={generateAdvice}
        onSaveLogs={saveLogs}
        onStartProcessing={startProcessing}
        product={products.find((product) => product.id === record.productId) ?? selectedProduct}
        record={record}
        error={error}
      />
    );
  }

  return (
    <div className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader
        title="アップロード"
        description="音声アップロード、話者分離、AIアドバイスまでここで進めます。"
        actions={
        <div className="flex rounded-full border border-[#F0DEE2] bg-white p-1">
          <button className={`h-10 rounded-full px-4 text-sm font-bold ${mode === "teleapo_audio" ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={() => setMode("teleapo_audio")} type="button">テレアポ音声</button>
          <button className={`h-10 rounded-full px-4 text-sm font-bold ${mode === "meeting_transcript" ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={() => setMode("meeting_transcript")} type="button">商談後貼り付け</button>
        </div>
        }
      />
      <div className="mt-5 grid gap-5 xl:grid-cols-[42%_1fr]">
        <section className="rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm">
          {mode === "teleapo_audio" ? (
            <div>
              <button className="grid min-h-80 w-full place-items-center rounded-lg border-2 border-dashed border-[#F0DEE2] bg-[#FFFBFC] p-6 text-center" onClick={() => fileInputRef.current?.click()} type="button">
                <span>
                  <FileVideo className="mx-auto h-12 w-12 text-[#EC6F8B]" />
                  <span className="mt-4 block text-xl font-bold text-[#2B2B2B]">mp4を選択</span>
                  <span className="mt-2 block text-sm font-semibold text-[#8A8186]">15分以内 / Cloud Runで音声抽出します</span>
                  {selectedFile ? <span className="mt-4 block rounded-full bg-[#FFF0F3] px-4 py-2 text-sm font-bold text-[#EC6F8B]">{selectedFile.name}</span> : null}
                </span>
              </button>
              <input accept=".mp4,video/mp4" className="hidden" ref={fileInputRef} type="file" onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)} />
              <div className="mt-4 rounded-lg bg-[#FFF8F9] p-4 text-sm font-semibold text-[#746B70]">
                <p>再生時間: {durationSec === null ? "未取得" : `${Math.round(durationSec)}秒`}</p>
                <p>アップロード進捗: {uploadProgress}%</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-sm font-bold text-[#655D62]">文字起こし貼り付け</label>
              <textarea className="task-input mt-2 min-h-96 resize-none" value={form.transcriptText} onChange={(event) => setForm((current) => ({ ...current, transcriptText: event.target.value }))} placeholder="営業: 本日はありがとうございます&#10;顧客: よろしくお願いします" />
              <p className="mt-3 text-sm font-semibold text-[#8A8186]">話者名があればそのまま分割し、なければ不明として保存します。</p>
            </div>
          )}
        </section>
        <section className="rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="顧客名 / 会社名" required><input className="task-input" value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></Field>
            <Field label="担当者名" required><input className="task-input" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} /></Field>
            <Field label={mode === "teleapo_audio" ? "電話日時" : "実施日時"} required><input className="task-input" type="datetime-local" value={form.recordedAt} onChange={(event) => setForm((current) => ({ ...current, recordedAt: event.target.value }))} /></Field>
            <Field label="商材" required>
              <select className="task-input" value={form.productId} onChange={(event) => selectProduct(event.target.value)}>
                <option value="">選択してください</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              {products.length === 0 ? <input className="task-input mt-2" placeholder="商材名を直接入力" value={form.productName} onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))} /> : null}
            </Field>
            {mode === "teleapo_audio" ? (
              <>
                <Field label="電話目的"><Select value={form.callPurpose} options={callPurposeOptions} onChange={(value) => setForm((current) => ({ ...current, callPurpose: value as CallPurpose }))} /></Field>
                <Field label="架電結果"><Select value={form.callResult} options={callResultOptions} onChange={(value) => setForm((current) => ({ ...current, callResult: value as CallResult }))} /></Field>
                <Field label="次回接点予定"><Select value={form.nextContactType} options={nextContactOptions} onChange={(value) => setForm((current) => ({ ...current, nextContactType: value as NextContactType }))} /></Field>
                <Field label="顧客区分"><input className="task-input" disabled value="新規" readOnly /></Field>
              </>
            ) : (
              <>
                <Field label="予定タイトル"><input className="task-input" value={form.meetingTitle} onChange={(event) => setForm((current) => ({ ...current, meetingTitle: event.target.value }))} /></Field>
                <Field label="場所"><input className="task-input" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></Field>
              </>
            )}
            <Field label="業種"><input className="task-input" value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} /></Field>
            <Field label="役職"><input className="task-input" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} /></Field>
            <Field label="電話番号"><input className="task-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
            <Field label="流入元 / リスト種別"><input className="task-input" value={form.leadSource} onChange={(event) => setForm((current) => ({ ...current, leadSource: event.target.value }))} /></Field>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="事前メモ / 予定メモ"><textarea className="task-input min-h-20 resize-none" value={form.memo} onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))} /></Field>
            <Field label="顧客の想定課題"><textarea className="task-input min-h-20 resize-none" value={form.expectedIssue} onChange={(event) => setForm((current) => ({ ...current, expectedIssue: event.target.value }))} /></Field>
            <Field label="受付・担当者の反応メモ"><textarea className="task-input min-h-20 resize-none" value={form.reactionMemo} onChange={(event) => setForm((current) => ({ ...current, reactionMemo: event.target.value }))} /></Field>
            <Field label="同席者・共有先"><input className="task-input" value={form.attendeeNames} onChange={(event) => setForm((current) => ({ ...current, attendeeNames: event.target.value }))} placeholder="カンマ区切り" /></Field>
          </div>
          <div className="mt-4"><StatusBanner message={error} type="error" /></div>
          <button className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#EC6F8B] text-sm font-bold text-white disabled:opacity-50" disabled={!canSubmit || isSubmitting} onClick={() => void submit()} type="button">
            {isSubmitting ? <LoadingSpinner label="保存中" /> : <UploadCloud className="h-4 w-4" />}
            {mode === "teleapo_audio" ? "アップロードして話者分離へ" : "保存してAIアドバイスへ"}
          </button>
        </section>
      </div>
    </div>
  );
}

function SpeakerWorkspace({
  record,
  product,
  isProcessing,
  isGeneratingAdvice,
  message,
  error,
  onStartProcessing,
  onSaveLogs,
  onGenerateAdvice
}: {
  record: TeleapoRecord;
  product: ProductKnowledge | null;
  isProcessing: boolean;
  isGeneratingAdvice: boolean;
  message: string | null;
  error: string | null;
  onStartProcessing: () => Promise<void>;
  onSaveLogs: (logs: ConversationLog[]) => Promise<void>;
  onGenerateAdvice: () => Promise<void>;
}) {
  const [logs, setLogs] = useState<ConversationLog[]>(record.conversationLogs);

  const updateLog = (id: string, patch: Partial<ConversationLog>) => setLogs((current) => current.map((log) => (log.id === id ? { ...log, ...patch } : log)));
  const canAdvice = record.transcriptionStatus === "completed" && logs.length > 0;

  return (
    <div className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader
        title={record.customerName}
        description={`${record.productName} / ${record.contactName}`}
        actions={
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-11 items-center gap-2 rounded-full border border-[#F0DEE2] bg-white px-5 text-sm font-bold text-[#6F676B]" disabled={isProcessing} onClick={() => void onStartProcessing()} type="button">
            {isProcessing ? <LoadingSpinner label="処理中" /> : <Mic2 className="h-4 w-4" />}
            話者分離を開始
          </button>
          <button className="inline-flex h-11 items-center gap-2 rounded-full bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={!canAdvice || isGeneratingAdvice} onClick={() => void onGenerateAdvice()} type="button">
            {isGeneratingAdvice ? <LoadingSpinner label="AI処理中" /> : <Sparkles className="h-4 w-4" />}
            AIアドバイス
          </button>
        </div>
        }
      />
      <div className="mt-5 grid gap-5 xl:grid-cols-[36%_1fr]">
        <section className="space-y-4">
          <ProcessSteps status={record.transcriptionStatus} />
          <InfoCard title="保存情報" rows={[["顧客", record.customerName], ["担当", record.contactName], ["商材", record.productName], ["モデル", record.transcriptionModel], ["商材情報", product ? "登録済み" : "未登録"]]} />
          <StatusBanner message={message} type="success" />
          <StatusBanner message={error} type="error" />
          {isGeneratingAdvice ? <AIProcessingCard compact steps={["顧客情報を整理中", "商材情報を確認中", "トークスクリプトを作成中", "次アクションを整理中"]} /> : null}
        </section>
        <section className="rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#2B2B2B]">会話ログ</h3>
            <button className="h-10 rounded-full border border-[#F0DEE2] px-4 text-sm font-bold text-[#6F676B]" onClick={() => void onSaveLogs(logs)} type="button">話者ラベルを保存</button>
          </div>
          {logs.length === 0 ? <p className="rounded-lg bg-[#FFFBFC] px-5 py-10 text-center text-sm font-bold text-[#8A8186]">文字起こし完了後、発話単位のログが表示されます。</p> : null}
          <div className="space-y-3">
            {logs.map((log) => (
              <div className="grid gap-3 rounded-lg border border-[#F0DEE2] bg-[#FFFBFC] p-3 sm:grid-cols-[140px_1fr]" key={log.id}>
                <select className="task-input" value={log.speaker} onChange={(event) => updateLog(log.id, { speaker: event.target.value as TeleapoSpeaker })}>
                  {Object.entries(speakerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea className="task-input min-h-20 resize-none" value={log.text} onChange={(event) => updateLog(log.id, { text: event.target.value })} />
              </div>
            ))}
          </div>
        </section>
      </div>
      {record.aiAdvice ? <AdvicePanel record={record} /> : null}
    </div>
  );
}

function AdvicePanel({ record }: { record: TeleapoRecord }) {
  const advice = record.aiAdvice;
  if (!advice) return null;
  return (
    <section className="mt-5 rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <h3 className="text-2xl font-bold text-[#2B2B2B]">AIアドバイス</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Metric title="見込み度" value={`${advice.prospectScore}/100`} />
        <Metric title="温度感" value={advice.temperature} />
        <Metric title="次アクション" value={advice.nextActions[0] ?? "未設定"} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <TextBlock title="要約" items={[advice.summary, advice.scoreReason]} />
        <TextBlock title="課題・懸念" items={[...advice.customerIssues, ...advice.concerns]} />
        <TextBlock title="日程調整電話" items={[...advice.scheduleCallScript.candidates.map((item) => `${item.label}: ${item.datetime}（${item.reason}）`), advice.scheduleCallScript.script]} />
        <TextBlock title="必要資料" items={advice.materials} />
        <TextBlock title="当日打ち合わせ" items={[...advice.meetingScript.greeting, ...advice.meetingScript.hearing, ...advice.meetingScript.proposal, ...advice.meetingScript.nextAction]} />
        <TextBlock title="次にやること" items={advice.nextActions} />
      </div>
    </section>
  );
}

function ProcessSteps({ status }: { status: TeleapoRecord["transcriptionStatus"] }) {
  const steps = [
    ["アップロード完了", ["uploaded", "extracting", "transcribing", "diarizing", "completed"].includes(status)],
    ["音声抽出 / 変換中", ["extracting", "transcribing", "diarizing", "completed"].includes(status)],
    ["文字起こし中", ["transcribing", "diarizing", "completed"].includes(status)],
    ["話者分離中", ["diarizing", "completed"].includes(status)],
    ["AIアドバイス生成可能", status === "completed"]
  ] as const;
  return (
    <section className="rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-xl font-bold text-[#2B2B2B]">処理ステップ</h3>
      <div className="space-y-3">
        {steps.map(([label, completed], index) => (
          <div className="flex items-center gap-3" key={label}>
            <span className={`grid h-8 w-8 place-items-center rounded-full ${completed ? "bg-[#EC6F8B] text-white" : "bg-[#FFF0F3] text-[#EC6F8B]"}`}>{completed ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span>
            <span className="text-sm font-bold text-[#5F585C]">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[#655D62]">
      <span className="inline-flex items-center gap-2">
        {label}
        {required ? <span className="h-1.5 w-1.5 rounded-full bg-[#EC6F8B]" aria-label="必須" /> : null}
      </span>
      {children}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <select className="task-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([nextValue, label]) => <option key={nextValue} value={nextValue}>{label}</option>)}</select>;
}

function InfoCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm"><h3 className="mb-3 text-xl font-bold text-[#2B2B2B]">{title}</h3><div className="space-y-2 text-sm font-semibold text-[#6F676B]">{rows.map(([label, value]) => <p key={label}><span className="mr-3 inline-block min-w-20 text-[#9A8F94]">{label}</span>{value}</p>)}</div></section>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg bg-[#FFF0F3] p-4"><p className="text-sm font-bold text-[#EC6F8B]">{title}</p><p className="mt-2 text-2xl font-bold text-[#2B2B2B]">{value}</p></div>;
}

function TextBlock({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-lg border border-[#F0DEE2] bg-[#FFFBFC] p-4"><h4 className="font-bold text-[#2B2B2B]">{title}</h4><ul className="mt-3 space-y-2 text-sm font-semibold text-[#6F676B]">{items.filter(Boolean).map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>;
}

function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function readMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement("video");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      URL.revokeObjectURL(media.src);
      resolve(media.duration);
    };
    media.onerror = () => reject(new Error("再生時間を取得できませんでした。"));
    media.src = URL.createObjectURL(file);
  });
}
