"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Code2, FileText, FolderKanban, Loader2, MessageSquarePlus, PlayCircle, Save, Search, Server, Settings, Sparkles, XCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingSpinner, SkeletonList } from "@/components/ui/loading";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import {
  createDevelopmentProject,
  getProjectMemory,
  saveProjectMemory,
  subscribeAgentNotifications,
  subscribeAgentRequests,
  subscribeAgentRuns,
  subscribeDevelopmentJobs,
  subscribeDevelopmentProjects,
  subscribeDevelopmentWorkers
} from "@/lib/agent";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { AgentNotification, AgentRequest, AgentRun, AgentRunStatus, AgentRunStep, CreateDevelopmentProjectInput, DevelopmentJob, DevelopmentProject, DevelopmentWorker, ProjectMemory } from "@/types/agent";

const statusLabels: Record<AgentRunStatus, string> = {
  queued: "受付済み",
  running: "実行中",
  worker_lost: "Worker停止・確認待ち",
  requires_approval: "確認待ち",
  completed: "完了",
  error: "エラー",
  cancelled: "キャンセル"
};

const exampleRequests = [
  "Signal.の月次レポートを改修したい",
  "commo.の管理画面を整理したい",
  "明日までに対応が必要な会社を確認したい",
  "商談結果からタスクを作りたい"
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

const emptyMemory: Omit<ProjectMemory, "projectId" | "updatedAt"> = {
  productOverview: "",
  architecture: "",
  designRules: "",
  codingRules: "",
  decisions: "",
  notes: ""
};

export function AgentPageClient() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialMessage = params.get("message") ?? "";
  const [user, setUser] = useState<User | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [jobs, setJobs] = useState<DevelopmentJob[]>([]);
  const [workers, setWorkers] = useState<DevelopmentWorker[]>([]);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [message, setMessage] = useState(initialMessage);
  const [projectId, setProjectId] = useState("");
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [memoryProjectId, setMemoryProjectId] = useState("");
  const [memoryDraft, setMemoryDraft] = useState(emptyMemory);
  const [loading, setLoading] = useState(true);
  const [savingRequest, setSavingRequest] = useState(false);
  const [approvingRunId, setApprovingRunId] = useState<string | null>(null);
  const [selectingCandidateId, setSelectingCandidateId] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(Boolean(initialMessage));
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      if (!memoryProjectId && nextProjects[0]) setMemoryProjectId(nextProjects[0].id);
    }, onError("developmentProjects"));
    const unsubscribeJobs = subscribeDevelopmentJobs(user.uid, setJobs, onError("developmentJobs"));
    const unsubscribeWorkers = subscribeDevelopmentWorkers(user.uid, setWorkers, onError("developmentWorkers"));
    const unsubscribeNotifications = subscribeAgentNotifications(user.uid, setNotifications, onError("agentNotifications"));
    return () => {
      unsubscribeRuns();
      unsubscribeRequests();
      unsubscribeProjects();
      unsubscribeJobs();
      unsubscribeWorkers();
      unsubscribeNotifications();
    };
  }, [memoryProjectId, projectId, user]);

  useEffect(() => {
    if (!memoryProjectId) {
      window.setTimeout(() => setMemoryDraft(emptyMemory), 0);
      return;
    }
    let cancelled = false;
    void getProjectMemory(memoryProjectId)
      .then((memory) => {
        if (!cancelled) setMemoryDraft({
          productOverview: memory.productOverview ?? "",
          architecture: memory.architecture ?? "",
          designRules: memory.designRules ?? "",
          codingRules: memory.codingRules ?? "",
          decisions: memory.decisions ?? "",
          notes: memory.notes ?? ""
        });
      })
      .catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Project Memoryを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, [memoryProjectId]);

  const latestProjectRun = runs.find((run) => projectId ? run.projectId === projectId : false) ?? null;
  const selectedRun = initialMessage ? null : selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : latestProjectRun;
  const selectedRequest = selectedRun ? requests.find((request) => request.id === selectedRun.requestId) ?? null : null;
  const dashboard = useMemo(() => createDashboard(runs), [runs]);
  const activeJobs = useMemo(() => jobs.filter((job) => job.status === "queued" || job.status === "assigned" || job.status === "running" || job.status === "reviewing"), [jobs]);
  const showJobsFirst = activeJobs.length > 0;
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    const nextRun = runs.find((run) => run.projectId === nextProjectId);
    router.replace(nextRun ? `${pathname}?runId=${nextRun.id}` as Route : pathname as Route, { scroll: false });
  };

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
      const json = await response.json() as { success?: boolean; data?: { runId?: string }; error?: { message?: string } };
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
      const json = await response.json() as { success?: boolean; error?: { message?: string } };
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
      const json = await response.json() as { success?: boolean; error?: { message?: string } };
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
      setMemoryProjectId(id);
      setToast("開発プロジェクトを作成しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "開発プロジェクトを作成できませんでした。");
    } finally {
      setSavingProject(false);
    }
  };

  const submitMemory = async () => {
    if (!memoryProjectId) return;
    setSavingMemory(true);
    setError(null);
    try {
      await saveProjectMemory(memoryProjectId, memoryDraft);
      setToast("Project Memoryを保存しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project Memoryを保存できませんでした。");
    } finally {
      setSavingMemory(false);
    }
  };

  return (
    <section className="grid min-h-[calc(100vh-65px)] max-w-full touch-pan-y overflow-x-hidden overscroll-x-none bg-white lg:min-h-screen lg:grid-cols-[260px_minmax(0,1fr)]">
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <aside className="flex min-h-0 flex-col border-r border-[#E9E6E4] bg-[#F7F6F4]">
        <div className="border-b border-[#E9E6E4] p-4"><div className="flex items-center justify-between"><h1 className="text-lg font-bold">Agent</h1><Link aria-label="Desktop連携" className="text-neutral-500 hover:text-neutral-900" href={"/settings/desktop" as Route}><Settings className="h-4 w-4" /></Link></div><button className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#DDD8D5] bg-white text-sm font-semibold hover:bg-[#FCFBFA]" onClick={() => { router.replace(pathname as Route, { scroll: false }); setMessage(""); }} type="button"><MessageSquarePlus className="h-4 w-4" />新しい依頼</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3"><p className="px-2 pb-2 text-[11px] font-semibold tracking-[0.12em] text-neutral-400">プロダクト</p><div className="space-y-1">{projects.map((project) => { const count = activeJobs.filter((job) => job.projectId === project.id).length; const active = project.id === projectId; return <button className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${active ? "bg-white font-semibold shadow-sm" : "text-neutral-600 hover:bg-white/70"}`} key={project.id} onClick={() => selectProject(project.id)} type="button"><FolderKanban className={`h-4 w-4 ${active ? "text-[#EC6F8B]" : "text-neutral-400"}`} /><span className="min-w-0 flex-1 truncate">{project.name}</span>{count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#FFF0F3] px-1 text-[11px] font-bold text-[#B84563]">{count}</span> : null}</button>; })}{!loading && projects.length === 0 ? <p className="px-3 py-4 text-sm text-neutral-500">Projectがありません。</p> : null}</div></div>
        <div className="space-y-2 border-t border-[#E9E6E4] p-3"><WorkerState workers={workers} /><button className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-neutral-600 hover:bg-white" onClick={() => setSettingsOpen((open) => !open)} type="button"><Settings className="h-4 w-4" />Project設定</button></div>
      </aside>

      <main className="flex min-h-0 min-w-0 max-w-full flex-col overflow-x-hidden bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto min-w-0 w-full max-w-3xl overflow-x-hidden px-5 py-8">
            <div className="mb-4"><StatusBanner message={error} type="error" /></div>
            {settingsOpen ? <ProjectPanel draft={projectDraft} memoryDraft={memoryDraft} memoryProjectId={memoryProjectId} onDraftChange={setProjectDraft} onMemoryChange={setMemoryDraft} onMemoryProjectChange={setMemoryProjectId} onSaveMemory={submitMemory} onSaveProject={submitProject} projects={projects} savingMemory={savingMemory} savingProject={savingProject} /> : selectedRun ? <AgentChatRun approving={approvingRunId === selectedRun.id} onApprove={approveRun} request={selectedRequest} run={selectedRun} /> : <AgentWelcome project={selectedProject} onExample={setMessage} />}
          </div>
        </div>
        {!settingsOpen ? <div className="shrink-0 border-t border-[#EEEAE8] bg-white px-5 py-4"><div className="mx-auto max-w-3xl rounded-2xl border border-[#DCD7D4] bg-white p-3 shadow-sm focus-within:border-[#C9C1BD]"><textarea className="max-h-48 min-h-12 w-full resize-none bg-transparent px-1 text-sm leading-6 outline-none placeholder:text-neutral-400" onChange={(event) => setMessage(event.target.value)} placeholder={selectedRun ? "続きの質問や登録内容を入力…" : "会社・営業リスト・予定・タスク・商談について入力…"} value={message} /><div className="mt-2 flex items-center justify-between"><select className="max-w-52 bg-transparent text-xs font-medium text-neutral-500 outline-none" value={projectId} onChange={(event) => selectProject(event.target.value)}><option value="">業務入力（Projectなし）</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button aria-label="送信" className="grid h-8 w-8 place-items-center rounded-lg bg-[#EC6F8B] text-white disabled:bg-neutral-200" disabled={!message.trim() || savingRequest} onClick={() => void submitRequest()} type="button">{savingRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}</button></div></div></div> : null}
      </main>
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

function WorkerState({ workers }: { workers: DevelopmentWorker[] }) {
  const worker = workers[0];
  const status = worker?.status ?? "offline";
  const label = status === "busy" ? "Worker実行中" : status === "online" ? "Worker接続中" : status === "disabled" ? "Worker停止中" : "Workerオフライン";
  const tone = status === "busy" ? "bg-[#EEF5FF] text-[#4E76AA]" : status === "online" ? "bg-[#F3FAF0] text-[#5E9B61]" : "bg-[#FFF0F3] text-[#D94F6E]";
  return <span className={`inline-flex h-10 items-center gap-2 px-3 text-sm font-black ${tone}`}><Server className="h-4 w-4" />{label}</span>;
}

function AgentWelcome({ project, onExample }: { project: DevelopmentProject | null; onExample: (value: string) => void }) {
  return <div className="grid min-h-[420px] place-items-center text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#FFF0F3] text-[#B84563]"><Sparkles className="h-6 w-6" /></span><h2 className="mt-5 text-2xl font-semibold text-neutral-900">{project ? `${project.name}を開発する` : "MOGCIAに入力・確認する"}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">{project ? "実装内容、守るべき制約、完了条件を伝えてください。" : "会社・営業リスト・予定・タスク・活動ログを入力したり、現在の状況を質問できます。メニューバーと同じデータへ反映されます。"}</p><div className="mt-6 flex flex-wrap justify-center gap-2">{exampleRequests.slice(0, 4).map((example) => <button className="rounded-lg border border-[#E5E0DD] px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-[#F8F6F5]" key={example} onClick={() => onExample(example)} type="button">{example}</button>)}</div></div></div>;
}

function AgentChatRun({ run, request, approving, onApprove }: { run: AgentRun; request: AgentRequest | null; approving: boolean; onApprove: (runId: string, decision: "approve" | "cancel") => void }) {
  const hasReview = Boolean(run.changeSummary || run.reviewSummary || run.buildSummary);
  return <div className="space-y-8">
    <div className="flex min-w-0 justify-end"><div className="min-w-0 max-w-[82%] rounded-2xl bg-[#F1EFED] px-4 py-3 text-sm font-medium leading-6 text-neutral-800"><p className="whitespace-pre-wrap break-words">{request?.rawMessage || run.title}</p></div></div>
    <div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#FFF0F3] text-[#B84563]"><Sparkles className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-neutral-900">MOGCIA Agent</p><div className="mt-2 text-sm font-medium leading-7 text-neutral-700">{run.answer ? <p className="whitespace-pre-wrap">{run.answer}</p> : <p>依頼を受け付けました。WorkerとCodexの実行を待っています。</p>}</div>
      <div className="mt-5 overflow-hidden rounded-xl border border-[#E8E3E0]"><div className="flex items-center justify-between border-b border-[#E8E3E0] bg-[#FAF9F8] px-4 py-3"><span className="text-sm font-semibold">実行状況</span><span className="text-xs font-semibold text-neutral-500">{run.progress ?? 0}%</span></div><div className="divide-y divide-[#EEEAE8]">{run.steps.map((step) => <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[100px_90px_1fr]" key={step.type}><span className="font-semibold">{stepLabel(step.type)}</span><span className={step.status === "success" ? "font-semibold text-green-600" : step.status === "error" ? "font-semibold text-red-600" : step.status === "running" ? "font-semibold text-blue-600" : "text-neutral-400"}>{stepStatusLabel(step.status)}</span><span className="text-neutral-500">{step.message}</span></div>)}</div></div>
      {hasReview ? <div className="mt-5 space-y-3"><ChatDisclosure title="変更内容" value={run.changeSummary} empty="変更内容を取得中です。" /><ChatDisclosure title="Validation" value={run.buildSummary} empty="検証結果を取得中です。" /><ChatDisclosure title="Diff" value={run.reviewSummary} empty="Diffを取得中です。" /></div> : null}
      {run.requiresApproval || run.status === "requires_approval" ? <div className="mt-5 flex flex-wrap gap-2"><button className="rounded-lg bg-[#EC6F8B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={approving} onClick={() => onApprove(run.id, "approve")} type="button">承認</button><button className="rounded-lg border border-[#DDD8D5] px-4 py-2 text-sm font-semibold text-neutral-600 disabled:opacity-50" disabled={approving} onClick={() => onApprove(run.id, "cancel")} type="button">キャンセル</button></div> : null}
    </div></div>
  </div>;
}

function ChatDisclosure({ title, value, empty }: { title: string; value?: string | null; empty: string }) {
  return <details className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[#E8E3E0] bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{title}</summary><div className="min-w-0 max-w-full overflow-hidden border-t border-[#EEEAE8] p-4">{value ? <pre className="max-h-96 max-w-full overflow-y-auto whitespace-pre-wrap break-all text-xs leading-5 text-neutral-600">{value}</pre> : <p className="text-sm text-neutral-400">{empty}</p>}</div></details>;
}

function JobCommandCenter({ jobs, runs, projects, loading }: { jobs: DevelopmentJob[]; runs: AgentRun[]; projects: DevelopmentProject[]; loading: boolean }) {
  const runIds = new Set(jobs.map((job) => job.runId));
  const rows = jobs.length ? jobs : runs.filter((run) => run.intent === "development_request" || runIds.has(run.id));
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-bold text-[#2B2B2B]">Development Jobs</h2><p className="mt-1 text-sm font-semibold text-[#8A8186]">実行状況を確認し、完了した変更を人間がレビューします。</p></div>
        <span className="text-sm font-black text-[#8A8186]">{rows.length}件</span>
      </div>
      <div className="mt-4">
        {loading ? <SkeletonList count={5} media={false} /> : null}
        {!loading && rows.length === 0 ? <EmptyState icon={Code2} title="Development Jobはありません" description="上の入力欄から最初の開発依頼を作成できます。" /> : null}
        <div className="grid gap-3">
          {jobs.map((job) => {
            const project = projects.find((entry) => entry.id === job.projectId);
            const run = runs.find((entry) => entry.id === job.runId);
            const status = job.status === "reviewing" ? "requires_approval" : job.status === "failed" ? "error" : job.status === "assigned" ? "running" : job.status === "completed" ? "completed" : job.status === "cancelled" ? "cancelled" : job.status;
            return (
              <Link className="grid gap-3 border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center" href={`/agent?runId=${job.runId}` as Route} key={job.id}>
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><StatusBadge status={status} /><span className="text-xs font-bold text-[#8A8186]">{project?.name || "Project未設定"}</span></span><span className="mt-2 block truncate text-base font-black text-[#2B2B2B]">{job.title}</span><span className="mt-1 block text-xs font-bold text-[#9A8F94]">{job.assignedWorkerId ? `Worker: ${job.assignedWorkerId}` : "Worker割り当て待ち"}</span></span>
                <span className="text-sm font-bold text-[#6F676B]">{run?.currentStep ? `${stepLabel(run.currentStep)} / ${run.progress ?? 0}%` : job.status === "queued" ? "Worker待ち" : "詳細を確認"}</span>
                <ChevronRight className="h-5 w-5 text-[#EC6F8B]" />
              </Link>
            );
          })}
          {!jobs.length ? runs.filter((run) => run.intent === "development_request").map((run) => <RunRow key={run.id} run={run} />) : null}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-[#8A8186]">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-none bg-[#FFF0F3] text-[#EC6F8B]">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-black text-[#2B2B2B]">{value}</p>
    </section>
  );
}

function RecentRuns({ loading, runs }: { loading: boolean; runs: AgentRun[] }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-[#2B2B2B]">最近の実行履歴</h2>
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
          <span className="text-xs font-bold text-[#8A8186]">{sourceLabel(run.source)}</span>
        </span>
        <span className="mt-2 block truncate text-base font-black text-[#2B2B2B]">{run.title}</span>
        <span className="mt-1 block text-xs font-bold text-[#9A8F94]">{run.createdAt.toDate().toLocaleString("ja-JP")}</span>
      </span>
      <span className="flex items-center gap-3 text-sm font-bold text-[#EC6F8B]">
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
            <Link className="text-sm font-bold text-[#EC6F8B]" href={"/agent" as Route}>一覧へ戻る</Link>
            <h2 className="mt-2 truncate text-2xl font-black text-[#2B2B2B]">{run.title}</h2>
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
                <p className="text-sm font-black text-[#6F5226]">{run.pendingAction.title}</p>
                {run.pendingAction.description ? <p className="mt-1 text-sm font-semibold text-[#876F43]">{run.pendingAction.description}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={approving} onClick={() => onApprove(run.id, "approve")} type="button">
                    {approving ? <LoadingSpinner label="実行中" /> : <CheckCircle2 className="h-4 w-4" />}
                    実行する
                  </button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-none bg-white px-4 text-sm font-bold text-[#6F676B] ring-1 ring-[#F0E7E9] disabled:opacity-50" disabled={approving} onClick={() => onApprove(run.id, "cancel")} type="button">
                    <XCircle className="h-4 w-4" />
                    キャンセル
                  </button>
                </div>
              </div>
            ) : null}
            {run.pendingSelection ? (
              <div className="mt-4 rounded-none border border-[#D9E7F7] bg-[#F3F8FF] p-4">
                <p className="text-sm font-black text-[#355C86]">{run.pendingSelection.title}</p>
                {run.pendingSelection.description ? <p className="mt-1 text-sm font-semibold text-[#55718F]">{run.pendingSelection.description}</p> : null}
                <div className="mt-3 grid gap-2">
                  {run.pendingSelection.candidates.map((candidate) => (
                    <button className="grid gap-1 rounded-none border border-[#CFE0F3] bg-white p-3 text-left transition hover:border-[#9DBFE4] disabled:opacity-50" disabled={!candidate.id || selectingCandidateId === candidate.id} key={candidate.id ?? candidate.title} onClick={() => candidate.id ? onSelectCandidate(run.id, candidate.id) : undefined} type="button">
                      <span className="text-sm font-black text-[#2B2B2B]">{candidate.title}</span>
                      {candidate.subtitle ? <span className="text-xs font-bold text-[#6F7F8F]">{candidate.subtitle}</span> : null}
                      {selectingCandidateId === candidate.id ? <span className="text-xs font-bold text-[#EC6F8B]">選択中...</span> : null}
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
                    <span className="font-black text-[#2B2B2B]">{log.toolName} / {log.status === "success" ? "成功" : "失敗"}</span>
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
                <p className="truncate text-base font-black text-[#2B2B2B]">{card.title}</p>
                {card.subtitle ? <p className="mt-1 text-xs font-bold text-[#8A8186]">{card.subtitle}</p> : null}
              </div>
              {card.tone && card.tone !== "default" ? <span className="rounded-none bg-white px-2 py-1 text-xs font-black text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{card.tone}</span> : null}
            </div>
            {card.body ? <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#6F676B]">{card.body}</p> : null}
            {card.meta?.length ? (
              <dl className="mt-3 grid gap-2">
                {card.meta.map((item) => (
                  <div className="grid grid-cols-[88px_1fr] gap-2 text-xs" key={`${card.title}-${item.label}`}>
                    <dt className="font-black text-[#9A8F94]">{item.label}</dt>
                    <dd className="font-bold text-[#4F474B]">{item.value}</dd>
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
      <h3 className="flex items-center gap-2 text-lg font-bold text-[#2B2B2B]"><span className="text-[#EC6F8B]">{icon}</span>{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryPanel({ title, value, emptyText }: { title: string; value?: string | null; emptyText: string }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-[#2B2B2B]">{title}</h3>
      <div className="mt-4">
        {value ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-xs font-semibold leading-5 text-[#4F474B]">{value}</pre> : <EmptyInline text={emptyText} />}
      </div>
    </section>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <p className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-5 text-center text-sm font-bold text-[#8A8186]">{text}</p>;
}

function StepRow({ step }: { step: AgentRunStep }) {
  return (
    <div className="grid gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 md:grid-cols-[120px_120px_1fr]">
      <span className="text-sm font-black text-[#2B2B2B]">{stepLabel(step.type)}</span>
      <span className="text-sm font-bold text-[#EC6F8B]">{stepStatusLabel(step.status)}</span>
      <span className="text-sm font-semibold text-[#6F676B]">{step.message || "詳細はまだありません。"}</span>
    </div>
  );
}

function ProjectPanel({
  projects,
  draft,
  memoryProjectId,
  memoryDraft,
  savingProject,
  savingMemory,
  onDraftChange,
  onMemoryProjectChange,
  onMemoryChange,
  onSaveProject,
  onSaveMemory
}: {
  projects: DevelopmentProject[];
  draft: ProjectDraft;
  memoryProjectId: string;
  memoryDraft: Omit<ProjectMemory, "projectId" | "updatedAt">;
  savingProject: boolean;
  savingMemory: boolean;
  onDraftChange: (draft: ProjectDraft) => void;
  onMemoryProjectChange: (projectId: string) => void;
  onMemoryChange: (memory: Omit<ProjectMemory, "projectId" | "updatedAt">) => void;
  onSaveProject: () => void;
  onSaveMemory: () => void;
}) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[#2B2B2B]"><FolderKanban className="h-5 w-5 text-[#EC6F8B]" />開発プロジェクト</h2>
      <div className="mt-4 grid gap-2">
        {projects.slice(0, 5).map((project) => (
          <button className={`rounded-none border p-3 text-left ${memoryProjectId === project.id ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-[#FFFBFC]"}`} key={project.id} onClick={() => onMemoryProjectChange(project.id)} type="button">
            <span className="block text-sm font-black text-[#2B2B2B]">{project.name}</span>
            <span className="mt-1 block text-xs font-bold text-[#8A8186]">{project.slug} / {project.defaultBranch || "main"}</span>
          </button>
        ))}
        {projects.length === 0 ? <EmptyInline text="開発プロジェクトはまだありません。" /> : null}
      </div>

      <div className="mt-5 border-t border-[#F0E7E9] pt-5">
        <p className="text-sm font-black text-[#655D62]">新規プロジェクト</p>
        <div className="mt-3 grid gap-3">
          <Input label="名称" value={draft.name} onChange={(name) => onDraftChange({ ...draft, name, slug: draft.slug || slugify(name) })} />
          <Input label="slug" value={draft.slug} onChange={(slug) => onDraftChange({ ...draft, slug })} />
          <Input label="Repository URL" value={draft.repositoryUrl ?? ""} onChange={(repositoryUrl) => onDraftChange({ ...draft, repositoryUrl })} />
          <Input label="Framework" value={draft.framework ?? ""} onChange={(framework) => onDraftChange({ ...draft, framework })} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-none bg-[#EC6F8B] text-sm font-bold text-white disabled:opacity-50" disabled={savingProject || !draft.name.trim() || !draft.slug.trim()} onClick={() => void onSaveProject()} type="button">
            {savingProject ? <LoadingSpinner label="保存中" /> : <Save className="h-4 w-4" />}
            プロジェクトを保存
          </button>
        </div>
      </div>

      <div className="mt-5 border-t border-[#F0E7E9] pt-5">
        <p className="text-sm font-black text-[#655D62]">Project Memory</p>
        <div className="mt-3 grid gap-3">
          <MemoryText label="プロダクト概要" value={memoryDraft.productOverview ?? ""} onChange={(productOverview) => onMemoryChange({ ...memoryDraft, productOverview })} />
          <MemoryText label="Architecture" value={memoryDraft.architecture ?? ""} onChange={(architecture) => onMemoryChange({ ...memoryDraft, architecture })} />
          <MemoryText label="Design Rules" value={memoryDraft.designRules ?? ""} onChange={(designRules) => onMemoryChange({ ...memoryDraft, designRules })} />
          <MemoryText label="Coding Rules" value={memoryDraft.codingRules ?? ""} onChange={(codingRules) => onMemoryChange({ ...memoryDraft, codingRules })} />
          <MemoryText label="Decisions" value={memoryDraft.decisions ?? ""} onChange={(decisions) => onMemoryChange({ ...memoryDraft, decisions })} />
          <MemoryText label="Notes" value={memoryDraft.notes ?? ""} onChange={(notes) => onMemoryChange({ ...memoryDraft, notes })} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-none border border-[#F0DEE2] bg-white text-sm font-bold text-[#EC6F8B] disabled:opacity-50" disabled={savingMemory || !memoryProjectId} onClick={() => void onSaveMemory()} type="button">
            {savingMemory ? <LoadingSpinner label="保存中" /> : <Save className="h-4 w-4" />}
            Memoryを保存
          </button>
        </div>
      </div>
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-black text-[#8A8186]">
      {label}
      <input className="task-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MemoryText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-black text-[#8A8186]">
      {label}
      <textarea className="task-input min-h-24 resize-y text-sm leading-6" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-[#FFFBFC] p-3 ring-1 ring-[#F0E7E9]">
      <p className="text-xs font-black text-[#8A8186]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#2B2B2B]">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentRunStatus }) {
  const tone = status === "completed" ? "bg-[#F3FAF0] text-[#5E9B61]" : status === "error" ? "bg-[#FFF0F3] text-[#D94F6E]" : status === "running" ? "bg-[#EEF5FF] text-[#4E76AA]" : status === "requires_approval" ? "bg-[#FFF8E8] text-[#9B7332]" : "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]";
  return <span className={`inline-flex rounded-none px-2.5 py-1 text-xs font-black ${tone}`}>{statusLabels[status]}</span>;
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

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
