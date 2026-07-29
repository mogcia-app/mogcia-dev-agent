"use client";

import { Building2, CalendarDays, CheckCircle2, ChevronRight, Clock3, Copy, Download, FileText, FileVideo, Mic2, MoreVertical, Pencil, Play, Printer, RotateCcw, Scissors, Share2, Sparkles, UploadCloud, UserRound } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AIProcessingCard, LoadingSpinner } from "@/components/ui/loading";
import { MultiSelect, SearchSelect, SingleSelect } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status";
import { subscribeCalendarEvents } from "@/lib/calendar";
import { splitConversationLogsIntoBlocks, splitTextIntoConversationBlocks } from "@/lib/conversation-blocks";
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
import type { CalendarEvent } from "@/types/calendar";
import type { Company } from "@/types/company";
import type { AnalysisTaskItem, CallPurpose, ConversationLog, EvidenceItem, IssueItem, MaterialItem, MeetingPreparationAnalysis, ObjectionItem, ProductKnowledge, QuestionItem, SalesDomain, ScriptSection, TeleapoRecord, TeleapoSpeaker } from "@/types/teleapo";

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
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
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
    calendarEventId: "",
    customerName: "",
    contactName: "",
    recordedAt: toDatetimeLocalValue(new Date()),
    productId: "",
    productName: "",
    callPurpose: "first_appointment" as CallPurpose,
    nextContactType: "meeting_scheduled" as const,
    industry: "",
    companyAddress: "",
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
    diagnosisMeetingPhase: "first" as "" | "first" | "second" | "pre_contract" | "continued",
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

  useEffect(() => subscribeCalendarEvents(setCalendarEvents, () => setCalendarEvents([])), []);

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
  const selectedCalendarEvent = useMemo(() => calendarEvents.find((event) => event.id === form.calendarEventId) ?? null, [calendarEvents, form.calendarEventId]);
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
    setForm((current) => ({ ...current, ...companyToFormPatch(company, current, products, members) }));
  };

  const selectCalendarEvent = (calendarEventId: string) => {
    const event = calendarEvents.find((item) => item.id === calendarEventId);
    const company = event?.companyId ? companies.find((item) => item.id === event.companyId) : undefined;
    setForm((current) => ({
      ...current,
      ...(company ? companyToFormPatch(company, current, products, members) : {}),
      calendarEventId,
      recordedAt: event ? toDatetimeLocalValue(event.startAt.toDate()) : current.recordedAt,
      meetingTitle: event?.title ?? current.meetingTitle,
      meetingMemo: event?.description ?? current.meetingMemo,
      location: event?.location ?? current.location,
      attendeeUserIds: event?.attendeeIds?.length ? event.attendeeIds : company?.companionUserIds?.length ? company.companionUserIds : current.attendeeUserIds,
      attendeeNames: event?.attendeeNames?.length ? event.attendeeNames.join(", ") : current.attendeeNames,
      companyId: event?.companyId ?? company?.id ?? current.companyId,
      customerName: event?.companyName ?? company?.name ?? current.customerName
    }));
  };

  const companyToFormPatch = (company: Company | undefined, current: typeof form, productOptions: ProductKnowledge[], memberOptions: Array<{ uid: string; name: string; email: string }>) => {
    const primaryContact = getCompanyPrimaryContact(company);
    const companyProductId = company?.productIds?.[0] ?? "";
    const companyProduct = productOptions.find((product) => product.id === companyProductId);
    const attendeeUserIds = company?.companionUserIds?.length ? company.companionUserIds : [];
    return {
      companyId: company?.id ?? current.companyId,
      customerName: company?.name ?? current.customerName,
      contactName: primaryContact?.name || company?.primaryContactName || current.contactName,
      industry: company?.industry || current.industry,
      companyAddress: company?.address || current.companyAddress,
      role: primaryContact?.role || current.role,
      phone: primaryContact?.phone || company?.phone || current.phone,
      productId: companyProductId || current.productId,
      productName: companyProduct?.name || company?.productNames?.[0] || current.productName,
      attendeeUserIds,
      attendeeNames: memberOptions.filter((member) => attendeeUserIds.includes(member.uid)).map((member) => member.name).join(", ")
    };
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
        calendarEventId: form.calendarEventId || null,
        attendeeUserIds: form.attendeeUserIds,
        attendeeNames: selectedMembers.map((member) => member.name),
        industry: form.industry.trim(),
        companyAddress: form.companyAddress.trim(),
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
              meetingPhase: form.diagnosisMeetingPhase,
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

  const saveLogs = async (logs: ConversationLog[]): Promise<boolean> => {
    if (!record || !user) return false;
    setError(null);
    setMessage(null);
    setGeneratingAdvice(true);
    try {
      await updateTeleapoRecord(record.id, { conversationLogs: sanitizeConversationLogs(logs), conversationLogsLocked: true, transcriptionStatus: "completed" });
      const token = await user.getIdToken();
      const response = await fetch(`/api/teleapo/${record.id}/advice`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await readApiError(response, "分析結果の作成に失敗しました。"));
      setMessage("分析済み一覧に反映しました。");
      router.replace(createAnalysisDealHref(record) as Route);
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "分析済み一覧への反映に失敗しました。");
      return false;
    } finally {
      setGeneratingAdvice(false);
    }
  };

  const generateAdvice = async () => {
    if (!record || !user) return;
    setGeneratingAdvice(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/teleapo/${record.id}/advice`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await readApiError(response, "分析結果の作成に失敗しました。"));
      setMessage("分析結果を作成しました。");
      router.replace(createAnalysisDealHref(record) as Route);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "分析結果の作成に失敗しました。");
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
    <div className="">
        <PageHeader
          title="アップロード"
        description="音声アップロードと話者分離を保存すると、分析済み一覧に反映されます。"
        actions={
        <div className="flex rounded-none border border-[#F0DEE2] bg-white p-1">
          <button className={`h-10 rounded-none px-4 text-sm font-bold ${mode === "teleapo_audio" ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={() => setMode("teleapo_audio")} type="button">テレアポ</button>
          <button className={`h-10 rounded-none px-4 text-sm font-bold ${mode === "meeting_transcript" ? "bg-[#EC6F8B] text-white" : "text-[#746B70]"}`} onClick={() => setMode("meeting_transcript")} type="button">商談</button>
        </div>
        }
      />
      <div className={`mt-5 grid gap-5 ${mode === "meeting_transcript" ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]" : "xl:grid-cols-[42%_1fr]"}`}>
        <section className={`rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm ${mode === "meeting_transcript" ? "min-h-[960px]" : ""}`}>
          {mode === "teleapo_audio" ? (
            <div>
              <button className="grid min-h-80 w-full place-items-center rounded-none border-2 border-dashed border-[#F0DEE2] bg-[#FFFBFC] p-6 text-center" onClick={() => fileInputRef.current?.click()} type="button">
                <span>
                  <FileVideo className="mx-auto h-12 w-12 text-[#EC6F8B]" />
                  <span className="mt-4 block text-xl font-bold text-[#2B2B2B]">mp4 / m4aを選択</span>
                  <span className="mt-2 block text-sm font-semibold text-[#8A8186]">15分以内 / 必要に応じて音声変換します</span>
                  {selectedFile ? <span className="mt-4 block rounded-none bg-[#FFF0F3] px-4 py-2 text-sm font-bold text-[#EC6F8B]">{selectedFile.name}</span> : null}
                </span>
              </button>
              <input className="hidden" ref={fileInputRef} type="file" onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)} />
              <div className="mt-4 rounded-none bg-[#FFF8F9] p-4 text-sm font-semibold text-[#746B70]">
                <p>再生時間: {durationSec === null ? "未取得" : `${Math.round(durationSec)}秒`}</p>
                <p>アップロード進捗: {uploadProgress}%</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-sm font-bold text-[#655D62]">文字起こし貼り付け</label>
              <textarea
                className="task-input mt-2 h-[78vh] min-h-[900px] resize-y text-base leading-7"
                style={{ minHeight: 900 }}
                value={form.transcriptText}
                onChange={(event) => setForm((current) => ({ ...current, transcriptText: event.target.value }))}
                placeholder="営業: 本日はありがとうございます&#10;顧客: よろしくお願いします"
              />
              <p className="mt-3 text-sm font-semibold text-[#8A8186]">話者名があればそのまま分割し、なければ不明として保存します。</p>
            </div>
          )}
        </section>
        <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
          {mode === "meeting_transcript" ? (
            <div className="mb-4">
              <Field label="カレンダー予定から反映">
                <SearchSelect
                  clearable
                  emptyLabel="カレンダー予定がありません。"
                  options={calendarEvents.map((event) => ({ value: event.id, label: event.title || "無題の予定", description: formatCalendarEventOption(event) }))}
                  placeholder="予定を選択すると日時などを自動反映"
                  value={form.calendarEventId}
                  onChange={selectCalendarEvent}
                />
              </Field>
              {selectedCalendarEvent ? (
                <p className="mt-2 text-xs font-bold leading-5 text-[#8A8186]">
                  反映元: {selectedCalendarEvent.title || "無題の予定"} / {formatRecordDateTime(selectedCalendarEvent.startAt.toDate())}
                  {selectedCalendarEvent.location ? ` / ${selectedCalendarEvent.location}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mb-4">
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
                会社名: {selectedCompany.name} / 業種: {selectedCompany.industry || "未設定"} / 所在地: {selectedCompany.address || "未設定"} / 関連商材: {selectedCompany.productNames?.join(" / ") || "未設定"} / 同行者: {selectedCompany.companionNames?.join(" / ") || "なし"} / 先方担当者: {formatCompanyContact(getCompanyPrimaryContact(selectedCompany))} / 電話番号: {getCompanyPrimaryContact(selectedCompany)?.phone || selectedCompany.phone || "未登録"}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="会社名" required><input className="task-input" value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></Field>
            <Field label="先方担当者" required><input className="task-input" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} /></Field>
            <Field label={mode === "teleapo_audio" ? "電話日時" : "商談日時"} required><input className="task-input" type="datetime-local" value={form.recordedAt} onChange={(event) => setForm((current) => ({ ...current, recordedAt: event.target.value }))} /></Field>
            <Field label="関連商材" required>
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
            <Field label="所在地"><input className="task-input" value={form.companyAddress} onChange={(event) => setForm((current) => ({ ...current, companyAddress: event.target.value }))} /></Field>
            <Field label="役職"><input className="task-input" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} /></Field>
            <Field label="電話番号"><input className="task-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
          </div>
          <div className="mt-4 grid gap-4">
            <MultiSelect
              emptyLabel="Authユーザーを取得できませんでした。"
              label="同行者"
              options={members.map((member) => ({ value: member.uid, label: member.name, description: member.email }))}
              placeholder="メンバーを選択"
              values={form.attendeeUserIds}
              onChange={(attendeeUserIds) => setForm((current) => ({ ...current, attendeeUserIds, attendeeNames: members.filter((member) => attendeeUserIds.includes(member.uid)).map((member) => member.name).join(", ") }))}
            />
          </div>
          {mode === "meeting_transcript" ? (
            <section className="mt-5 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-[#2B2B2B]">商談メモ</h3>
                <p className="mt-1 text-xs font-bold text-[#8A8186]">商談フェーズと営業目線のメモだけ残します。細かいやり取りは会社の活動ログに追加できます。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="商談の種類">
                  <Select
                    value={form.diagnosisMeetingPhase}
                    options={[["first", "初商談"], ["second", "2回目"], ["pre_contract", "契約前"], ["continued", "継続商談"], ["", "未選択"]]}
                    onChange={(value) => setForm((current) => ({ ...current, diagnosisMeetingPhase: value as typeof current.diagnosisMeetingPhase }))}
                  />
                </Field>
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
                <div className="sm:col-span-2">
                  <Field label="営業メモ">
                    <textarea className="task-input min-h-40 resize-y" placeholder="刺さったポイント、懸念点、相手の反応、終わり方などを自由に記録" value={form.diagnosisResonatedPoint} onChange={(event) => setForm((current) => ({ ...current, diagnosisResonatedPoint: event.target.value }))} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="次回やること">
                    <textarea className="task-input min-h-28 resize-y" placeholder="例: 3営業日後にメール、見積を送る、次回商談で決裁者確認など" value={form.diagnosisNextAction} onChange={(event) => setForm((current) => ({ ...current, diagnosisNextAction: event.target.value }))} />
                  </Field>
                </div>
              </div>
            </section>
          ) : null}
          <div className="mt-4"><StatusBanner message={error} type="error" /></div>
          <button className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-none bg-[#EC6F8B] text-sm font-bold text-white disabled:opacity-50" disabled={!canSubmit || isSubmitting} onClick={() => void submit()} type="button">
            {isSubmitting ? <LoadingSpinner label="保存中" /> : <UploadCloud className="h-4 w-4" />}
            {mode === "teleapo_audio" ? "アップロードして話者分離へ" : "保存して話者確認へ"}
          </button>
        </section>
      </div>
    </div>
  );
}

export function SpeakerWorkspace({
  record,
  product,
  isProcessing,
  isGeneratingAdvice,
  message,
  error,
  compactReview = false,
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
  compactReview?: boolean;
  onStartProcessing: () => Promise<void>;
  onSaveLogs: (logs: ConversationLog[]) => Promise<boolean>;
  onGenerateAdvice: () => Promise<void>;
}) {
  const [logs, setLogs] = useState<ConversationLog[]>(splitConversationLogsIntoBlocks(record.conversationLogs));
  const [areLogsLocked, setLogsLocked] = useState(Boolean(record.conversationLogsLocked) || record.aiAdviceStatus === "completed");
  const [isSavingLabels, setSavingLabels] = useState(false);

  const updateLog = (id: string, patch: Partial<ConversationLog>) => setLogs((current) => current.map((log) => (log.id === id ? { ...log, ...patch } : log)));
  const saveSpeakerLabels = async () => {
    setSavingLabels(true);
    try {
      const saved = await onSaveLogs(logs);
      if (saved) setLogsLocked(true);
    } finally {
      setSavingLabels(false);
    }
  };
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
  const isTranscriptionCompleted = record.transcriptionStatus === "completed";
  const isAdviceCompleted = record.aiAdviceStatus === "completed" && Boolean(record.aiAdvice);
  const canCreateAnalysis = isTranscriptionCompleted && logs.length > 0;
  const showProcessingActions = !isAdviceCompleted;
  const hasMeetingPreparation = Boolean(record.aiAdvice?.meetingPreparation);

  return (
    <div className={hasMeetingPreparation ? "space-y-4" : ""}>
      {!hasMeetingPreparation ? (
        <PageHeader
          title={record.customerName}
          description={`${record.productName} / ${record.contactName}`}
          actions={
          showProcessingActions ? (
            <div className="flex flex-wrap gap-2">
              {!isTranscriptionCompleted ? (
                <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-5 text-sm font-bold text-[#6F676B]" disabled={isProcessing} onClick={() => void onStartProcessing()} type="button">
                  {isProcessing ? <LoadingSpinner label="処理中" /> : <Mic2 className="h-4 w-4" />}
                  話者分離を開始
                </button>
              ) : null}
              {isTranscriptionCompleted ? (
                <button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={!canCreateAnalysis || isGeneratingAdvice} onClick={() => void onGenerateAdvice()} type="button">
                  {isGeneratingAdvice ? <LoadingSpinner label="作成中" /> : <Sparkles className="h-4 w-4" />}
                  分析結果を作成
                </button>
              ) : null}
            </div>
          ) : null
          }
        />
      ) : null}
      {hasMeetingPreparation ? (
        <>
          <StatusBanner message={message} type="success" />
          <StatusBanner message={error} type="error" />
          {isGeneratingAdvice ? <AIProcessingCard compact steps={["顧客情報を整理中", "商材情報を確認中", "トークスクリプトを作成中", "次アクションを整理中"]} /> : null}
          {record.aiAdvice ? <AdvicePanel isRegenerating={isGeneratingAdvice} onRegenerate={onGenerateAdvice} record={record} /> : null}
        </>
      ) : (
        <div className={`mt-5 grid gap-5 ${record.aiAdvice ? "xl:grid-cols-[36%_1fr]" : ""}`}>
          <section className="space-y-4">
            {!compactReview ? <ProcessSteps status={record.transcriptionStatus} /> : null}
            <InfoCard title="保存情報" rows={[[record.salesDomain === "teleapo" ? "電話日時" : "商談日時", formatRecordDateTime(record.recordedAt.toDate())], ["顧客", record.customerName], ["担当", record.contactName], ["商材", record.productName], ["商材情報", product ? "登録済み" : "未登録"]]} />
            {isGeneratingAdvice ? <AIProcessingCard compact steps={["会話ログを保存中", "内容を整理中", "分析済み一覧へ反映中"]} /> : null}
            <StatusBanner message={message} type="success" />
            <StatusBanner message={error} type="error" />
            <ConversationLogPanel
              locked={areLogsLocked}
              isSaving={isSavingLabels || isGeneratingAdvice}
              logs={logs}
              onSave={saveSpeakerLabels}
              onSplit={splitLog}
              onUpdate={updateLog}
            />
            {isGeneratingAdvice ? <AIProcessingCard compact steps={["顧客情報を整理中", "商材情報を確認中", "トークスクリプトを作成中", "次アクションを整理中"]} /> : null}
          </section>
          {record.aiAdvice ? <AdvicePanel isRegenerating={isGeneratingAdvice} onRegenerate={onGenerateAdvice} record={record} /> : null}
        </div>
      )}
    </div>
  );
}

function AdvicePanel({ isRegenerating, onRegenerate, record }: { isRegenerating: boolean; onRegenerate: () => Promise<void>; record: TeleapoRecord }) {
  const advice = record.aiAdvice;
  if (!advice) return null;
  if (advice.meetingPreparation) return <MeetingPreparationPanel analysis={advice.meetingPreparation} isRegenerating={isRegenerating} onRegenerate={onRegenerate} record={record} />;
  if (record.salesDomain === "meeting") return <MeetingFollowupPanel advice={advice} />;
  const prospectRank = advice.prospectRank ?? scoreToRank(advice.prospectScore);
  const rankReason = advice.rankReason || advice.scoreReason;
  return (
    <section className="mt-5 rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <h3 className="text-2xl font-bold text-[#2B2B2B]">テレアポ分析</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Metric title="見込みランク" value={`${prospectRank} / ${advice.prospectScore}`} />
        <Metric title="温度感" value={formatTemperature(advice.temperature)} />
        <Metric title="追うタイミング" value={formatUrgency(advice.nextActionUrgency)} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <TextBlock title="要約" items={[advice.summary, rankReason]} />
        <TextBlock title="温度感の根拠" items={[advice.temperatureReason ?? advice.scoreReason]} />
        <TextBlock title="課題・懸念" items={[...advice.customerIssues, ...advice.concerns]} />
        <TextBlock title="日程調整電話" items={[...advice.scheduleCallScript.candidates.map(formatScheduleCandidate), advice.scheduleCallScript.script]} />
        <TextBlock title="必要資料" items={advice.materials} />
        <TextBlock title="当日打ち合わせ" items={[...advice.meetingScript.greeting, ...advice.meetingScript.hearing, ...advice.meetingScript.proposal, ...advice.meetingScript.nextAction]} />
        <TextBlock title="次にやること" items={advice.nextActions} />
      </div>
    </section>
  );
}

function MeetingFollowupPanel({ advice }: { advice: NonNullable<TeleapoRecord["aiAdvice"]> }) {
  const prospectRank = advice.prospectRank ?? scoreToRank(advice.prospectScore);
  const rankReason = advice.rankReason || advice.scoreReason;
  return (
    <section className="mt-5 rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#EC6F8B]">商談後フォロー分析</p>
          <h3 className="mt-1 text-2xl font-bold text-[#2B2B2B]">振り返りと次の追客</h3>
        </div>
        <span className="rounded-none bg-[#FFF0F3] px-3 py-1.5 text-xs font-bold text-[#EC6F8B]">商談後AI</span>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <Metric title="見込みランク" value={prospectRank} />
        <Metric title="見込みスコア" value={`${advice.prospectScore}`} />
        <Metric title="フォロー判断" value={advice.shouldFollowUp ? "フォローする" : "追わない"} />
        <Metric title="追うタイミング" value={formatUrgency(advice.nextActionUrgency || advice.followupTiming)} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <TextBlock title="商談要約" items={[advice.summary]} />
        <TextBlock title="ランク判定理由" items={[rankReason]} />
        <TextBlock title="良かった点" items={advice.positives ?? []} />
        <TextBlock title="ダメだった点・弱かった点" items={advice.negatives ?? []} />
        <TextBlock title="顧客が前向きだった発言" items={advice.positiveCustomerSignals ?? []} />
        <TextBlock title="顧客が迷っていた発言" items={advice.hesitationSignals ?? []} />
        <TextBlock title="決まりそうな条件" items={advice.closingRequirements ?? []} />
        <TextBlock title="足りない情報" items={advice.missingInformation ?? []} />
        <TextBlock title="成約のために必要なもの" items={[...(advice.requiredMaterials ?? []), ...(advice.additionalMaterials ?? [])]} />
        <TextBlock title="失注リスク" items={advice.lostRisks ?? []} />
        <TextBlock title="成約に近い理由" items={advice.closeReasons ?? []} />
        <TextBlock title="追っかけ方針" items={[
          advice.shouldFollowUp ? "フォローアップする" : "フォローアップしない",
          `理由: ${advice.followUpReason ?? "未確認"}`,
          `いつするか: ${formatUrgency(advice.nextActionUrgency || advice.followupTiming) || "未確認"}`,
          `タイミングの理由: ${advice.followupTimingReason ?? "未確認"}`,
          `方法: ${formatFollowUpMethod(advice.followUpMethod)}`
        ]} />
        <TextBlock title="電話で伝えること" items={[advice.followupCallScript ?? ""]} />
        <TextBlock title="メール文面" items={[advice.followupEmail ?? ""]} />
        <TextBlock title="次回商談で確認すること" items={advice.nextMeetingQuestions ?? []} />
        <TextBlock title="次に送る資料" items={[...(advice.materials ?? []), ...(advice.requiredMaterials ?? []), ...(advice.additionalMaterials ?? [])]} />
        <TextBlock title="次アクション" items={advice.nextActions ?? []} />
      </div>
    </section>
  );
}

function MeetingPreparationPanel({ analysis, isRegenerating, onRegenerate, record }: { analysis: MeetingPreparationAnalysis; isRegenerating: boolean; onRegenerate: () => Promise<void>; record: TeleapoRecord }) {
  const sections = [
    ["schedule", "日程調整"],
    ["script", "商談スクリプト"],
    ["questions", "質問"],
    ["objections", "反論対策"],
    ["closing", "クロージング"],
    ["preparation", "準備資料"],
    ["actions", "タスク"]
  ] as const;
  type DashboardTab = (typeof sections)[number][0];
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab>("schedule");
  const primaryScript = [
    analysis.schedulingCall.opening,
    analysis.schedulingCall.previousCallReference,
    analysis.schedulingCall.purposeConfirmation,
    analysis.schedulingCall.dateProposalScript,
    analysis.schedulingCall.durationGuide,
    analysis.schedulingCall.participantConfirmation,
    analysis.schedulingCall.meetingFormatConfirmation,
    analysis.schedulingCall.closing
  ].filter(Boolean);
  const requiredMaterials = [...analysis.preparation.requiredMaterials, ...analysis.proposalStrategy.recommendedMaterials].slice(0, 5);
  const dashboardTasks = analysis.nextActions.slice(0, 5);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-[#F0DEE2] bg-white px-5 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-[#6F676B]">
          <span>商談準備AI</span>
          <ChevronRight className="h-4 w-4 text-[#C9BFC4]" />
          <span className="truncate text-[#2B2B2B]">{analysis.overview.companyName || record.customerName}（{analysis.overview.productName || record.productName}）</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-xs font-bold text-[#6F676B] disabled:opacity-50" disabled={isRegenerating} onClick={() => void onRegenerate()} type="button">
            {isRegenerating ? <LoadingSpinner label="再生成中" /> : <RotateCcw className="h-4 w-4" />}
            再生成
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-xs font-bold text-[#6F676B]" type="button">
            <Download className="h-4 w-4" />
            PDF出力
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-4 text-xs font-bold text-[#6F676B]" type="button">
            <Share2 className="h-4 w-4" />
            共有
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-xs font-bold text-white" type="button">
            <Sparkles className="h-4 w-4" />
            商談準備完了
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-none border border-[#F0DEE2] bg-white text-[#6F676B]" onClick={() => window.print()} type="button" aria-label="その他">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.8fr_0.8fr]">
          <div className="flex gap-4">
            <Image alt="" className="h-20 w-20 rounded-xl object-contain" height={80} src="/m-dev-2.png" width={80} priority />
            <div className="min-w-0">
              <h3 className="truncate text-2xl font-bold text-[#2B2B2B]">{analysis.overview.companyName || record.customerName}</h3>
              <p className="mt-1 text-sm font-bold text-[#8A8186]">{analysis.overview.productName || record.productName}</p>
              <p className="mt-2 text-lg font-bold text-[#2B2B2B]">{analysis.overview.contactName || record.contactName} 様</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-[#F0DEE2] text-sm font-semibold text-[#6F676B] xl:border-l xl:pl-5">
            <OverviewFact icon={<Building2 className="h-4 w-4" />} label="業種" value={analysis.overview.industry} />
            <OverviewFact icon={<UserRound className="h-4 w-4" />} label="役職" value={analysis.overview.contactRole} />
            <OverviewFact icon={<CalendarDays className="h-4 w-4" />} label={record.salesDomain === "teleapo" ? "電話日時" : "商談日時"} value={analysis.overview.callDate || formatRecordDateTime(record.recordedAt.toDate())} />
            <OverviewFact icon={<Clock3 className="h-4 w-4" />} label="音声時間" value={analysis.overview.audioDuration || formatDuration(record.audioDurationSec)} />
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-[#F0DEE2] text-sm font-semibold text-[#6F676B] xl:border-l xl:pl-5">
            <OverviewFact icon={<CheckCircle2 className="h-4 w-4" />} label="商談ステータス" value={formatMeetingStatus(analysis.overview.meetingStatus)} accent />
            <OverviewFact icon={<UserRound className="h-4 w-4" />} label="担当営業" value={analysis.overview.salesRep} />
            <OverviewFact icon={<Clock3 className="h-4 w-4" />} label="最終更新" value={analysis.generatedAt} />
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_280px]">
          <AudioSummaryCard record={record} />
          <CompanySummaryCard analysis={analysis} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <ScoreSummaryCard analysis={analysis} />
          <ContactSummaryCard analysis={analysis} />
          <IssueSummaryCard analysis={analysis} />
          <ProposalSummaryCard analysis={analysis} />
        </div>

        <div className="rounded-none border border-[#F0DEE2] bg-white shadow-sm">
          <div className="flex overflow-x-auto border-b border-[#F0DEE2]">
            {sections.map(([id, label]) => (
              <button
                className={`shrink-0 border-b-2 px-6 py-4 text-sm font-bold transition ${activeDashboardTab === id ? "border-[#EC6F8B] text-[#EC6F8B]" : "border-transparent text-[#6F676B] hover:text-[#EC6F8B]"}`}
                key={id}
                onClick={() => setActiveDashboardTab(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeDashboardTab === "schedule" ? <DashboardScriptCard id="schedule" title="日程調整電話スクリプト" badge="AI生成" lines={primaryScript} /> : null}
            {activeDashboardTab === "script" ? <MeetingFlowCard analysis={analysis} /> : null}
            {activeDashboardTab === "questions" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <QuestionList title="必ず聞く質問" items={analysis.questions.required} />
                <QuestionList title="深掘り質問" items={analysis.questions.deepDive} />
                <QuestionList title="数字確認" items={analysis.questions.numerical} />
                <QuestionList title="決裁確認" items={analysis.questions.decision} />
                <QuestionList title="クロージング質問" items={analysis.questions.closing} />
              </div>
            ) : null}
            {activeDashboardTab === "objections" ? (
              <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-4">
                  <ScriptCard title="オープニングトーク" lines={[analysis.openingTalk]} />
                  <ScriptCard title="提案トーク" lines={[analysis.proposalTalk]} />
                </div>
                <ObjectionList items={analysis.objections} />
              </div>
            ) : null}
            {activeDashboardTab === "closing" ? (
              <div className="grid gap-4 xl:grid-cols-3">
                <TextBlock title="温度感 高め" items={[analysis.closingTalk.high]} />
                <TextBlock title="温度感 普通" items={[analysis.closingTalk.middle]} />
                <TextBlock title="温度感 低め" items={[analysis.closingTalk.low]} />
                <div className="xl:col-span-3">
                  <RiskList items={analysis.riskPoints} />
                </div>
                <div className="xl:col-span-3">
                  <TextBlock title="勝ち筋" items={analysis.winningPoints} />
                </div>
              </div>
            ) : null}
            {activeDashboardTab === "preparation" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <CompactMaterialCard id="preparation" items={requiredMaterials} />
                <MaterialList title="必須資料" items={analysis.preparation.requiredMaterials} />
                <MaterialList title="あると良い資料" items={analysis.preparation.optionalMaterials} />
                <TaskList title="事前調査タスク" items={analysis.preparation.requiredResearch} />
              </div>
            ) : null}
            {activeDashboardTab === "actions" ? <CompactTaskCard id="actions" items={dashboardTasks} /> : null}
          </div>
        </div>
      </div>

      <details className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-bold text-[#2B2B2B]">詳細分析を開く</summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <PlaybookSection id="score" title="見込み診断" defaultOpen>
            <TextBlock title="ランク判定理由" items={[analysis.prospectScore.reason]} />
            <div className="grid gap-3 lg:grid-cols-2">
              <EvidenceList title="良い要素" items={analysis.prospectScore.positiveSignals} />
              <EvidenceList title="弱い要素" items={analysis.prospectScore.negativeSignals} />
            </div>
            <TextBlock title="足りない情報" items={analysis.prospectScore.missingInformation} />
          </PlaybookSection>

          <PlaybookSection id="contact" title="相手・担当者分析">
            <InfoGrid rows={[
              ["タイプ", analysis.contactAnalysis.type.join(" / ")],
              ["意思決定スタイル", analysis.contactAnalysis.decisionStyle],
              ["営業への警戒度", analysis.contactAnalysis.salesResistance],
              ["数字への関心", analysis.contactAnalysis.numericalInterest],
              ["理解度", analysis.contactAnalysis.comprehensionLevel],
              ["会話主導権", analysis.contactAnalysis.conversationControl],
              ["信頼度", `${Math.round(analysis.contactAnalysis.confidence * 100)}%`]
            ]} />
            <div className="grid gap-3 lg:grid-cols-2">
              <TextBlock title="反応が良い話題" items={analysis.contactAnalysis.interestedTopics} />
              <TextBlock title="反応が弱い話題" items={analysis.contactAnalysis.weakReactionTopics} />
              <TextBlock title="推奨話法" items={analysis.contactAnalysis.communicationRecommendations} />
              <TextBlock title="避ける話法" items={analysis.contactAnalysis.avoid} />
            </div>
            <EvidenceList title="根拠" items={analysis.contactAnalysis.evidence} />
          </PlaybookSection>

          <PlaybookSection id="issues" title="課題分析">
            <IssueList title="表面的課題" items={analysis.issues.explicit} />
            <IssueList title="本質的課題" items={analysis.issues.essential} />
            <IssueList title="潜在課題" items={analysis.issues.latent} />
          </PlaybookSection>

          <PlaybookSection id="proposal" title="提案方針">
            <TextBlock title="中心テーマ" items={[analysis.proposalStrategy.mainTheme]} />
            <ProposalList items={analysis.proposalStrategy.proposalPriority} />
            <div className="grid gap-3 lg:grid-cols-2">
              <TextBlock title="勝ち筋" items={analysis.proposalStrategy.winningApproach} />
              <TextBlock title="避ける提案" items={analysis.proposalStrategy.avoidProposals} />
              <TextBlock title="事例候補" items={analysis.proposalStrategy.recommendedCaseStudies} />
              <TextBlock title="見せる数字" items={analysis.proposalStrategy.metricsToShow} />
              <TextBlock title="最初に見せる機能" items={[analysis.proposalStrategy.firstFeature]} />
              <TextBlock title="最初に見せる資料" items={[analysis.proposalStrategy.firstMaterial]} />
            </div>
            <MaterialList title="推奨資料" items={analysis.proposalStrategy.recommendedMaterials} />
          </PlaybookSection>

          <PlaybookSection id="schedule" title="日程調整電話">
            <ScriptCard title="そのまま読める流れ" lines={[analysis.schedulingCall.opening, analysis.schedulingCall.previousCallReference, analysis.schedulingCall.purposeConfirmation, analysis.schedulingCall.dateProposalScript, analysis.schedulingCall.durationGuide, analysis.schedulingCall.participantConfirmation, analysis.schedulingCall.meetingFormatConfirmation, analysis.schedulingCall.closing]} />
            <BranchList title="質問への返答" items={analysis.schedulingCall.questionResponses} />
            <div className="grid gap-3 lg:grid-cols-2">
              <TextBlock title="留守電" items={[analysis.schedulingCall.voicemail]} />
              <TextBlock title="再架電" items={[analysis.schedulingCall.retryCall]} />
            </div>
          </PlaybookSection>

          <PlaybookSection id="preparation" title="商談準備">
            <TextBlock title="商談ゴール" items={[analysis.preparation.meetingGoal]} />
            <div className="grid gap-3 lg:grid-cols-2">
              <TextBlock title="目的" items={analysis.preparation.objectives} />
              <TextBlock title="当日までに決めること" items={analysis.preparation.mustDecideByEnd} />
              <TextBlock title="準備する数字" items={analysis.preparation.requiredNumbers} />
              <TextBlock title="準備するデモ" items={analysis.preparation.requiredDemos} />
              <TextBlock title="社内確認" items={analysis.preparation.internalChecks} />
            </div>
            <MaterialList title="必須資料" items={analysis.preparation.requiredMaterials} />
            <MaterialList title="あると良い資料" items={analysis.preparation.optionalMaterials} />
            <MaterialList title="見せない資料" items={analysis.preparation.avoidMaterials} />
            <TaskList title="事前調査タスク" items={analysis.preparation.requiredResearch} />
          </PlaybookSection>

          <PlaybookSection id="questions" title="打ち合わせで確認する質問">
            <QuestionList title="必ず聞く質問" items={analysis.questions.required} />
            <QuestionList title="深掘り質問" items={analysis.questions.deepDive} />
            <QuestionList title="数字確認" items={analysis.questions.numerical} />
            <QuestionList title="決裁確認" items={analysis.questions.decision} />
            <QuestionList title="クロージング質問" items={analysis.questions.closing} />
          </PlaybookSection>

          <PlaybookSection id="script" title="30分商談トークスクリプト">
            <ScriptSectionView title="冒頭" section={analysis.meetingScript.opening} />
            <ScriptSectionView title="ヒアリング" section={analysis.meetingScript.hearing} />
            <ScriptSectionView title="課題整理" section={analysis.meetingScript.issueSummary} />
            <ScriptSectionView title="提案" section={analysis.meetingScript.proposal} />
            <ScriptSectionView title="デモ" section={analysis.meetingScript.demo} />
            <ScriptSectionView title="料金" section={analysis.meetingScript.pricing} />
            <ScriptSectionView title="クロージング" section={analysis.meetingScript.closing} />
          </PlaybookSection>

          <PlaybookSection id="objections" title="反論対策">
            <ScriptCard title="オープニングトーク" lines={[analysis.openingTalk]} />
            <ScriptCard title="提案トーク" lines={[analysis.proposalTalk]} />
            <ObjectionList items={analysis.objections} />
          </PlaybookSection>

          <PlaybookSection id="closing" title="クロージング">
            <div className="grid gap-3 lg:grid-cols-3">
              <TextBlock title="温度感 高め" items={[analysis.closingTalk.high]} />
              <TextBlock title="温度感 普通" items={[analysis.closingTalk.middle]} />
              <TextBlock title="温度感 低め" items={[analysis.closingTalk.low]} />
            </div>
            <RiskList items={analysis.riskPoints} />
            <TextBlock title="勝ち筋" items={analysis.winningPoints} />
          </PlaybookSection>

          <PlaybookSection id="actions" title="次回アクション" defaultOpen>
            <TaskList title="タスク候補" items={analysis.nextActions} />
            <CopyButton text={analysis.nextActions.map((task) => `${task.title} / ${task.dueDate} / ${task.completionCondition}`).join("\n")} label="タスク候補をコピー" />
          </PlaybookSection>
        </div>
      </details>
    </section>
  );
}

function OverviewFact({ accent = false, icon, label, value }: { accent?: boolean; icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 text-[#9A8F94]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-[#9A8F94]">{label}</p>
        <p className={`mt-1 truncate ${accent ? "text-[#EC6F8B]" : "text-[#4D464A]"}`}>{value || "未確認"}</p>
      </div>
    </div>
  );
}

function AudioSummaryCard({ record }: { record: TeleapoRecord }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#2B2B2B]">通話音声</p>
        <span className="text-xs font-bold text-[#9A8F94]">{formatDuration(record.audioDurationSec)}</span>
      </div>
      {record.audioDownloadUrl ? (
        <audio className="mt-3 w-full" controls src={record.audioDownloadUrl} />
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-none bg-white px-4 py-3 text-sm font-bold text-[#8A8186]">
          <Play className="h-4 w-4" />
          音声ファイル未登録
        </div>
      )}
      <a className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-none border border-[#F0DEE2] bg-white text-sm font-bold text-[#6F676B]" href="#conversation-log">
        文字起こしを開く
      </a>
    </div>
  );
}

function CompanySummaryCard({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#2B2B2B]">会社情報</p>
        <CopyButton text={analysis.overview.companyLink} label="HPをコピー" />
      </div>
      <div className="mt-3 space-y-2 text-sm font-semibold text-[#6F676B]">
        <p><span className="mr-2 text-[#9A8F94]">業種:</span>{analysis.overview.industry || "未確認"}</p>
        <p><span className="mr-2 text-[#9A8F94]">商材:</span>{analysis.overview.productName || "未確認"}</p>
        <p><span className="mr-2 text-[#9A8F94]">参照元:</span>{analysis.sources.length ? analysis.sources.slice(0, 2).join(" / ") : "未確認"}</p>
      </div>
    </div>
  );
}

function ScoreSummaryCard({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h4 className="text-lg font-bold text-[#2B2B2B]">見込み診断</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">AI分析</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <p className="text-6xl font-black leading-none text-[#EC6F8B]">{analysis.prospectScore.rank}</p>
        <div className="text-right text-sm font-bold text-[#6F676B]">
          <p>推定受注確度 <span className="text-2xl text-[#2B2B2B]">{analysis.prospectScore.estimatedCloseProbability}%</span></p>
          <p className="mt-2">温度感: <span className="text-[#EC6F8B]">{analysis.prospectScore.temperatureLabel || formatTemperature(analysis.prospectScore.temperature)}</span></p>
          <p className="mt-1">推奨フォロー: {formatUrgency(analysis.prospectScore.followUpTiming)}</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-none bg-[#F5E8EC]">
        <div className="h-full rounded-none bg-[#EC6F8B]" style={{ width: `${Math.max(0, Math.min(100, analysis.prospectScore.score))}%` }} />
      </div>
      <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-[#6F676B]">{analysis.prospectScore.reason}</p>
    </div>
  );
}

function ContactSummaryCard({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h4 className="text-lg font-bold text-[#2B2B2B]">担当者分析</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">AI分析</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {analysis.contactAnalysis.type.slice(0, 4).map((item) => (
          <span className="rounded-none bg-[#F1F7FB] px-3 py-1 text-xs font-bold text-[#526B7A]" key={item}>{item}</span>
        ))}
      </div>
      <div className="mt-4 grid gap-2 rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold text-[#6F676B]">
        <p><span className="mr-2 text-[#9A8F94]">推奨話法</span>{analysis.contactAnalysis.communicationRecommendations.slice(0, 2).join(" / ") || "未確認"}</p>
        <p><span className="mr-2 text-[#9A8F94]">避ける話法</span>{analysis.contactAnalysis.avoid.slice(0, 2).join(" / ") || "未確認"}</p>
        <p><span className="mr-2 text-[#9A8F94]">数字関心</span>{analysis.contactAnalysis.numericalInterest || "未確認"}</p>
      </div>
    </div>
  );
}

function IssueSummaryCard({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const columns = [
    ["表面的な課題", analysis.issues.explicit],
    ["本質的な課題", analysis.issues.essential],
    ["潜在課題", analysis.issues.latent]
  ] as const;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h4 className="text-lg font-bold text-[#2B2B2B]">課題分析</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">AI分析</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {columns.map(([title, items]) => (
          <div className="rounded-none bg-[#FFFBFC] p-3" key={title}>
            <p className="text-xs font-bold text-[#9A8F94]">{title}</p>
            <ul className="mt-2 space-y-1 text-xs font-semibold leading-5 text-[#5F585C]">
              {items.slice(0, 3).map((item) => <li key={item.title}>・{item.title}</li>)}
              {items.length === 0 ? <li>未確認</li> : null}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalSummaryCard({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h4 className="text-lg font-bold text-[#2B2B2B]">提案方針</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">AI分析</span>
      </div>
      <p className="mt-3 rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#5F585C]">{analysis.proposalStrategy.mainTheme || "未確認"}</p>
      <div className="mt-3 space-y-2">
        {analysis.proposalStrategy.proposalPriority.slice(0, 5).map((item, index) => (
          <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2 text-sm font-semibold text-[#6F676B]" key={item.title}>
            <span className="grid h-6 w-6 place-items-center rounded bg-[#FFF0F3] text-xs font-bold text-[#EC6F8B]">{index + 1}</span>
            <span className="truncate">{item.title}</span>
            <span className="text-xs text-[#EC6F8B]">★ {item.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardScriptCard({ badge, id, lines, title }: { badge: string; id: string; lines: string[]; title: string }) {
  const scriptParts = lines.length ? lines : ["未確認"];
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4" id={`playbook-${id}`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">{badge}</span>
      </div>
      <div className="mt-4 max-h-[560px] space-y-4 overflow-auto pr-1">
        {scriptParts.map((line, index) => (
          <div className="relative border-l border-[#F5C4CE] pl-5" key={`${title}-${index}`}>
            <span className="absolute -left-2 top-0 grid h-4 w-4 place-items-center rounded-none bg-[#EC6F8B] text-[10px] font-bold text-white">{index + 1}</span>
            <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#5F585C]">{line}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <CopyButton text={scriptParts.join("\n\n")} label="コピー" />
        <button className="inline-flex h-9 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-3 text-xs font-bold text-[#6F676B]" type="button">
          <Mic2 className="h-3.5 w-3.5" />
          話し言葉にする
        </button>
      </div>
    </div>
  );
}

function MeetingFlowCard({ analysis }: { analysis: MeetingPreparationAnalysis }) {
  const flows = [
    ["0〜3分", "挨拶・本日の目的確認", analysis.meetingScript.opening.objective],
    ["3〜10分", "現状ヒアリング", analysis.meetingScript.hearing.objective],
    ["10〜15分", "課題整理・深掘り", analysis.meetingScript.issueSummary.objective],
    ["15〜22分", "提案内容の説明", analysis.meetingScript.proposal.objective],
    ["22〜26分", "事例・デモ", analysis.meetingScript.demo.objective],
    ["26〜29分", "料金・導入方法", analysis.meetingScript.pricing.objective],
    ["29〜30分", "次回アクション決定", analysis.meetingScript.closing.objective]
  ] as const;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4" id="playbook-script">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-[#2B2B2B]">商談スクリプト（30分）</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">AI生成</span>
      </div>
      <div className="mt-4 max-h-[560px] space-y-3 overflow-auto pr-1">
        {flows.map(([time, title, objective]) => (
          <div className="grid grid-cols-[72px_1fr] gap-3" key={time}>
            <p className="pt-3 text-xs font-bold text-[#8A8186]">{time}</p>
            <div className="rounded-none bg-white p-3">
              <p className="text-sm font-bold text-[#2B2B2B]">{title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#8A8186]">{objective || "未確認"}</p>
            </div>
          </div>
        ))}
      </div>
      <a className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-none border border-[#F0DEE2] bg-white text-xs font-bold text-[#6F676B]" href="#playbook-script">
        詳細スクリプトを開く
        <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function CompactMaterialCard({ id, items }: { id: string; items: MaterialItem[] }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4" id={`playbook-${id}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-[#2B2B2B]">準備資料</h4>
        <span className="rounded-none bg-[#F8EDF8] px-2 py-1 text-xs font-bold text-[#9B6BB5]">AI推薦</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={`${item.name}-${item.timing}`}>
            <FileText className="h-5 w-5 text-[#B995E0]" />
            <div className="min-w-0">
              <p className="truncate font-bold text-[#2B2B2B]">{item.name}</p>
              <p className="truncate text-xs text-[#9A8F94]">{item.timing || item.purpose}</p>
            </div>
            <PriorityBadge priority={item.priority} />
          </div>
        ))}
        {items.length === 0 ? <p className="rounded-none bg-white p-3 text-sm font-bold text-[#8A8186]">未確認</p> : null}
      </div>
    </div>
  );
}

function CompactTaskCard({ id, items }: { id: string; items: AnalysisTaskItem[] }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4" id={`playbook-${id}`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-[#2B2B2B]">次にやること（タスク）</h4>
        <button className="inline-flex h-8 items-center rounded-none border border-[#F0DEE2] bg-white px-3 text-xs font-bold text-[#6F676B]" type="button">+ タスク追加</button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <label className="grid grid-cols-[18px_1fr_auto] items-center gap-2 rounded-none bg-white p-2 text-xs font-semibold text-[#6F676B]" key={item.title}>
            <input className="accent-[#EC6F8B]" type="checkbox" />
            <span className="min-w-0">
              <span className="block truncate font-bold text-[#2B2B2B]">{item.title}</span>
              <span className="block truncate text-[#9A8F94]">{item.dueDate || "期限未確認"} / {item.owner || "担当未確認"}</span>
            </span>
            <PriorityBadge priority={item.priority} />
          </label>
        ))}
        {items.length === 0 ? <p className="rounded-none bg-white p-3 text-sm font-bold text-[#8A8186]">未確認</p> : null}
      </div>
      <CopyButton text={items.map((item) => `${item.title} / ${item.dueDate} / ${item.completionCondition}`).join("\n")} label="すべてコピー" />
    </div>
  );
}

function PlaybookSection({ id, title, children, defaultOpen = false }: { id: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4 open:bg-white" open={defaultOpen} id={`playbook-${id}`}>
      <summary className="cursor-pointer text-lg font-bold text-[#2B2B2B]">{title}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-2 text-sm font-semibold text-[#6F676B] md:grid-cols-2">
      {rows.map(([label, value]) => (
        <p className="rounded-none bg-[#FFFBFC] px-3 py-2" key={label}>
          <span className="mr-2 text-[#9A8F94]">{label}</span>
          {value || "未確認"}
        </p>
      ))}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const canCopy = text.trim().length > 0;
  return (
    <button
      className="inline-flex h-9 items-center gap-2 rounded-none border border-[#F0DEE2] bg-white px-3 text-xs font-bold text-[#6F676B] disabled:opacity-40"
      disabled={!canCopy}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      type="button"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "コピーしました" : label}
    </button>
  );
}

function EvidenceList({ title, items }: { title: string; items: EvidenceItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={`${title}-${index}`}>
            <p>{item.text}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">根拠: {item.sourceQuote || "未確認"} / 信頼度 {Math.round(item.confidence * 100)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: IssueItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={item.title}>
            <p className="font-bold text-[#2B2B2B]">{item.title} <PriorityBadge priority={item.priority} /></p>
            <p className="mt-2">{item.detail}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">根拠: {item.evidence || "未確認"}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">確認質問: {item.confirmationQuestion}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">提案へのつなげ方: {item.proposalConnection}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalList({ items }: { items: MeetingPreparationAnalysis["proposalStrategy"]["proposalPriority"] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">提案優先順位</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={item.title}>
            <p className="font-bold text-[#2B2B2B]">{item.title} <span className="text-[#EC6F8B]">{"★".repeat(Math.round(item.score))}</span></p>
            <p className="mt-2">{item.reason}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">話し方: {item.talkPoint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialList({ title, items }: { title: string; items: MaterialItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={`${title}-${item.name}`}>
            <p className="font-bold text-[#2B2B2B]">{item.name} <PriorityBadge priority={item.priority} /></p>
            <p className="mt-2">目的: {item.purpose}</p>
            <p className="mt-1 text-xs text-[#9A8F94]">出すタイミング: {item.timing}</p>
            <p className="mt-1 text-xs text-[#9A8F94]">ページ: {item.pages.length ? item.pages.join(" / ") : "未確認"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionList({ title, items }: { title: string; items: QuestionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={item.question}>
            <p className="font-bold text-[#2B2B2B]">{item.question}</p>
            <p className="mt-2">目的: {item.purpose}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">想定回答: {item.expectedAnswers.join(" / ") || "未確認"}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">切り返し: {item.followUps.join(" / ") || "未確認"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScriptCard({ title, lines }: { title: string; lines: string[] }) {
  const text = lines.filter(Boolean).join("\n\n");
  if (!text) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
        <CopyButton text={text} label="コピー" />
      </div>
      <div className="mt-3 whitespace-pre-wrap rounded-none bg-white p-3 text-sm font-semibold leading-7 text-[#5F585C]">{text}</div>
    </div>
  );
}

function BranchList({ title, items }: { title: string; items: Array<{ condition: string; response: string; nextAction: string }> }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={item.condition}>
            <p className="font-bold text-[#2B2B2B]">{item.condition}</p>
            <p className="mt-2">{item.response}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">次: {item.nextAction}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScriptSectionView({ title, section }: { title: string; section: ScriptSection }) {
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-bold text-[#2B2B2B]">{title} <span className="text-sm text-[#9A8F94]">{section.minutes}</span></h4>
        <CopyButton text={[...section.script, ...section.questions].join("\n")} label="コピー" />
      </div>
      <p className="mt-2 text-sm font-semibold text-[#6F676B]">目的: {section.objective}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <TextBlock title="台本" items={section.script} />
        <TextBlock title="質問" items={section.questions} />
        <TextBlock title="資料" items={section.materials} />
        <TextBlock title="注意点" items={section.cautions} />
      </div>
      <BranchList title="分岐" items={section.branches} />
    </div>
  );
}

function ObjectionList({ items }: { items: ObjectionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">反論と切り返し</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={item.objection}>
            <p className="font-bold text-[#2B2B2B]">{item.objection} <span className="text-xs text-[#EC6F8B]">発生確率 {item.probability}%</span></p>
            <p className="mt-2">背景: {item.background}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">避ける返答: {item.badResponse}</p>
            <p className="mt-2 rounded-none bg-[#FFF0F3] p-2 text-[#5F585C]">推奨返答: {item.recommendedResponse}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">次の質問: {item.followUpQuestion}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskList({ items }: { items: MeetingPreparationAnalysis["riskPoints"] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">危険ポイント</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div className="rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B]" key={item.title}>
            <p className="font-bold text-[#2B2B2B]">{item.title}</p>
            <p className="mt-2">理由: {item.reason}</p>
            <p className="mt-2 text-xs text-[#9A8F94]">予防: {item.prevention}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskList({ title, items }: { title: string; items: AnalysisTaskItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4">
      <h4 className="font-bold text-[#2B2B2B]">{title}</h4>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <label className="grid gap-2 rounded-none bg-white p-3 text-sm font-semibold text-[#6F676B] sm:grid-cols-[20px_1fr]" key={item.title}>
            <input className="mt-1 accent-[#EC6F8B]" type="checkbox" />
            <span>
              <span className="block font-bold text-[#2B2B2B]">{item.title} <PriorityBadge priority={item.priority} /></span>
              <span className="mt-1 block">担当: {item.owner || "未確認"} / 期限: {item.dueDate || "未確認"} / 状態: {formatTaskStatus(item.status)}</span>
              <span className="mt-1 block text-xs text-[#9A8F94]">完了条件: {item.completionCondition}</span>
              <span className="mt-1 block text-xs text-[#9A8F94]">関連資料: {item.relatedMaterials.join(" / ") || "未確認"}</span>
              <span className="mt-1 block text-xs text-[#9A8F94]">手動対応: {item.manualRequired.join(" / ") || "なし"} / AI作成: {item.aiCanGenerate ? "可" : "不可"}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const label = priority === "high" ? "重要" : priority === "medium" ? "通常" : "低め";
  return <span className="ml-2 rounded-none bg-[#FFF0F3] px-2 py-0.5 text-xs font-bold text-[#EC6F8B]">{label}</span>;
}

function formatTaskStatus(status: string): string {
  if (status === "todo") return "未着手";
  if (status === "doing") return "進行中";
  if (status === "done") return "完了";
  return "未確認";
}

function scoreToRank(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B+";
  if (score >= 55) return "B";
  if (score >= 35) return "B-";
  return "C";
}

function formatTemperature(temperature?: string): string {
  if (temperature === "high") return "高め";
  if (temperature === "middle") return "普通";
  if (temperature === "low") return "低め";
  return "未設定";
}

function formatMeetingStatus(status?: string): string {
  if (!status) return "未設定";
  const normalized = status.trim().toLowerCase();
  const labels: Record<string, string> = {
    scheduled: "商談予定",
    booked: "商談予定",
    appointment: "商談予定",
    confirmed: "商談確定",
    completed: "商談済み",
    done: "商談済み",
    finished: "商談済み",
    pending: "未確定",
    undecided: "未確定",
    none: "未設定",
    cancelled: "キャンセル",
    canceled: "キャンセル",
    lost: "失注",
    contracted: "契約済み",
    considering: "検討中"
  };
  return labels[normalized] ?? status;
}

function formatScheduleCandidate(candidate: { label: string; datetime: string; reason: string }): string {
  return `${candidate.label}: ${formatScheduleDateTime(candidate.datetime)}（${candidate.reason}）`;
}

function formatScheduleDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
  const start = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const endDate = new Date(date.getTime() + 60 * 60 * 1000);
  const end = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(endDate);
  return `${dateLabel} ${start}-${end}`;
}

function formatRecordDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatCalendarEventOption(event: CalendarEvent): string {
  return [
    formatRecordDateTime(event.startAt.toDate()),
    event.companyName,
    event.location
  ].filter(Boolean).join(" / ");
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "未確認";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}分${String(remainingSeconds).padStart(2, "0")}秒`;
}

function createAnalysisDealHref(record: TeleapoRecord): string {
  return `/sales/analysis?dealId=${createAnalysisDealId(record)}`;
}

function createAnalysisDealId(record: TeleapoRecord): string {
  return [record.companyId || record.customerName || "unknown-company", record.productId || record.productName || "unknown-product"].map(encodeURIComponent).join("__");
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
    ["分析済み一覧に反映可能", status === "completed"]
  ] as const;
  return (
    <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-xl font-bold text-[#2B2B2B]">処理ステップ</h3>
      <div className="space-y-3">
        {steps.map(([label, completed], index) => (
          <div className="flex items-center gap-3" key={label}>
            <span className={`grid h-8 w-8 place-items-center rounded-none ${completed ? "bg-[#EC6F8B] text-white" : "bg-[#FFF0F3] text-[#EC6F8B]"}`}>{completed ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span>
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
        {required ? <span className="h-1.5 w-1.5 rounded-none bg-[#EC6F8B]" aria-label="必須" /> : null}
      </span>
      {children}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <SingleSelect options={options.map(([nextValue, label]) => ({ value: nextValue, label }))} value={value} onChange={onChange} />;
}

function InfoCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-none border border-[#F0DEE2] bg-white p-5 shadow-sm"><h3 className="mb-3 text-xl font-bold text-[#2B2B2B]">{title}</h3><div className="space-y-2 text-sm font-semibold text-[#6F676B]">{rows.map(([label, value]) => <p key={label}><span className="mr-3 inline-block min-w-20 text-[#9A8F94]">{label}</span>{value}</p>)}</div></section>;
}

function ConversationLogPanel({
  logs,
  locked,
  isSaving,
  onSave,
  onSplit,
  onUpdate
}: {
  logs: ConversationLog[];
  locked: boolean;
  isSaving: boolean;
  onSave: () => Promise<void>;
  onSplit: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ConversationLog>) => void;
}) {
  return (
    <section className="rounded-none border border-[#F0DEE2] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#2B2B2B]">会話ログ</h3>
          <p className="mt-0.5 text-xs font-bold text-[#8A8186]">{logs.length}ブロック{locked ? " / 保存済み" : ""}</p>
        </div>
        {!locked ? (
          <button className="inline-flex h-9 shrink-0 items-center gap-2 rounded-none border border-[#F0DEE2] px-3 text-xs font-bold text-[#6F676B] disabled:opacity-50" disabled={isSaving || logs.length === 0} onClick={() => void onSave()} type="button">
            {isSaving ? <LoadingSpinner label="保存中" /> : null}
            保存して分析済み一覧へ
          </button>
        ) : null}
      </div>
      <div className="mt-4 max-h-[520px] space-y-3 overflow-auto pr-1">
        {logs.length === 0 ? <p className="rounded-none bg-[#FFFBFC] px-5 py-8 text-center text-sm font-bold text-[#8A8186]">文字起こし完了後、発話単位のログが表示されます。</p> : null}
        {locked
          ? logs.map((log) => (
            <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold leading-6 text-[#5F585C]" key={log.id}>
              <span className="font-bold text-[#EC6F8B]">{speakerLabels[log.speaker]}: </span>
              {log.text}
            </p>
          ))
          : logs.map((log) => (
            <div className="grid gap-2 rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-3" key={log.id}>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <SingleSelect options={Object.entries(speakerLabels).map(([value, label]) => ({ value, label }))} value={log.speaker} onChange={(speaker) => onUpdate(log.id, { speaker: speaker as TeleapoSpeaker })} />
                <button
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-none border border-[#F0DEE2] bg-white px-3 text-xs font-bold text-[#EC6F8B] disabled:opacity-40"
                  disabled={splitTextIntoConversationBlocks(log.text).length <= 1}
                  onClick={() => onSplit(log.id)}
                  type="button"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  分割
                </button>
              </div>
              <textarea className="task-input min-h-20 resize-none" value={log.text} onChange={(event) => onUpdate(log.id, { text: event.target.value })} />
            </div>
          ))}
      </div>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-none bg-[#FFF0F3] p-4"><p className="text-sm font-bold text-[#EC6F8B]">{title}</p><p className="mt-2 text-2xl font-bold text-[#2B2B2B]">{value}</p></div>;
}

function TextBlock({ title, items }: { title: string; items: string[] }) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;
  return <div className="rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-4"><h4 className="font-bold text-[#2B2B2B]">{title}</h4><ul className="mt-3 space-y-2 text-sm font-semibold text-[#6F676B]">{visibleItems.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>;
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

function getCompanyPrimaryContact(company?: Company | null) {
  if (!company) return null;
  return company.contacts?.find((contact) => contact.id === company.primaryContactId) ?? company.contacts?.[0] ?? null;
}

function formatCompanyContact(contact?: { name?: string; role?: string } | null): string {
  if (!contact?.name && !contact?.role) return "未設定";
  return [contact.name, contact.role].filter(Boolean).join(" / ");
}
