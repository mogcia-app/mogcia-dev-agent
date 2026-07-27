"use client";

import { CalendarDays, CheckCircle2, FileVideo, Mic2, Pencil, Scissors, Sparkles, UploadCloud } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AIProcessingCard, LoadingSpinner } from "@/components/ui/loading";
import { MultiSelect, SearchSelect, SingleSelect } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status";
import { splitTextIntoConversationBlocks } from "@/lib/conversation-blocks";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { subscribeCompaniesMaster } from "@/lib/companies";
import {
  createTeleapoRecord,
  maxTeleapoDurationSec,
  parseTranscriptToLogs,
  subscribeProducts,
  subscribeTeleapoRecord,
  updateTeleapoRecord,
  uploadTeleapoFile
} from "@/lib/teleapo";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayName } from "@/lib/user-display";
import type { Company } from "@/types/company";
import type { CallPurpose, ConversationLog, ProductKnowledge, SalesDomain, TeleapoRecord, TeleapoSpeaker } from "@/types/teleapo";

type InputMode = "teleapo_audio" | "meeting_transcript";

const callPurposeOptions: Array<[CallPurpose, string]> = [
  ["first_appointment", "初回アポ獲得"],
  ["document_followup", "資料送付後フォロー"],
  ["inquiry", "問い合わせ対応"],
  ["referral_call", "紹介先架電"]
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [record, setRecord] = useState<TeleapoRecord | null>(null);
  const [mode, setMode] = useState<InputMode>("teleapo_audio");
  const [members, setMembers] = useState<Array<{ uid: string; name: string; email: string }>>(DEFAULT_WORKSPACE_MEMBERS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isProcessing, setProcessing] = useState(false);
  const [isGeneratingAdvice, setGeneratingAdvice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyId: "",
    customerName: "",
    contactName: "",
    recordedAt: toDatetimeLocalValue(new Date()),
    productId: "",
    productName: "",
    callPurpose: "first_appointment" as CallPurpose,
    nextContactType: "meeting_scheduled" as const,
    industry: "",
    role: "",
    phone: "",
    leadSource: "",
    memo: "",
    expectedIssue: "",
    reactionMemo: "",
    attendeeUserIds: [] as string[],
    attendeeNames: "",
    transcriptText: "",
    location: "",
    meetingTitle: "",
    meetingMemo: "",
    diagnosisTemperature: "" as "" | "S" | "A" | "B" | "C",
    diagnosisBiggestIssue: "",
    diagnosisResonatedPoint: "",
    diagnosisConcerns: "",
    diagnosisNextProposal: "",
    diagnosisCloseProbability: "",
    diagnosisNextAction: ""
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => subscribeProducts(setProducts, () => setProducts([])), []);

  useEffect(() => subscribeCompaniesMaster((nextCompanies) => setCompanies(nextCompanies.filter((company) => !company.archivedAt)), () => setCompanies([])), []);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    void user.getIdToken()
      .then(async (token) => {
        const response = await fetch("/api/users/members", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("メンバーを取得できませんでした");
        return response.json() as Promise<{ members: Array<{ uid: string; name: string; email: string }> }>;
      })
      .then((data) => {
        if (!cancelled) setMembers(data.members.length ? data.members : DEFAULT_WORKSPACE_MEMBERS);
      })
      .catch(() => {
        if (!cancelled) setMembers(DEFAULT_WORKSPACE_MEMBERS);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!recordId) return undefined;
    return subscribeTeleapoRecord(recordId, setRecord, (nextError) => setError(nextError.message));
  }, [recordId]);

  const selectedProduct = useMemo(() => products.find((product) => product.id === form.productId) ?? null, [form.productId, products]);
  const selectedCompany = useMemo(() => companies.find((company) => company.id === form.companyId) ?? null, [companies, form.companyId]);
  const selectedMembers = useMemo(() => members.filter((member) => form.attendeeUserIds.includes(member.uid)), [form.attendeeUserIds, members]);
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

  const selectCompany = (companyId: string) => {
    const company = companies.find((item) => item.id === companyId);
    setForm((current) => ({
      ...current,
      companyId,
      customerName: company?.name ?? current.customerName,
      contactName: company?.primaryContactName || current.contactName,
      industry: company?.industry || current.industry,
      phone: company?.phone || current.phone
    }));
  };

  const onFileChange = async (file: File | null) => {
    setError(null);
    setSelectedFile(file);
    setDurationSec(null);
    if (!file) return;
    if (!isSupportedTeleapoFile(file)) {
      setError(".mp4 または .m4a ファイルを選択してください。");
      setSelectedFile(null);
      return;
    }
    try {
      const duration = await readMediaDuration(file);
      setDurationSec(duration);
      if (duration > maxTeleapoDurationSec) setError("15分以内のmp4またはm4aだけアップロードできます。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ファイルの再生時間を取得できませんでした。");
      setSelectedFile(null);
    }
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
        userName: getUserDisplayName(user),
        salesDomain: isMeeting ? "meeting" : "teleapo",
        sourceTeleapoId: null,
        companyId: form.companyId || null,
        customerName: form.customerName.trim(),
        contactName: form.contactName.trim(),
        productId: form.productId || null,
        productName: form.productName.trim(),
        customerType: "new",
        callPurpose: form.callPurpose,
        callResult: "appointment",
        nextContactType: form.nextContactType,
        recordedAt: Timestamp.fromDate(new Date(form.recordedAt)),
        attendeeUserIds: form.attendeeUserIds,
        attendeeNames: selectedMembers.map((member) => member.name),
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
        diagnosisSheet: isMeeting
          ? {
              temperature: form.diagnosisTemperature,
              biggestIssue: form.diagnosisBiggestIssue.trim(),
              resonatedPoint: form.diagnosisResonatedPoint.trim(),
              concerns: form.diagnosisConcerns.trim(),
              nextProposal: form.diagnosisNextProposal.trim(),
              closeProbability: form.diagnosisCloseProbability.trim(),
              nextAction: form.diagnosisNextAction.trim()
            }
          : null,
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
      if (!response.ok) throw new Error(await readApiError(response, "話者分離の開始に失敗しました。"));
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
      if (!response.ok) throw new Error(await readApiError(response, "AIアドバイス生成に失敗しました。"));
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
          <button className={`h-10 rounded-full px-4 text-sm font-bold ${mode === "teleapo_audio" ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={() => setMode("teleapo_audio")} type="button">テレアポ</button>
          <button className={`h-10 rounded-full px-4 text-sm font-bold ${mode === "meeting_transcript" ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={() => setMode("meeting_transcript")} type="button">商談</button>
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
                  <span className="mt-4 block text-xl font-bold text-[#2B2B2B]">mp4 / m4aを選択</span>
                  <span className="mt-2 block text-sm font-semibold text-[#8A8186]">15分以内 / 必要に応じて音声変換します</span>
                  {selectedFile ? <span className="mt-4 block rounded-full bg-[#FFF0F3] px-4 py-2 text-sm font-bold text-[#EC6F8B]">{selectedFile.name}</span> : null}
                </span>
              </button>
              <input className="hidden" ref={fileInputRef} type="file" onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)} />
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
          <div className="mb-4 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4">
            <Field label="会社一覧から反映">
              <SearchSelect
                clearable
                emptyLabel="会社が登録されていません。"
                options={companies.map((company) => ({ value: company.id, label: company.name, description: [company.industry, company.primaryContactName].filter(Boolean).join(" / ") }))}
                placeholder="未選択（手入力）"
                value={form.companyId}
                onChange={selectCompany}
              />
            </Field>
            {selectedCompany ? (
              <p className="mt-2 text-xs font-bold leading-5 text-[#8A8186]">
                {selectedCompany.industry || "業種未設定"} / 担当: {selectedCompany.primaryContactName || "未設定"} / 電話: {selectedCompany.phone || "未登録"}
              </p>
            ) : (
              <p className="mt-2 text-xs font-bold text-[#8A8186]">会社一覧に登録済みなら、選択すると入力を自動反映します。</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="顧客名 / 会社名" required><input className="task-input" value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></Field>
            <Field label="担当者名" required><input className="task-input" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} /></Field>
            <Field label={mode === "teleapo_audio" ? "電話日時" : "実施日時"} required><input className="task-input" type="datetime-local" value={form.recordedAt} onChange={(event) => setForm((current) => ({ ...current, recordedAt: event.target.value }))} /></Field>
            <Field label="商材" required>
              <SearchSelect
                emptyLabel="商材が未登録です。"
                options={products.map((product) => ({ value: product.id, label: product.name }))}
                placeholder="選択してください"
                value={form.productId}
                onChange={selectProduct}
              />
              {products.length === 0 ? <input className="task-input mt-2" placeholder="商材名を直接入力" value={form.productName} onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))} /> : null}
            </Field>
            {mode === "teleapo_audio" ? (
              <>
                <Field label="電話目的"><Select value={form.callPurpose} options={callPurposeOptions} onChange={(value) => setForm((current) => ({ ...current, callPurpose: value as CallPurpose }))} /></Field>
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
          </div>
          <div className="mt-4 grid gap-4">
            <MultiSelect
              emptyLabel="Authユーザーを取得できませんでした。"
              label="同席者・共有先"
              options={members.map((member) => ({ value: member.uid, label: member.name, description: member.email }))}
              placeholder="メンバーを選択"
              values={form.attendeeUserIds}
              onChange={(attendeeUserIds) => setForm((current) => ({ ...current, attendeeUserIds, attendeeNames: members.filter((member) => attendeeUserIds.includes(member.uid)).map((member) => member.name).join(", ") }))}
            />
          </div>
          {mode === "meeting_transcript" ? (
            <section className="mt-5 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-[#2B2B2B]">商談診断シート</h3>
                <p className="mt-1 text-xs font-bold text-[#8A8186]">商談後の手動評価です。AIフォロー提案の判断材料になります。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="温度感">
                  <Select
                    value={form.diagnosisTemperature}
                    options={[["", "未選択"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"]]}
                    onChange={(value) => setForm((current) => ({ ...current, diagnosisTemperature: value as typeof current.diagnosisTemperature }))}
                  />
                </Field>
                <Field label="成約確率">
                  <input className="task-input" placeholder="例: 70%" value={form.diagnosisCloseProbability} onChange={(event) => setForm((current) => ({ ...current, diagnosisCloseProbability: event.target.value }))} />
                </Field>
                <Field label="最大の課題">
                  <textarea className="task-input min-h-24 resize-none" value={form.diagnosisBiggestIssue} onChange={(event) => setForm((current) => ({ ...current, diagnosisBiggestIssue: event.target.value }))} />
                </Field>
                <Field label="刺さったポイント">
                  <textarea className="task-input min-h-24 resize-none" value={form.diagnosisResonatedPoint} onChange={(event) => setForm((current) => ({ ...current, diagnosisResonatedPoint: event.target.value }))} />
                </Field>
                <Field label="懸念点">
                  <textarea className="task-input min-h-24 resize-none" value={form.diagnosisConcerns} onChange={(event) => setForm((current) => ({ ...current, diagnosisConcerns: event.target.value }))} />
                </Field>
                <Field label="次回提案内容">
                  <textarea className="task-input min-h-24 resize-none" value={form.diagnosisNextProposal} onChange={(event) => setForm((current) => ({ ...current, diagnosisNextProposal: event.target.value }))} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="次回やること">
                    <textarea className="task-input min-h-24 resize-none" value={form.diagnosisNextAction} onChange={(event) => setForm((current) => ({ ...current, diagnosisNextAction: event.target.value }))} />
                  </Field>
                </div>
              </div>
            </section>
          ) : null}
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
  const splitLog = (id: string) => {
    setLogs((current) =>
      current.flatMap((log) => {
        if (log.id !== id) return [log];
        const blocks = splitTextIntoConversationBlocks(log.text);
        if (blocks.length <= 1) return [log];
        return blocks.map((block, index) => ({
          ...log,
          id: `${log.id}-block-${Date.now()}-${index + 1}`,
          text: block,
          startSec: index === 0 ? log.startSec ?? null : null,
          endSec: index === blocks.length - 1 ? log.endSec ?? null : null
        }));
      })
    );
  };
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
                <div className="grid content-start gap-2">
                  <SingleSelect options={Object.entries(speakerLabels).map(([value, label]) => ({ value, label }))} value={log.speaker} onChange={(speaker) => updateLog(log.id, { speaker: speaker as TeleapoSpeaker })} />
                  <button
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-[#F0DEE2] bg-white px-3 text-xs font-bold text-[#EC6F8B] disabled:opacity-40"
                    disabled={splitTextIntoConversationBlocks(log.text).length <= 1}
                    onClick={() => splitLog(log.id)}
                    type="button"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    分割
                  </button>
                </div>
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
  const prospectRank = advice.prospectRank ?? scoreToRank(advice.prospectScore);
  const rankReason = advice.rankReason || advice.scoreReason;
  return (
    <section className="mt-5 rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <h3 className="text-2xl font-bold text-[#2B2B2B]">AIアドバイス</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Metric title="見込みランク" value={`${prospectRank} / ${advice.prospectScore}`} />
        <Metric title="温度感" value={advice.temperature} />
        <Metric title="追うタイミング" value={formatUrgency(advice.nextActionUrgency)} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <TextBlock title="要約" items={[advice.summary, rankReason]} />
        <TextBlock title="課題・懸念" items={[...advice.customerIssues, ...advice.concerns]} />
        {record.salesDomain === "meeting" ? (
          <>
            <TextBlock title="良かった点" items={advice.positives ?? []} />
            <TextBlock title="ダメだった点・弱かった点" items={advice.negatives ?? []} />
            <TextBlock title="顧客の前向きな発言" items={advice.positiveCustomerSignals ?? []} />
            <TextBlock title="顧客が迷っていた発言" items={advice.hesitationSignals ?? []} />
            <TextBlock title="決まりそうな条件" items={advice.closingRequirements ?? []} />
            <TextBlock title="足りない情報" items={advice.missingInformation ?? []} />
            <TextBlock title="成約に必要なもの" items={[...(advice.requiredMaterials ?? []), ...(advice.additionalMaterials ?? [])]} />
            <TextBlock title="失注リスク" items={[...(advice.lostRisks ?? []), ...(advice.closeReasons ?? []).map((item) => `成約に近い理由: ${item}`)]} />
            <TextBlock title="フォローアップ判断" items={[advice.shouldFollowUp ? "フォローアップする" : "フォローアップしない", advice.followUpReason ?? "", `方法: ${formatFollowUpMethod(advice.followUpMethod)}`, `タイミング: ${formatUrgency(advice.nextActionUrgency)}`, advice.followupTimingReason ?? ""]} />
            <TextBlock title="フォローアップ電話トーク" items={[advice.followupCallScript ?? ""]} />
            <TextBlock title="フォローアップメール文面" items={[advice.followupEmail ?? ""]} />
            <TextBlock title="次回商談で確認すること" items={advice.nextMeetingQuestions ?? []} />
          </>
        ) : null}
        <TextBlock title="日程調整電話" items={[...advice.scheduleCallScript.candidates.map((item) => `${item.label}: ${item.datetime}（${item.reason}）`), advice.scheduleCallScript.script]} />
        <TextBlock title="必要資料" items={advice.materials} />
        <TextBlock title="当日打ち合わせ" items={[...advice.meetingScript.greeting, ...advice.meetingScript.hearing, ...advice.meetingScript.proposal, ...advice.meetingScript.nextAction]} />
        <TextBlock title="次にやること" items={advice.nextActions} />
      </div>
    </section>
  );
}

function scoreToRank(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B+";
  if (score >= 55) return "B";
  if (score >= 35) return "B-";
  return "C";
}

function formatUrgency(urgency?: string): string {
  if (urgency === "today") return "当日中";
  if (urgency === "next_business_day") return "翌営業日";
  if (urgency === "within_3_days") return "3営業日以内";
  if (urgency === "next_week") return "1週間以内";
  if (urgency === "long_term") return "長期フォロー";
  if (urgency === "none") return "追わない";
  return "未設定";
}

function formatFollowUpMethod(method?: string): string {
  if (method === "phone") return "電話";
  if (method === "email") return "メール";
  if (method === "chat") return "チャット";
  if (method === "meeting") return "次回商談";
  if (method === "none") return "追わない";
  return "未設定";
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
  return <SingleSelect options={options.map(([nextValue, label]) => ({ value: nextValue, label }))} value={value} onChange={onChange} />;
}

function InfoCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-lg border border-[#F0DEE2] bg-white p-5 shadow-sm"><h3 className="mb-3 text-xl font-bold text-[#2B2B2B]">{title}</h3><div className="space-y-2 text-sm font-semibold text-[#6F676B]">{rows.map(([label, value]) => <p key={label}><span className="mr-3 inline-block min-w-20 text-[#9A8F94]">{label}</span>{value}</p>)}</div></section>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg bg-[#FFF0F3] p-4"><p className="text-sm font-bold text-[#EC6F8B]">{title}</p><p className="mt-2 text-2xl font-bold text-[#2B2B2B]">{value}</p></div>;
}

function TextBlock({ title, items }: { title: string; items: string[] }) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;
  return <div className="rounded-lg border border-[#F0DEE2] bg-[#FFFBFC] p-4"><h4 className="font-bold text-[#2B2B2B]">{title}</h4><ul className="mt-3 space-y-2 text-sm font-semibold text-[#6F676B]">{visibleItems.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>;
}

function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isSupportedTeleapoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".mp4") || name.endsWith(".m4a") || file.type === "video/mp4" || file.type === "audio/mp4" || file.type === "audio/x-m4a";
}

async function readMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(file.type.startsWith("audio/") || file.name.toLowerCase().endsWith(".m4a") ? "audio" : "video");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      URL.revokeObjectURL(media.src);
      resolve(media.duration);
    };
    media.onerror = () => reject(new Error("再生時間を取得できませんでした。"));
    media.src = URL.createObjectURL(file);
  });
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}
