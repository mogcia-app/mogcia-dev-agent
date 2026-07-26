"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, FileText, FileVideo, ListChecks, UploadCloud } from "lucide-react";
import { conversationLogsFromManualPaste } from "@/domain/conversation-logs";
import type {
  Client,
  ConversationLog,
  ConversationSpeaker,
  CustomerSegment,
  MeetingAnalysis,
  MeetingAsset,
  MeetingKind,
  MeetingLocation,
  MeetingOutcomeStatus,
  MeetingPurpose,
  MeetingRecord,
  MeetingUploadType,
  Product,
  Project
} from "@/domain/types";

type UploadFormState = {
  uploadType: MeetingUploadType;
  calendarEventId: string;
  clientId: string;
  projectId: string;
  participants: string;
  startedAt: string;
  endedAt: string;
  productId: string;
  customerSegment: CustomerSegment;
  meetingPurpose: MeetingPurpose;
  outcomeStatus: MeetingOutcomeStatus;
  location: MeetingLocation;
};

type TeamUser = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
};

const uploadTypes: MeetingUploadType[] = ["テレアポ", "打ち合わせ"];
const customerSegments: CustomerSegment[] = ["新規", "既存"];
const meetingPurposes: MeetingPurpose[] = ["新規提案", "クロージング", "関係構築"];
const outcomeStatuses: MeetingOutcomeStatus[] = ["未判定", "成約", "失注", "継続提案", "保留"];
const locations: MeetingLocation[] = ["先方オフィス", "Zoom", "自社会議室", "電話", "その他"];

function createInitialUploadForm(clientId: string, productId: string): UploadFormState {
  const startedAt = new Date();
  const endedAt = new Date(startedAt.getTime() + 60 * 60 * 1000);

  return {
    uploadType: "テレアポ",
    calendarEventId: "",
    clientId,
    projectId: "",
    participants: "",
    startedAt: toLocalInputValue(startedAt.toISOString()),
    endedAt: toLocalInputValue(endedAt.toISOString()),
    productId,
    customerSegment: "新規",
    meetingPurpose: "新規提案",
    outcomeStatus: "未判定",
    location: "電話"
  };
}

export function MeetingsWorkspace({
  analyses,
  assets,
  canUploadMeetingAsset,
  clients,
  currentUser,
  getAuthToken,
  meetings,
  onAnalyzeMeeting,
  onAnalysisSave,
  onCreateRequirements,
  onMeetingAssetUpload,
  onMeetingSave,
  products,
  projects
}: {
  analyses: MeetingAnalysis[];
  assets: MeetingAsset[];
  canUploadMeetingAsset: boolean;
  clients: Client[];
  currentUser: string;
  getAuthToken: () => Promise<string | null>;
  meetings: MeetingRecord[];
  onAnalyzeMeeting: (meeting: MeetingRecord) => Promise<void>;
  onAnalysisSave: (analysis: MeetingAnalysis) => Promise<void>;
  onCreateRequirements: (analysis: MeetingAnalysis) => Promise<void>;
  onMeetingAssetUpload: (input: { meeting: MeetingRecord; file: File; kind: MeetingAsset["kind"] }) => Promise<void>;
  onMeetingSave: (meeting: MeetingRecord) => Promise<void>;
  products: Product[];
  projects: Project[];
}) {
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(meetings[0]?.id ?? null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSplittingLogs, setIsSplittingLogs] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [editedLogState, setEditedLogState] = useState<{ meetingId: string; logs: ConversationLog[] } | null>(null);
  const safeProducts = Array.isArray(products) ? products : [];
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const safeAnalyses = Array.isArray(analyses) ? analyses : [];
  const safeAssets = Array.isArray(assets) ? assets : [];
  const activeProducts = safeProducts.filter((product) => product.active !== false);
  const [form, setForm] = useState<UploadFormState>(() => createInitialUploadForm(safeClients[0]?.id ?? "", activeProducts[0]?.id ?? ""));

  const sortedMeetings = useMemo(() => {
    const sourceMeetings = Array.isArray(meetings) ? meetings : [];
    return sourceMeetings.slice().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [meetings]);
  const selectedMeeting = sortedMeetings.find((meeting) => meeting.id === selectedMeetingId) ?? sortedMeetings[0];
  const selectedAnalysis = selectedMeeting ? safeAnalyses.find((analysis) => analysis.meetingId === selectedMeeting.id) : undefined;
  const selectedClient = selectedMeeting ? safeClients.find((client) => client.id === selectedMeeting.clientId) : undefined;
  const selectedProject = selectedMeeting?.projectId ? safeProjects.find((project) => project.id === selectedMeeting.projectId) : undefined;
  const selectedAssets = selectedMeeting ? safeAssets.filter((asset) => asset.meetingId === selectedMeeting.id) : [];
  const calendarMeetings = sortedMeetings.filter((meeting) => meeting.status === "予定");
  const effectiveClientId = form.clientId || safeClients[0]?.id || "";
  const effectiveProductId = form.productId || activeProducts[0]?.id || "";
  const clientProjects = safeProjects.filter((project) => project.clientId === effectiveClientId);
  const selectedProduct = activeProducts.find((product) => product.id === effectiveProductId);
  const editedLogs = editedLogState?.meetingId === selectedMeeting?.id ? editedLogState.logs : selectedMeeting?.conversationLogs ?? [];

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const response = await fetch("/api/team/users", {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { users?: TeamUser[] };
        if (mounted) setTeamUsers((payload.users ?? []).filter((user) => !user.disabled && user.email));
      } catch {
        if (mounted) setTeamUsers([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getAuthToken]);

  const saveUpload = async () => {
    if (!effectiveClientId || !form.startedAt || !form.endedAt || !effectiveProductId) {
      setStatus("顧客、日時、商材タイプを入力してください");
      return;
    }
    if (!uploadFile && !transcriptText.trim()) {
      setStatus("MP4ファイル、または文字起こし文章を入れてください");
      return;
    }

    setIsSaving(true);
    setStatus("アップロードを保存中");
    const selectedCalendarMeeting = sortedMeetings.find((meeting) => meeting.id === form.calendarEventId);
    const meetingId = selectedCalendarMeeting?.id ?? `meeting-${crypto.randomUUID()}`;
    const manualLogs = transcriptText.trim() ? conversationLogsFromManualPaste(transcriptText) : [];
    const meeting: MeetingRecord = {
      ...(selectedCalendarMeeting ?? {}),
      id: meetingId,
      clientId: effectiveClientId,
      projectId: form.projectId || undefined,
      title: `${form.uploadType}: ${selectedProduct?.name ?? "商材未設定"}`,
      kind: resolveMeetingKind(form.uploadType, form.location),
      uploadType: form.uploadType,
      calendarEventId: form.calendarEventId || undefined,
      productId: effectiveProductId,
      productName: selectedProduct?.name,
      customerSegment: form.customerSegment,
      meetingPurpose: form.meetingPurpose,
      outcomeStatus: form.uploadType === "打ち合わせ" ? form.outcomeStatus : undefined,
      location: form.location,
      startedAt: new Date(form.startedAt).toISOString(),
      endedAt: new Date(form.endedAt).toISOString(),
      participants: splitText(form.participants),
      mogciaParticipants: [currentUser, ...splitText(form.participants).filter((item) => item.includes("@mogcia.com"))],
      clientParticipants: splitText(form.participants).filter((item) => !item.includes("@mogcia.com")),
      transcription: transcriptText.trim() || selectedCalendarMeeting?.transcription,
      transcriptionModel: transcriptText.trim() ? "manual-paste" : selectedCalendarMeeting?.transcriptionModel,
      conversationLogModel: transcriptText.trim() ? "manual-paste" : selectedCalendarMeeting?.conversationLogModel,
      conversationLogs: manualLogs.length > 0 ? manualLogs : selectedCalendarMeeting?.conversationLogs,
      manualMemo: selectedCalendarMeeting?.manualMemo,
      status: "未整理",
      relatedTaskIds: selectedCalendarMeeting?.relatedTaskIds ?? [],
      createdAt: selectedCalendarMeeting?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await onMeetingSave(meeting);
      setSelectedMeetingId(meeting.id);
      if (uploadFile) {
        if (canUploadMeetingAsset) {
          await onMeetingAssetUpload({ meeting, file: uploadFile, kind: uploadFile.type.includes("video") ? "video" : "audio" });
        }
        await transcribeFile(uploadFile, meeting);
      } else {
        setStatus("保存しました。必要なら話者を修正してから分析してください");
      }
      setUploadFile(null);
      setTranscriptText("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const transcribeFile = async (file: File, meeting: MeetingRecord) => {
    setIsTranscribing(true);
    setStatus("OpenAIで文字起こし中");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("speakerHint", "営業, 顧客");
      const token = await getAuthToken();
      const response = await fetch("/api/openai/transcribe", {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
        language?: string;
        durationSec?: number;
        chunkCount?: number;
        wasChunked?: boolean;
        conversationLogs?: ConversationLog[];
      };
      if (!response.ok || !payload.text) throw new Error(payload.error || "文字起こしに失敗しました");
      await onMeetingSave({
        ...meeting,
        transcription: payload.text,
        transcriptionModel: "gpt-4o-mini-transcribe",
        conversationLogModel: "openai-transcribe-segments",
        conversationLogs: payload.conversationLogs ?? [],
        transcriptionLanguage: payload.language,
        transcriptionDurationSec: payload.durationSec,
        transcriptionChunkCount: payload.chunkCount,
        transcriptionWasChunked: payload.wasChunked,
        updatedAt: new Date().toISOString()
      });
      setStatus(payload.wasChunked ? `分割文字起こし完了: ${payload.chunkCount ?? 0} chunks` : "文字起こしが完了しました。話者を確認してください");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "文字起こしに失敗しました");
    } finally {
      setIsTranscribing(false);
    }
  };

  const splitLogsWithAi = async () => {
    if (!selectedMeeting?.transcription) return;
    setIsSplittingLogs(true);
    setStatus("AIで会話ブロックを分割中");
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/openai/conversation-logs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ transcriptText: selectedMeeting.transcription })
      });
      const payload = (await response.json()) as { logs?: ConversationLog[]; error?: string };
      if (!response.ok || !payload.logs) throw new Error(payload.error || "AI補助分割に失敗しました");
      await onMeetingSave({
        ...selectedMeeting,
        conversationLogs: payload.logs,
        conversationLogModel: "gpt-4o-mini",
        status: "未整理",
        updatedAt: new Date().toISOString()
      });
      setEditedLogState({ meetingId: selectedMeeting.id, logs: payload.logs });
      setStatus("AI補助分割を保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI補助分割に失敗しました");
    } finally {
      setIsSplittingLogs(false);
    }
  };

  const saveEditedSpeakers = async () => {
    if (!selectedMeeting) return;
    await onMeetingSave({
      ...selectedMeeting,
      conversationLogs: editedLogs,
      conversationLogModel: "manual-speaker-edit",
      updatedAt: new Date().toISOString()
    });
    setStatus("話者分離を保存しました");
  };

  const analyzeSelectedMeeting = async () => {
    if (!selectedMeeting) return;
    if ((selectedMeeting.conversationLogs ?? []).length === 0 && !selectedMeeting.transcription && !selectedMeeting.manualMemo) {
      setStatus("分析前に文字起こし、または会話ログが必要です");
      return;
    }
    setStatus("AI分析中");
    await onAnalyzeMeeting(selectedMeeting);
    setStatus("分析候補を作成しました");
  };

  return (
    <section className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-neutral-950">アップロード</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">テレアポのMP4、または文字起こしテキストを登録します。</p>
            </div>
            <UploadCloud className="h-5 w-5 text-mogcia-blush" strokeWidth={1.8} />
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid min-h-[190px] place-items-center rounded-[20px] border border-dashed border-mogcia-primary bg-mogcia-icon p-5 text-center">
              <input
                accept=".mp4,audio/*,video/mp4"
                className="hidden"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <div>
                <FileVideo className="mx-auto h-8 w-8 text-mogcia-blush" strokeWidth={1.7} />
                <p className="mt-3 text-sm font-semibold text-neutral-900">{uploadFile ? uploadFile.name : ".mp4 を選択"}</p>
                <p className="mt-2 text-xs leading-5 text-neutral-500">25MB超はAPI側で圧縮・分割して文字起こしします。</p>
              </div>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-neutral-800">文字起こしを貼り付け</span>
              <textarea
                className="min-h-[260px] rounded-[18px] border border-line bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-mogcia-primary-dark"
                onChange={(event) => setTranscriptText(event.target.value)}
                placeholder={"営業: 本日はありがとうございます。\n顧客: LINEの運用負担が気になっています。"}
                value={transcriptText}
              />
            </label>
          </div>
        </div>

        <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
          <h3 className="text-lg font-semibold text-neutral-950">打ち合わせ情報</h3>
          <div className="mt-5 grid gap-4">
            <Select label="種類" value={form.uploadType} options={uploadTypes} onChange={(value) => setForm((current) => ({ ...current, uploadType: value as MeetingUploadType, location: value === "テレアポ" ? "電話" : current.location }))} />
            <Select
              label="カレンダーから反映"
              value={form.calendarEventId}
              options={["", ...calendarMeetings.map((meeting) => meeting.id)]}
              labels={{ "": "予定を選択しない", ...Object.fromEntries(calendarMeetings.map((meeting) => [meeting.id, `${formatDateTime(meeting.startedAt)} ${meeting.title}`])) }}
              onChange={(value) => {
                const meeting = meetings.find((item) => item.id === value);
                setForm((current) => ({
                  ...current,
                  calendarEventId: value,
                  clientId: meeting?.clientId ?? current.clientId,
                  projectId: meeting?.projectId ?? current.projectId,
                  startedAt: meeting?.startedAt ? toLocalInputValue(meeting.startedAt) : current.startedAt,
                  endedAt: meeting?.endedAt ? toLocalInputValue(meeting.endedAt) : current.endedAt
                }));
              }}
            />
            <Select label="顧客名 / 会社名" value={effectiveClientId} options={safeClients.map((client) => client.id)} labels={Object.fromEntries(safeClients.map((client) => [client.id, client.name]))} onChange={(value) => setForm((current) => ({ ...current, clientId: value, projectId: "" }))} />
            <Select label="案件" value={form.projectId} options={["", ...clientProjects.map((project) => project.id)]} labels={{ "": "案件に紐づけない", ...Object.fromEntries(clientProjects.map((project) => [project.id, project.name])) }} onChange={(value) => setForm((current) => ({ ...current, projectId: value }))} />
            <label className="grid gap-2">
              <span className="text-sm font-medium text-neutral-700">同席者</span>
              {teamUsers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {teamUsers.map((user) => (
                    <button
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${splitText(form.participants).includes(user.email) ? "border-mogcia-primary-dark bg-mogcia-icon text-mogcia-blush" : "border-line bg-white text-neutral-600 hover:bg-neutral-50"}`}
                      key={user.uid}
                      onClick={() => setForm((current) => ({ ...current, participants: toggleParticipant(current.participants, user.email) }))}
                      type="button"
                    >
                      {user.displayName}
                    </button>
                  ))}
                </div>
              ) : null}
              <input className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink" onChange={(event) => setForm((current) => ({ ...current, participants: event.target.value }))} placeholder={`${currentUser}, 先方担当者`} value={form.participants} />
              <span className="text-xs text-neutral-400">Authユーザーはボタンで追加できます。先方担当者は手入力してください。</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField label="実施日時*" value={form.startedAt} onChange={(value) => setForm((current) => ({ ...current, startedAt: value }))} />
              <DateField label="終了時間*" value={form.endedAt} onChange={(value) => setForm((current) => ({ ...current, endedAt: value }))} />
            </div>
            <Select label="商材タイプ*" value={effectiveProductId} options={activeProducts.map((product) => product.id)} labels={Object.fromEntries(activeProducts.map((product) => [product.id, `${product.name} / ${product.category}`]))} onChange={(value) => setForm((current) => ({ ...current, productId: value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="顧客区分*" value={form.customerSegment} options={customerSegments} onChange={(value) => setForm((current) => ({ ...current, customerSegment: value as CustomerSegment }))} />
              <Select label="商談目的*" value={form.meetingPurpose} options={meetingPurposes} onChange={(value) => setForm((current) => ({ ...current, meetingPurpose: value as MeetingPurpose }))} />
            </div>
            {form.uploadType === "打ち合わせ" ? (
              <Select label="成約/失注ステータス" value={form.outcomeStatus} options={outcomeStatuses} onChange={(value) => setForm((current) => ({ ...current, outcomeStatus: value as MeetingOutcomeStatus }))} />
            ) : null}
            <Select label="場所" value={form.location} options={locations} onChange={(value) => setForm((current) => ({ ...current, location: value as MeetingLocation }))} />
            <button className="rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-45" disabled={isSaving || isTranscribing} onClick={saveUpload} type="button">
              {isSaving || isTranscribing ? "保存中" : "保存する"}
            </button>
          </div>
        </div>
      </div>

      {status ? <div className="rounded-[18px] border border-line bg-white px-4 py-3 text-sm text-neutral-600">{status}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <RecentUploads clients={clients} meetings={sortedMeetings} selectedMeetingId={selectedMeeting?.id} onSelect={setSelectedMeetingId} />
        <div className="grid gap-6">
          <MeetingDetail
            analysis={selectedAnalysis}
            assets={selectedAssets}
            client={selectedClient}
            editedLogs={editedLogs}
            isSplittingLogs={isSplittingLogs}
            meeting={selectedMeeting}
            onAnalyze={analyzeSelectedMeeting}
            onCreateRequirements={onCreateRequirements}
            onEditedLogsChange={(logs) => selectedMeeting ? setEditedLogState({ meetingId: selectedMeeting.id, logs }) : undefined}
            onSaveAnalysis={onAnalysisSave}
            onSaveSpeakers={saveEditedSpeakers}
            onSplitLogs={splitLogsWithAi}
            project={selectedProject}
          />
        </div>
      </div>
    </section>
  );
}

function RecentUploads({
  clients,
  meetings,
  onSelect,
  selectedMeetingId
}: {
  clients: Client[];
  meetings: MeetingRecord[];
  onSelect: (id: string) => void;
  selectedMeetingId?: string;
}) {
  return (
    <div className="rounded-[22px] border border-line bg-white p-4 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
      <h3 className="text-base font-semibold text-neutral-950">最近のアップロード</h3>
      <div className="mt-4 grid gap-2">
        {meetings.length === 0 ? <p className="rounded-[16px] bg-neutral-50 p-4 text-sm text-neutral-500">まだ保存されたアップロードがありません。</p> : null}
        {meetings.slice(0, 12).map((meeting) => {
          const client = clients.find((item) => item.id === meeting.clientId);
          return (
            <button
              className={`rounded-[16px] border px-3 py-3 text-left transition ${selectedMeetingId === meeting.id ? "border-mogcia-primary-dark bg-mogcia-icon" : "border-line bg-white hover:bg-neutral-50"}`}
              key={meeting.id}
              onClick={() => onSelect(meeting.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-neutral-900">{meeting.title}</p>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500">{meeting.uploadType ?? meeting.kind}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{client?.name ?? "会社未設定"} / {formatDateTime(meeting.startedAt)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MeetingDetail({
  analysis,
  assets,
  client,
  editedLogs,
  isSplittingLogs,
  meeting,
  onAnalyze,
  onCreateRequirements,
  onEditedLogsChange,
  onSaveAnalysis,
  onSaveSpeakers,
  onSplitLogs,
  project
}: {
  analysis?: MeetingAnalysis;
  assets: MeetingAsset[];
  client?: Client;
  editedLogs: ConversationLog[];
  isSplittingLogs: boolean;
  meeting?: MeetingRecord;
  onAnalyze: () => Promise<void>;
  onCreateRequirements: (analysis: MeetingAnalysis) => Promise<void>;
  onEditedLogsChange: (logs: ConversationLog[]) => void;
  onSaveAnalysis: (analysis: MeetingAnalysis) => Promise<void>;
  onSaveSpeakers: () => Promise<void>;
  onSplitLogs: () => Promise<void>;
  project?: Project;
}) {
  if (!meeting) {
    return <div className="rounded-[22px] border border-line bg-white p-6 text-sm text-neutral-500">左で音声か文字起こしを保存すると、ここに会話ログと分析が表示されます。</div>;
  }

  return (
    <>
      <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-mogcia-blush">{client?.name ?? "会社未設定"}</p>
            <h3 className="mt-1 text-xl font-semibold text-neutral-950">{meeting.title}</h3>
            <p className="mt-2 text-sm text-neutral-500">{meeting.productName ?? "商材未設定"} / {meeting.customerSegment ?? "-"} / {meeting.meetingPurpose ?? "-"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50" disabled={!meeting.transcription || isSplittingLogs} onClick={onSplitLogs} type="button">
              {isSplittingLogs ? "分割中" : "AI補助分割"}
            </button>
            <button className="rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white" onClick={onAnalyze} type="button">
              分析する
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-neutral-600 md:grid-cols-3">
          <InfoItem icon={CalendarClock} label="日時" value={`${formatDateTime(meeting.startedAt)} - ${meeting.endedAt ? formatTime(meeting.endedAt) : "-"}`} />
          <InfoItem icon={FileText} label="場所" value={meeting.location ?? meeting.kind} />
          <InfoItem icon={CheckCircle2} label="保存素材" value={`${assets.length}件`} />
        </div>
        {project ? <p className="mt-3 text-xs text-neutral-400">案件: {project.name}</p> : null}
      </div>

      <SpeakerLogEditor logs={editedLogs} onChange={onEditedLogsChange} onSave={onSaveSpeakers} />

      {analysis ? (
        <AnalysisPanel analysis={analysis} onCreateRequirements={onCreateRequirements} onSaveAnalysis={onSaveAnalysis} />
      ) : (
        <div className="rounded-[22px] border border-line bg-white p-5 text-sm text-neutral-500">分析結果はまだありません。話者ブロックを確認してから「分析する」を押してください。</div>
      )}
    </>
  );
}

function SpeakerLogEditor({
  logs,
  onChange,
  onSave
}: {
  logs: ConversationLog[];
  onChange: (logs: ConversationLog[]) => void;
  onSave: () => Promise<void>;
}) {
  const speakerOptions: Array<{ value: ConversationSpeaker; label: ConversationLog["label"] }> = [
    { value: "sales", label: "営業" },
    { value: "customer", label: "顧客" },
    { value: "participant", label: "同席者" },
    { value: "unknown", label: "不明" }
  ];

  const updateSpeaker = (id: string, speaker: ConversationSpeaker) => {
    const nextLabel = speakerOptions.find((item) => item.value === speaker)?.label ?? "不明";
    onChange(logs.map((log) => (log.id === id ? { ...log, speaker, label: nextLabel } : log)));
  };

  return (
    <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">会話ブロック / 話者分離</h3>
          <p className="mt-1 text-sm text-neutral-500">必要なところだけ営業・顧客・同席者へ変更してください。</p>
        </div>
        <button className="rounded-full bg-mogcia-light px-3 py-2 text-sm font-semibold text-mogcia-blush disabled:opacity-45" disabled={logs.length === 0} onClick={onSave} type="button">
          話者分離を保存
        </button>
      </div>
      <div className="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
        {logs.length === 0 ? <p className="rounded-[16px] bg-neutral-50 p-4 text-sm text-neutral-500">会話ログがありません。文字起こし貼り付け、またはMP4アップロード後に表示されます。</p> : null}
        {logs.map((log, index) => (
          <div className="rounded-[16px] border border-line bg-white p-3" key={log.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-neutral-400">#{index + 1}</span>
              <select className="h-8 rounded-md border border-line bg-white px-2 text-xs outline-none" onChange={(event) => updateSpeaker(log.id, event.target.value as ConversationSpeaker)} value={log.speaker}>
                {speakerOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {typeof log.startSec === "number" ? <span className="ml-auto text-xs text-neutral-400">{formatSec(log.startSec)} - {typeof log.endSec === "number" ? formatSec(log.endSec) : ""}</span> : null}
            </div>
            <p className="text-sm leading-6 text-neutral-700">{log.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisPanel({
  analysis,
  onCreateRequirements,
  onSaveAnalysis
}: {
  analysis: MeetingAnalysis;
  onCreateRequirements: (analysis: MeetingAnalysis) => Promise<void>;
  onSaveAnalysis: (analysis: MeetingAnalysis) => Promise<void>;
}) {
  return (
    <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-mogcia-blush" strokeWidth={1.8} />
            <h3 className="text-lg font-semibold text-neutral-950">分析結果</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{analysis.summary}</p>
        </div>
        <div className="rounded-[16px] bg-mogcia-icon px-4 py-3 text-center">
          <p className="text-xs text-neutral-500">見込み</p>
          <p className="text-2xl font-semibold text-neutral-950">{analysis.leadScore ?? "-"}<span className="text-sm">/100</span></p>
          <p className="text-xs font-semibold text-mogcia-blush">{analysis.leadGrade ?? "-"}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ListBlock title="懸念点" items={analysis.concerns} />
        <ListBlock title="準備すべき資料" items={analysis.preparationItems ?? []} />
        <ListBlock title="話す内容" items={analysis.talkFlow ?? []} />
        <ListBlock title="次にすること" items={analysis.nextActions.map((action) => `${action.title} / ${action.due}`)} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" onClick={() => onSaveAnalysis({ ...analysis, status: "confirmed", confirmedAt: new Date().toISOString() })} type="button">
          分析を確定
        </button>
        <button className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50" onClick={() => onCreateRequirements(analysis)} type="button">
          要件定義へ送る
        </button>
      </div>
    </div>
  );
}

function ListBlock({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-neutral-50 p-4">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <div className="mt-3 grid gap-2">
        {items.length === 0 ? <p className="text-sm text-neutral-400">未抽出</p> : null}
        {items.slice(0, 6).map((item) => (
          <p className="text-sm leading-6 text-neutral-600" key={item}>・{item}</p>
        ))}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof ListChecks; label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-neutral-50 p-3">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        {label}
      </div>
      <p className="mt-1 truncate font-semibold text-neutral-800">{value}</p>
    </div>
  );
}

function Select({
  label,
  labels,
  onChange,
  options,
  value
}: {
  label: string;
  labels?: Record<string, string>;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>{labels?.[option] ?? option}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink" onChange={(event) => onChange(event.target.value)} type="datetime-local" value={value} />
    </label>
  );
}

function resolveMeetingKind(uploadType: MeetingUploadType, location: MeetingLocation): MeetingKind {
  if (uploadType === "テレアポ") return "電話";
  if (location === "Zoom") return "Zoom";
  if (location === "先方オフィス" || location === "自社会議室") return "対面";
  if (location === "電話") return "電話";
  return "その他";
}

function splitText(value: string): string[] {
  return value
    .split(/,|、|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleParticipant(currentValue: string, email: string): string {
  const participants = splitText(currentValue);
  const next = participants.includes(email) ? participants.filter((item) => item !== email) : [...participants, email];
  return next.join(", ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function toLocalInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatSec(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
