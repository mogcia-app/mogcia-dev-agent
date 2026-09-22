"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { AlertCircle, Bell, CheckCircle2, ChevronRight, Clock3, Code2, FileText, FolderKanban, Loader2, MessageSquarePlus, PlayCircle, Save, Search, Sparkles, Trash2, XCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingSpinner, SkeletonList } from "@/components/ui/loading";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import {
  createDevelopmentProject,
  subscribeAgentNotifications,
  subscribeAgentRequests,
  subscribeAgentRuns,
  subscribeDevelopmentProjects
} from "@/lib/agent";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { AgentNotification, AgentRequest, AgentRun, AgentRunStatus, AgentRunStep, CreateDevelopmentProjectInput, DevelopmentProject } from "@/types/agent";

const statusLabels: Record<AgentRunStatus, string> = {
  queued: "受付済み",
  running: "実行中",
  requires_approval: "確認待ち",
  completed: "完了",
  error: "エラー",
  cancelled: "キャンセル"
};

const exampleRequests = [
  "MOGCIAの会社画面で保存エラーを直したい",
  "通知APIの競合防止を実装したい",
  "Vercel本番APIの500原因を調査したい",
  "FirestoreルールとAPI仕様を整理したい"
];

type ProjectDraft = CreateDevelopmentProjectInput;

const emptyProjectDraft: ProjectDraft = {
  name: "",
  slug: "",
  description: "",
  repositoryUrl: "",
  repositoryOwner: "",
  repositoryName: "",
  defaultBranch: "main",
  framework: "",
  packageManager: "",
  productionUrl: "",
  previewUrl: "",
  isActive: true
};

export function AgentPageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [loading, setLoading] = useState(true);
  const [savingRequest, setSavingRequest] = useState(false);
  const [approvingRunId, setApprovingRunId] = useState<string | null>(null);
  const [selectingCandidateId, setSelectingCandidateId] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedRunId = params.get("runId");

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      window.setTimeout(() => {
        setError("Firebaseが未設定です。");
        setLoading(false);
      }, 0);
      return undefined;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    window.setTimeout(() => setLoading(true), 0);
    const onError = (source: string) => (nextError: Error) => {
      setError(`${source}: ${nextError.message}`);
      setLoading(false);
    };
    const unsubscribeRuns = subscribeAgentRuns(user.uid, (nextRuns) => {
      setRuns(nextRuns);
      setLoading(false);
    }, onError("agentRuns"));
    const unsubscribeRequests = subscribeAgentRequests(user.uid, setRequests, onError("agentRequests"));
    const unsubscribeProjects = subscribeDevelopmentProjects((nextProjects) => {
      setProjects(nextProjects);
      if (!projectId && nextProjects[0]) setProjectId(nextProjects[0].id);
    }, onError("developmentProjects"));
    const unsubscribeNotifications = subscribeAgentNotifications(user.uid, setNotifications, onError("agentNotifications"));
    return () => {
      unsubscribeRuns();
      unsubscribeRequests();
      unsubscribeProjects();
      unsubscribeNotifications();
    };
  }, [projectId, user]);

  const selectedRun = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;
  const selectedRequest = selectedRun ? requests.find((request) => request.id === selectedRun.requestId) ?? null : null;
  const dashboard = useMemo(() => createDashboard(runs), [runs]);
  const visibleNotifications = useMemo(() => notifications.filter((notification) => notification.environment !== "test"), [notifications]);
  const unreadNotificationCount = visibleNotifications.filter((notification) => !notification.read).length;
  const completedNotificationCount = visibleNotifications.filter((notification) => notification.completed).length;

  const submitRequest = async () => {
    if (!user || !message.trim()) return;
    setSavingRequest(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ rawMessage: message, projectId: projectId || null })
      });
      const json = await safeJson<{ success?: boolean; data?: { runId?: string }; error?: { message?: string } }>(response);
      if (!response.ok || !json.success || !json.data?.runId) throw new Error(json.error?.message ?? "Agentを実行できませんでした。");
      setMessage("");
      setToast("Agent依頼を実行しました");
      router.replace(`${pathname}?runId=${json.data.runId}` as Route, { scroll: false });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Agent依頼を実行できませんでした。");
    } finally {
      setSavingRequest(false);
    }
  };

  const approveRun = async (runId: string, decision: "approve" | "cancel") => {
    if (!user) return;
    setApprovingRunId(runId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/agent/runs/${runId}/approve`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const json = await safeJson<{ success?: boolean; error?: { message?: string } }>(response);
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? "Agent操作を処理できませんでした。");
      setToast(decision === "approve" ? "Agent操作を実行しました" : "Agent操作をキャンセルしました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Agent操作を処理できませんでした。");
    } finally {
      setApprovingRunId(null);
    }
  };

  const selectCandidate = async (runId: string, candidateId: string) => {
    if (!user) return;
    setSelectingCandidateId(candidateId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/agent/runs/${runId}/select`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ candidateId })
      });
      const json = await safeJson<{ success?: boolean; error?: { message?: string } }>(response);
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? "候補を選択できませんでした。");
      setToast("候補を選択しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "候補を選択できませんでした。");
    } finally {
      setSelectingCandidateId(null);
    }
  };

  const submitProject = async () => {
    if (!projectDraft.name.trim() || !projectDraft.slug.trim()) return;
    setSavingProject(true);
    setError(null);
    try {
      const id = await createDevelopmentProject(projectDraft);
      setProjectDraft(emptyProjectDraft);
      setProjectId(id);
      setToast("開発プロジェクトを作成しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "開発プロジェクトを作成できませんでした。");
    } finally {
      setSavingProject(false);
    }
  };

  const updateNotification = async (body: Record<string, unknown>) => {
    if (!user) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/agent/notifications", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await safeJson<{ success?: boolean; error?: { message?: string } }>(response);
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? "通知を更新できませんでした。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "通知を更新できませんでした。");
    }
  };

  const deleteNotifications = async (notificationIds?: string[]) => {
    if (!user) return;
    const message = notificationIds?.length ? "選択した通知を削除しますか？" : "表示中の業務通知を一括削除しますか？";
    if (!window.confirm(message)) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/agent/notifications", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ notificationIds })
      });
      const json = await safeJson<{ success?: boolean; data?: { count?: number }; error?: { message?: string } }>(response);
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? "通知を削除できませんでした。");
      setToast(`${json.data?.count ?? 0}件の通知を削除しました`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "通知を削除できませんでした。");
    }
  };

  return (
    <section>
      <PageHeader
        title="Dev Agent"
        description="開発依頼だけをDevelopmentJobへ登録する専用画面です。通常業務の登録・更新は各業務画面から行います。"
        actions={
          <Link className="inline-flex h-11 items-center gap-2 rounded-none bg-white px-5 text-sm font-medium text-[#6F676B] shadow-sm ring-1 ring-[#F0E7E9]" href={"/settings/desktop" as Route}>
            <Code2 className="h-4 w-4" />
            デスクトップ連携
          </Link>
        }
      />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={error} type="error" /></div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-[#2B2B2B]">新しい開発依頼</h2>
                <p className="mt-1 text-sm font-semibold text-[#8A8186]">コード修正、API実装、調査などの開発作業だけを受け付けます。</p>
              </div>
              <div className="min-w-56">
                <select className="task-input h-11" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">プロジェクト未指定</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 rounded-none border border-[#F0DEE2] bg-[#FFFBFC] p-3">
              <textarea
                className="min-h-28 w-full resize-y bg-transparent text-base font-semibold leading-7 text-[#2B2B2B] outline-none placeholder:text-[#B7B0B3]"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="開発Agentに依頼したい内容を入力"
                value={message}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0E7E9] pt-3">
                <div className="flex flex-wrap gap-2">
                  {exampleRequests.map((example) => (
                    <button className="h-8 rounded-none bg-white px-3 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9]" key={example} onClick={() => setMessage(example)} type="button">{example}</button>
                  ))}
                </div>
                <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={!message.trim() || savingRequest} onClick={() => void submitRequest()} type="button">
                  {savingRequest ? <LoadingSpinner label="保存中" /> : <MessageSquarePlus className="h-4 w-4" />}
                  開発Agentに依頼
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-5">
            <MetricCard icon={<MessageSquarePlus className="h-5 w-5" />} label="新しい依頼" value={`${dashboard.newRequests}件`} />
            <MetricCard icon={<Loader2 className="h-5 w-5" />} label="実行中" value={`${dashboard.running}件`} />
            <MetricCard icon={<AlertCircle className="h-5 w-5" />} label="確認待ち" value={`${dashboard.approval}件`} />
            <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="本日完了" value={`${dashboard.completedToday}件`} />
            <MetricCard icon={<AlertCircle className="h-5 w-5" />} label="エラー" value={`${dashboard.errors}件`} />
          </div>

          {selectedRun ? <AgentRunDetail approving={approvingRunId === selectedRun.id} onApprove={approveRun} onSelectCandidate={selectCandidate} run={selectedRun} request={selectedRequest} selectingCandidateId={selectingCandidateId} /> : <RecentRuns loading={loading} runs={runs} />}
        </div>

        <aside className="space-y-5">
          <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-medium text-[#2B2B2B]"><Bell className="h-5 w-5 text-[#EC6F8B]" />通知</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#8A8186]">未読 {unreadNotificationCount} / 完了 {completedNotificationCount}</span>
                <button className="inline-flex h-8 items-center gap-1 rounded-none bg-[#FFF0F3] px-3 text-xs font-medium text-[#EC6F8B]" onClick={() => void updateNotification({ action: "mark_all_read" })} type="button">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  すべて既読
                </button>
                <button className="inline-flex h-8 items-center gap-1 rounded-none bg-white px-3 text-xs font-medium text-[#C44B63] ring-1 ring-[#F0DEE2]" onClick={() => void deleteNotifications()} type="button">
                  <Trash2 className="h-3.5 w-3.5" />
                  一括削除
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {visibleNotifications.slice(0, 8).map((notification) => (
                <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 text-sm font-semibold text-[#6F676B]" key={notification.id}>
                  <Link href={(notification.targetUrl || "/agent") as Route}>
                    <span className="block font-medium text-[#2B2B2B]">{notification.title}</span>
                    <span className="mt-1 block">{notification.message}</span>
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="h-8 rounded-none bg-white px-3 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9]" onClick={() => void updateNotification({ notificationId: notification.id, read: true })} type="button">既読</button>
                    <button className="h-8 rounded-none bg-white px-3 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9]" onClick={() => void updateNotification({ notificationId: notification.id, completed: !notification.completed, read: true })} type="button">{notification.completed ? "未完了" : "完了"}</button>
                    <button className="h-8 rounded-none bg-white px-3 text-xs font-medium text-[#C44B63] ring-1 ring-[#F0DEE2]" onClick={() => void deleteNotifications([notification.id])} type="button">削除</button>
                  </div>
                </div>
              ))}
              {visibleNotifications.length === 0 ? <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-5 text-center text-sm font-medium text-[#8A8186]">通知はまだありません。</p> : null}
            </div>
          </section>

          <ProjectPanel
            draft={projectDraft}
            onDraftChange={setProjectDraft}
            onSaveProject={submitProject}
            projects={projects}
            savingProject={savingProject}
          />
        </aside>
      </div>
    </section>
  );
}

function createDashboard(runs: AgentRun[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    newRequests: runs.filter((run) => run.status === "queued").length,
    running: runs.filter((run) => run.status === "running").length,
    approval: runs.filter((run) => run.status === "requires_approval" || run.requiresApproval).length,
    completedToday: runs.filter((run) => run.status === "completed" && (run.completedAt?.toDate() ?? run.createdAt.toDate()) >= today).length,
    errors: runs.filter((run) => run.status === "error").length
  };
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#8A8186]">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-none bg-[#FFF0F3] text-[#EC6F8B]">{icon}</span>
      </div>
      <p className="mt-3 text-base font-semibold text-[#2B2B2B]">{value}</p>
    </section>
  );
}

function RecentRuns({ loading, runs }: { loading: boolean; runs: AgentRun[] }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h2 className="text-base font-medium text-[#2B2B2B]">最近の実行履歴</h2>
      <div className="mt-4">
        {loading ? <SkeletonList count={5} media={false} /> : null}
        {!loading && runs.length === 0 ? <EmptyState icon={Sparkles} title="Agent Runはまだありません" description="依頼を保存すると、ここに実行履歴が表示されます。" /> : null}
        <div className="grid gap-3">
          {runs.slice(0, 12).map((run) => <RunRow key={run.id} run={run} />)}
        </div>
      </div>
    </section>
  );
}

function RunRow({ run }: { run: AgentRun }) {
  return (
    <Link className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] md:grid-cols-[1fr_auto]" href={`/agent?runId=${run.id}` as Route}>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={run.status} />
          <span className="text-xs font-medium text-[#8A8186]">{sourceLabel(run.source)}</span>
        </span>
        <span className="mt-2 block truncate text-base font-semibold text-[#2B2B2B]">{run.title}</span>
      </span>
      <span className="flex items-center gap-3 text-sm font-medium text-[#EC6F8B]">
        {run.progress ?? 0}%
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function AgentRunDetail({
  run,
  request,
  approving,
  selectingCandidateId,
  onApprove,
  onSelectCandidate
}: {
  run: AgentRun;
  request: AgentRequest | null;
  approving: boolean;
  selectingCandidateId: string | null;
  onApprove: (runId: string, decision: "approve" | "cancel") => void;
  onSelectCandidate: (runId: string, candidateId: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link className="text-sm font-medium text-[#EC6F8B]" href={"/agent" as Route}>一覧へ戻る</Link>
            <h2 className="mt-2 truncate text-base font-semibold text-[#2B2B2B]">{run.title}</h2>
            <p className="mt-2 text-sm font-semibold text-[#777]">Run ID: {run.id}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <InfoBox label="現在のステータス" value={statusLabels[run.status]} />
          <InfoBox label="現在のステップ" value={run.currentStep ?? "未設定"} />
          <InfoBox label="進捗" value={`${run.progress ?? 0}%`} />
          <InfoBox label="確認待ち" value={run.requiresApproval ? "あり" : "なし"} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="元の依頼" icon={<MessageSquarePlus className="h-5 w-5" />}>
            <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#2B2B2B]">{request?.rawMessage || "元の依頼を取得中です。"}</p>
          </Panel>
          <Panel title="Agent回答" icon={<Sparkles className="h-5 w-5" />}>
            {run.answer ? <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#2B2B2B]">{run.answer}</p> : <EmptyInline text="回答はまだありません。" />}
            {run.pendingAction ? (
              <div className="mt-4 rounded-none border border-[#F4D5AC] bg-[#FFF8E8] p-4">
                <p className="text-sm font-semibold text-[#6F5226]">{run.pendingAction.title}</p>
                {run.pendingAction.description ? <p className="mt-1 text-sm font-semibold text-[#876F43]">{run.pendingAction.description}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={approving} onClick={() => onApprove(run.id, "approve")} type="button">
                    {approving ? <LoadingSpinner label="実行中" /> : <CheckCircle2 className="h-4 w-4" />}
                    実行する
                  </button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-none bg-white px-4 text-sm font-medium text-[#6F676B] ring-1 ring-[#F0E7E9] disabled:opacity-50" disabled={approving} onClick={() => onApprove(run.id, "cancel")} type="button">
                    <XCircle className="h-4 w-4" />
                    キャンセル
                  </button>
                </div>
              </div>
            ) : null}
            {run.pendingSelection ? (
              <div className="mt-4 rounded-none border border-[#D9E7F7] bg-[#F3F8FF] p-4">
                <p className="text-sm font-semibold text-[#355C86]">{run.pendingSelection.title}</p>
                {run.pendingSelection.description ? <p className="mt-1 text-sm font-semibold text-[#55718F]">{run.pendingSelection.description}</p> : null}
                <div className="mt-3 grid gap-2">
                  {run.pendingSelection.candidates.map((candidate) => (
                    <button className="grid gap-1 rounded-none border border-[#CFE0F3] bg-white p-3 text-left transition hover:border-[#9DBFE4] disabled:opacity-50" disabled={!candidate.id || selectingCandidateId === candidate.id} key={candidate.id ?? candidate.title} onClick={() => candidate.id ? onSelectCandidate(run.id, candidate.id) : undefined} type="button">
                      <span className="text-sm font-semibold text-[#2B2B2B]">{candidate.title}</span>
                      {candidate.subtitle ? <span className="text-xs font-medium text-[#6F7F8F]">{candidate.subtitle}</span> : null}
                      {selectingCandidateId === candidate.id ? <span className="text-xs font-medium text-[#EC6F8B]">選択中...</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {run.cards?.length ? <ResultCards cards={run.cards} /> : null}
          </Panel>
          <Panel title="実行ステップ" icon={<PlayCircle className="h-5 w-5" />}>
            <div className="grid gap-3">
              {run.steps.map((step) => <StepRow key={step.type} step={step} />)}
            </div>
          </Panel>
          <Panel title="ログ" icon={<FileText className="h-5 w-5" />}>
            {run.logs?.length ? (
              <div className="grid gap-2">
                {run.logs.map((log, index) => <p className="rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={`${log}-${index}`}>{log}</p>)}
              </div>
            ) : <EmptyInline text="ログはまだありません。" />}
          </Panel>
          <Panel title="Toolログ" icon={<Search className="h-5 w-5" />}>
            {run.toolLogs?.length ? (
              <div className="grid gap-2">
                {run.toolLogs.map((log, index) => (
                  <div className="grid gap-1 rounded-none bg-[#FFFBFC] px-3 py-2 text-sm font-semibold text-[#6F676B]" key={`${log.toolName}-${index}`}>
                    <span className="font-semibold text-[#2B2B2B]">{log.toolName} / {log.status === "success" ? "成功" : "失敗"}</span>
                    <span>{log.summary}</span>
                    {log.targetId ? <span className="text-xs text-[#9A8F94]">{log.targetType}: {log.targetId}</span> : null}
                  </div>
                ))}
              </div>
            ) : <EmptyInline text="Toolログはまだありません。" />}
          </Panel>
        </div>
        <div className="space-y-4">
          <SummaryPanel emptyText="Worker完了後に表示します。" title="変更内容" value={run.changeSummary} />
          <SummaryPanel emptyText="Diff取得後に表示します。" title="Diff" value={run.reviewSummary} />
          <SummaryPanel emptyText="検証後に表示します。" title="Build" value={run.buildSummary} />
          <SummaryPanel emptyText="Previewは次フェーズで接続します。" title="Preview" value={run.previewUrl} />
        </div>
      </div>
    </section>
  );
}

function ResultCards({ cards }: { cards: NonNullable<AgentRun["cards"]> }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {cards.map((card, index) => {
        const content = (
          <article className="h-full rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#2B2B2B]">{card.title}</p>
                {card.subtitle ? <p className="mt-1 text-xs font-medium text-[#8A8186]">{card.subtitle}</p> : null}
              </div>
              {card.tone && card.tone !== "default" ? <span className="rounded-none bg-white px-2 py-1 text-xs font-semibold text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{card.tone}</span> : null}
            </div>
            {card.body ? <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#6F676B]">{card.body}</p> : null}
            {card.meta?.length ? (
              <dl className="mt-3 grid gap-2">
                {card.meta.map((item) => (
                  <div className="grid grid-cols-[88px_1fr] gap-2 text-xs" key={`${card.title}-${item.label}`}>
                    <dt className="font-semibold text-[#9A8F94]">{item.label}</dt>
                    <dd className="font-medium text-[#4F474B]">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </article>
        );
        return card.href ? <Link href={card.href as Route} key={`${card.title}-${index}`}>{content}</Link> : <div key={`${card.title}-${index}`}>{content}</div>;
      })}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-base font-medium text-[#2B2B2B]"><span className="text-[#EC6F8B]">{icon}</span>{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryPanel({ title, value, emptyText }: { title: string; value?: string | null; emptyText: string }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h3 className="text-base font-medium text-[#2B2B2B]">{title}</h3>
      <div className="mt-4">
        {value ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-xs font-semibold leading-5 text-[#4F474B]">{value}</pre> : <EmptyInline text={emptyText} />}
      </div>
    </section>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-5 text-center text-sm font-medium text-[#8A8186]">{text}</p>;
}

function StepRow({ step }: { step: AgentRunStep }) {
  return (
    <div className="grid gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 md:grid-cols-[120px_120px_1fr]">
      <span className="text-sm font-semibold text-[#2B2B2B]">{stepLabel(step.type)}</span>
      <span className="text-sm font-medium text-[#EC6F8B]">{stepStatusLabel(step.status)}</span>
      <span className="text-sm font-semibold text-[#6F676B]">{step.message || "詳細はまだありません。"}</span>
    </div>
  );
}

function ProjectPanel({
  projects,
  draft,
  savingProject,
  onDraftChange,
  onSaveProject
}: {
  projects: DevelopmentProject[];
  draft: ProjectDraft;
  savingProject: boolean;
  onDraftChange: (draft: ProjectDraft) => void;
  onSaveProject: () => void;
}) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-medium text-[#2B2B2B]"><FolderKanban className="h-5 w-5 text-[#EC6F8B]" />開発プロジェクト</h2>
      <div className="mt-4 grid gap-2">
        {projects.slice(0, 5).map((project) => (
          <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 text-left" key={project.id}>
            <span className="block text-sm font-semibold text-[#2B2B2B]">{project.name}</span>
            <span className="mt-1 block text-xs font-medium text-[#8A8186]">{project.slug} / {project.defaultBranch || "main"}</span>
          </div>
        ))}
        {projects.length === 0 ? <EmptyInline text="開発プロジェクトはまだありません。" /> : null}
      </div>

      <div className="mt-5 border-t border-[#F0E7E9] pt-5">
        <p className="text-sm font-semibold text-[#655D62]">新規プロジェクト</p>
        <div className="mt-3 grid gap-3">
          <Input label="名称" value={draft.name} onChange={(name) => onDraftChange({ ...draft, name, slug: draft.slug || slugify(name) })} />
          <Input label="slug" value={draft.slug} onChange={(slug) => onDraftChange({ ...draft, slug })} />
          <Input label="Repository URL" value={draft.repositoryUrl ?? ""} onChange={(repositoryUrl) => onDraftChange({ ...draft, repositoryUrl })} />
          <Input label="Framework" value={draft.framework ?? ""} onChange={(framework) => onDraftChange({ ...draft, framework })} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-none bg-[#EC6F8B] text-sm font-medium text-white disabled:opacity-50" disabled={savingProject || !draft.name.trim() || !draft.slug.trim()} onClick={() => void onSaveProject()} type="button">
            {savingProject ? <LoadingSpinner label="保存中" /> : <Save className="h-4 w-4" />}
            プロジェクトを保存
          </button>
        </div>
      </div>
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#8A8186]">
      {label}
      <input className="task-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-[#FFFBFC] p-3 ring-1 ring-[#F0E7E9]">
      <p className="text-xs font-semibold text-[#8A8186]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[#2B2B2B]">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentRunStatus }) {
  const tone = status === "completed" ? "bg-[#F3FAF0] text-[#5E9B61]" : status === "error" ? "bg-[#FFF0F3] text-[#D94F6E]" : status === "running" ? "bg-[#EEF5FF] text-[#4E76AA]" : status === "requires_approval" ? "bg-[#FFF8E8] text-[#9B7332]" : "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]";
  return <span className={`inline-flex rounded-none px-2.5 py-1 text-xs font-semibold ${tone}`}>{statusLabels[status]}</span>;
}

function stepLabel(type: AgentRunStep["type"]): string {
  if (type === "plan") return "Plan";
  if (type === "execute") return "Execute";
  if (type === "codex") return "Codex";
  if (type === "review") return "Review";
  if (type === "build") return "Build";
  if (type === "preview") return "Preview";
  return "Complete";
}

function stepStatusLabel(status: AgentRunStep["status"]): string {
  if (status === "running") return "実行中";
  if (status === "success") return "成功";
  if (status === "error") return "エラー";
  return "待機中";
}

function sourceLabel(source: string): string {
  if (source === "desktop") return "Desktop Agent";
  if (source === "cli") return "CLI";
  return "管理画面";
}

async function safeJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("サーバーで一時的なエラーが発生しています。Vercelのデプロイと環境変数を確認してください。");
  }
  return response.json() as Promise<T>;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
