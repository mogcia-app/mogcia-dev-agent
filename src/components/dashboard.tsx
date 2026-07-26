"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { defaultAgentConfigs } from "@/domain/agent-configs";
import { aiRoutes, emailTemplates as fallbackEmailTemplates, generateTasks } from "@/domain/automation";
import { conversationLogsFromManualPaste, conversationLogsToTranscript } from "@/domain/conversation-logs";
import {
  calculateCodexProgress,
  createCodexResultRecord,
  createCodexTimelineEvent,
  findCompletedWorkTaskIds,
  mapCodexResultToProgressItems,
  parseCodexResultJson
} from "@/domain/codex-progress";
import { generateDemoGuideDraft } from "@/domain/demo-guide";
import { createDemoWorkTasks } from "@/domain/demo-tasks";
import { createMonthlyReport } from "@/domain/monthly-report";
import { createProductionWorkTasks } from "@/domain/production-tasks";
import { analyzeQuickCapture } from "@/domain/quick-capture";
import { generateRequirementDraft } from "@/domain/requirements";
import { createSnsOperationPlan, summarizeSnsAlerts } from "@/domain/sns-operation";
import { clients as fallbackClients, projectRules as fallbackRules, projects as fallbackProjects, timeline as fallbackTimeline } from "@/domain/sample-data";
import { resolveCommunicationSafety } from "@/domain/safety";
import { createWebsiteAnalysis } from "@/domain/website-analysis";
import { getApprovalStatus, getModeRestrictions, ISHIDA_EMAIL, mergeRules, needsIshidaApproval, rolePermissions, workflowStages } from "@/domain/rules";
import type {
  AgentConfig,
  AgentMode,
  AutomationSafety,
  Client,
  CodexResult,
  CodexRun,
  CodexCliRun,
  CompanyTimelineEvent,
  ConversationLog,
  CompanyContact,
  DemoGuideDraft,
  DevelopmentProgressItem,
  EmailTemplate,
  LocalDemoRun,
  MeetingAnalysis,
  MeetingAsset,
  MeetingKind,
  MeetingRecord,
  MinutesRecord,
  MonthlyReport,
  NotificationItem,
  OpenAiReview,
  Project,
  Product,
  ProductCategory,
  ProjectKind,
  ProjectSource,
  QuickCapture,
  QuickCaptureAnalysis,
  RequirementDraft,
  RuleLayer,
  ServiceKind,
  MaterialStatus,
  SnsOperationPlan,
  SnsPlatform,
  SnsPostStatus,
  SnsPostTask,
  SalesActivity,
  SalesActionTask,
  StorageAsset,
  TimelineEvent,
  UserRole,
  WebsiteAnalysis,
  WorkflowStage,
  WorkTask
} from "@/domain/types";
import {
  approveRequirementDraft,
  approveProject,
  createProjectWithMinutes,
  createProductionTasksForProject,
  loadDashboardCollections,
  rejectProject,
  saveAgentConfig,
  saveCodexCliRun,
  saveCodexProgressImport,
  saveDemoGuideDraft,
  saveDemoPreviewUrl,
  saveLocalDemoRun,
  saveMonthlyReport,
  saveClient,
  saveEmailTemplate,
  saveNotification,
  saveOpenAiReview,
  saveQuickCaptureBundle,
  saveRequirementDraftForProject,
  saveRuleLayer,
  saveCompanyContact,
  saveMeetingAnalysis,
  saveMeetingAsset,
  saveMeetingRecord,
  saveProduct,
  saveSalesActivity,
  saveSnsOperationPlanWithPosts,
  saveStorageAsset,
  saveWebsiteAnalysis,
  seedInitialFirestoreData,
  updateProjectStatus,
  updateRequirementDraft,
  updateSalesActionTask,
  updateSnsPostTask,
  updateWorkTaskStatus
} from "@/lib/firebase/repositories";
import { uploadMeetingAsset, uploadStorageAsset } from "@/lib/firebase/storage";
import { AppShell } from "./app-shell";
import { useAuth } from "./auth-provider";
import { AppDrawer } from "./drawers/AppDrawer";
import { MeetingsWorkspace } from "./meetings/MeetingsWorkspace";
import { CompanyHeader } from "./sales/CompanyHeader";
import { CompanyTimeline } from "./sales/CompanyTimeline";
import { EmptyState } from "./sales/EmptyState";
import { LastMeetingSummary } from "./sales/LastMeetingSummary";
import { NextActionList } from "./sales/NextActionList";
import { SalesCompanyList } from "./sales/SalesCompanyList";
import { SalesSummary } from "./sales/SalesSummary";
import {
  AiDashboardPage,
  DashboardColumn,
  DashboardPageChrome,
  DashboardStatsGrid,
  DashboardWorkspace,
  HomeDashboardPage,
  ProjectsDashboardPage,
  ReportsDashboardPage,
  SalesDashboardPage,
  SettingsDashboardPage,
  TasksDashboardPage
} from "./dashboard-pages";
import type { DashboardPage } from "./dashboard-sidebar";

interface DashboardData {
  clients: Client[];
  projects: Project[];
  ruleLayers: RuleLayer[];
  timelineEvents: TimelineEvent[];
  emailTemplates: EmailTemplate[];
  demoGuideDrafts: DemoGuideDraft[];
  agentConfigs: AgentConfig[];
  localDemoRuns: LocalDemoRun[];
  websiteAnalyses: WebsiteAnalysis[];
  monthlyReports: MonthlyReport[];
  notifications: NotificationItem[];
  storageAssets: StorageAsset[];
  openAiReviews: OpenAiReview[];
  codexCliRuns: CodexCliRun[];
  codexRuns: CodexRun[];
  codexResults: CodexResult[];
  developmentProgressItems: DevelopmentProgressItem[];
  snsOperationPlans: SnsOperationPlan[];
  snsPostTasks: SnsPostTask[];
  quickCaptures: QuickCapture[];
  companyTimelineEvents: CompanyTimelineEvent[];
  salesActionTasks: SalesActionTask[];
  companyContacts: CompanyContact[];
  salesActivities: SalesActivity[];
  meetings: MeetingRecord[];
  meetingAssets: MeetingAsset[];
  meetingAnalyses: MeetingAnalysis[];
  minutes: MinutesRecord[];
  requirementDrafts: RequirementDraft[];
  products: Product[];
  workTasks: WorkTask[];
}

const fallbackData: DashboardData = {
  clients: fallbackClients,
  projects: fallbackProjects,
  ruleLayers: fallbackRules,
  timelineEvents: fallbackTimeline,
  emailTemplates: fallbackEmailTemplates,
  demoGuideDrafts: [],
  agentConfigs: defaultAgentConfigs,
  localDemoRuns: [],
  websiteAnalyses: [],
  monthlyReports: [],
  notifications: [],
  storageAssets: [],
  openAiReviews: [],
  codexCliRuns: [],
  codexRuns: [],
  codexResults: [],
  developmentProgressItems: [],
  snsOperationPlans: [],
  snsPostTasks: [],
  quickCaptures: [],
  companyTimelineEvents: [],
  salesActionTasks: [],
  companyContacts: [],
  salesActivities: [],
  meetings: [],
  meetingAssets: [],
  meetingAnalyses: [],
  minutes: [],
  requirementDrafts: [],
  products: [],
  workTasks: []
};

interface ProjectRegistrationInput {
  clientName: string;
  industry: string;
  contactName: string;
  projectName: string;
  kind: ProjectKind;
  source: ProjectSource;
  mode: AgentMode;
  services: ServiceKind[];
  minutes: string;
}

type PageActionMode = "project" | "quick-capture" | "meeting" | "sns-plan" | "company" | null;

const productCategoryOptions: ProductCategory[] = ["HP", "LP", "SNS運用", "公式LINE", "システム", "その他"];

interface HomeCliEvent {
  id: string;
  command: string;
  projectId: string;
  projectName: string;
  status: "started" | "completed" | "failed" | "info";
  summary: string;
  previewUrl: string;
  createdAt: string;
  source: string;
}

const golfDemoTestInput: ProjectRegistrationInput = {
  clientName: "八女上陽ゴルフ倶楽部",
  industry: "ゴルフ場",
  contactName: "支配人",
  projectName: "公式LINEミニページ制作",
  kind: "development",
  source: "direct-client",
  mode: "demo",
  services: ["HP制作", "公式LINE運用"],
  minutes:
    "八女上陽ゴルフ倶楽部の公式LINEから見られるミニページを作りたい。\n\n現在はイベント情報をLINE配信で案内しているが、配信後に情報が流れてしまい、後から見返しにくい。お客様がイベント情報を一覧で確認できるページが欲しい。\n\nDemoでは、TOP、イベント一覧、イベント詳細を確認したい。\n\nTOPには今月のおすすめイベント、公式LINEへの導線、ゴルフ場の基本情報を載せたい。イベント一覧では、コンペ、レッスン、キャンペーンを並べたい。イベント詳細では、開催日、内容、対象者、参加方法、注意事項を表示したい。\n\n本番では将来的にLINE連携や予約導線も検討するが、今回のDemoではLINE API接続、予約機能、顧客DB、認証は実装しない。まずはローカルDemoで画面構成と導線を確認したい。"
};

const serviceOptions: ServiceKind[] = ["HP制作", "LP制作", "SNS運用", "公式LINE運用", "commo.", "tellmo.", "Signal.", "Roomly.", "MOGCIA"];

function getVisibleDemoTasks(tasks: WorkTask[]): WorkTask[] {
  const demoTasks = tasks.filter((task) => task.kind === "demo");
  const projectsWithDetailedTasks = new Set(
    demoTasks.filter((task) => task.group === "local-demo-generation" || typeof task.order === "number").map((task) => task.projectId)
  );

  return demoTasks
    .filter((task) => {
      const isDetailedTask = task.group === "local-demo-generation" || typeof task.order === "number";
      return isDetailedTask || !projectsWithDetailedTasks.has(task.projectId);
    })
    .sort((a, b) => {
      if (a.projectId !== b.projectId) return a.projectId.localeCompare(b.projectId);
      return (a.order ?? 999) - (b.order ?? 999);
    });
}

function getVisibleProductionTasks(tasks: WorkTask[]): WorkTask[] {
  return tasks
    .filter((task) => task.kind === "production")
    .slice()
    .sort((a, b) => {
      if (a.projectId !== b.projectId) return a.projectId.localeCompare(b.projectId);
      return (a.order ?? 999) - (b.order ?? 999);
    });
}

function sortRequirementDrafts(drafts: RequirementDraft[]): RequirementDraft[] {
  return drafts.slice().sort((a, b) => {
    const versionDiff = (b.version ?? 1) - (a.version ?? 1);
    if (versionDiff !== 0) return versionDiff;
    return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });
}

function withRequirementVersion(draft: RequirementDraft, existingDrafts: RequirementDraft[], changeNote: string): RequirementDraft {
  const nextVersion =
    Math.max(
      0,
      ...existingDrafts
        .filter((item) => item.minutesId === draft.minutesId || item.projectId === draft.projectId)
        .map((item) => item.version ?? 1)
    ) + 1;

  return {
    ...draft,
    version: nextVersion,
    sourceLabel: "AI生成",
    changeNote
  };
}

function createDemoSafetyChecks(run?: LocalDemoRun) {
  return (
    run?.safetyChecks ?? [
      { id: "no-github", label: "GitHubリポジトリを作成していない", passed: true },
      { id: "no-vercel", label: "Vercelへデプロイしていない", passed: true },
      { id: "no-firebase-project", label: "Firebaseプロジェクトを作成していない", passed: true },
      { id: "no-external-api", label: "外部APIへ接続していない", passed: true },
      { id: "no-real-customer-data", label: "実在顧客データを埋め込んでいない", passed: true },
      { id: "no-secrets", label: "認証情報をコードに含めていない", passed: true }
    ]
  );
}

function taskDueWeight(due: string): number {
  if (!due) return 999;
  if (due.includes("今日")) return 0;
  if (due.includes("明日")) return 1;
  if (due.includes("来週")) return 7;
  const parsed = new Date(due).getTime();
  return Number.isNaN(parsed) ? 500 : parsed;
}

function isTodayDue(due?: string): boolean {
  if (!due) return false;
  if (due.includes("今日")) return true;
  return isSameDay(due, new Date());
}

function isOverdueDue(due?: string): boolean {
  if (!due || due.includes("今日") || due.includes("明日") || due.includes("来週")) return false;
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime() < today.getTime();
}

function isSameDay(value: string, target: Date): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}

function detectDuplicateClients(clients: Client[]): Client[][] {
  const groups = new Map<string, Client[]>();
  clients.forEach((client) => {
    const key = client.name.replace(/\s+/g, "").toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), client]);
  });
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function extractKeywordLines(text: string, keywords: string[]): string[] {
  return text
    .split(/\n|。/)
    .map((line) => line.trim())
    .filter((line) => line && keywords.some((keyword) => line.includes(keyword)))
    .slice(0, 6);
}

function mergeProgressItems(current: DevelopmentProgressItem[], incoming: DevelopmentProgressItem[]): DevelopmentProgressItem[] {
  const items = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => items.set(item.id, item));
  return Array.from(items.values());
}

function pageFromPath(pathname: string): DashboardPage {
  if (pathname === "/" || pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/tasks") || pathname.startsWith("/projects/demo") || pathname.startsWith("/projects/codex") || pathname.startsWith("/delivery") || pathname.startsWith("/codex")) return "tasks";
  if (pathname.startsWith("/projects") || pathname.startsWith("/requirements")) return "projects";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/calendar") || pathname.startsWith("/sales") || pathname.startsWith("/companies") || pathname.startsWith("/meetings") || pathname.startsWith("/timeline")) return "crm";
  if (pathname.startsWith("/ai/prompt-rules") || pathname.startsWith("/ai/command-rules") || pathname.startsWith("/ai/prompts") || pathname.startsWith("/ai/orchestration") || pathname.startsWith("/settings/rules")) return "rules";
  if (pathname.startsWith("/ai")) return "routing";
  if (pathname.startsWith("/sns")) return "sns";
  if (pathname.startsWith("/analysis") || pathname.startsWith("/analytics")) return "reports";
  if (pathname.startsWith("/settings/team") || pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/settings/gmail")) return "gmail";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

function routeForPage(page: DashboardPage): string {
  const routes: Record<DashboardPage, string> = {
    home: "/home",
    projects: "/projects",
    crm: "/sales",
    rules: "/settings/rules",
    routing: "/ai",
    tasks: "/projects/demo",
    gmail: "/settings",
    reports: "/analysis",
    sns: "/sns",
    team: "/settings/team",
    products: "/products",
    settings: "/settings"
  };

  return routes[page];
}

export function Dashboard() {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<DashboardData>(fallbackData);
  const [source, setSource] = useState<"sample" | "firestore">("sample");
  const [status, setStatus] = useState("サンプルデータで表示中");
  const [isSeeding, setIsSeeding] = useState(false);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [requirementsActionId, setRequirementsActionId] = useState<string | null>(null);
  const [draftActionId, setDraftActionId] = useState<string | null>(null);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);
  const [demoActionId, setDemoActionId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const [pageAction, setPageAction] = useState<PageActionMode>(null);
  const [salesSearch, setSalesSearch] = useState("");
  const [salesFilter, setSalesFilter] = useState("all");
  const [homeCliEvents, setHomeCliEvents] = useState<HomeCliEvent[]>([]);
  const activePage = pageFromPath(pathname);
  const navigateToPage = (page: DashboardPage) => router.push(routeForPage(page) as Route<string>);

  const refreshFirestore = useCallback(async (): Promise<DashboardData | null> => {
    if (!auth.firebaseConfigured || !auth.user) return null;
    const remote = await loadDashboardCollections();
    const hasRemoteData = remote.projects.length > 0 && remote.clients.length > 0;

    if (hasRemoteData) {
      return {
        clients: remote.clients,
        projects: remote.projects,
        ruleLayers: remote.ruleLayers.length > 0 ? remote.ruleLayers : fallbackRules,
        timelineEvents: remote.timelineEvents.length > 0 ? remote.timelineEvents : fallbackTimeline,
        emailTemplates: remote.emailTemplates.length > 0 ? remote.emailTemplates : fallbackEmailTemplates,
        demoGuideDrafts: remote.demoGuideDrafts,
        agentConfigs: remote.agentConfigs.length > 0 ? remote.agentConfigs : defaultAgentConfigs,
        localDemoRuns: remote.localDemoRuns,
        websiteAnalyses: remote.websiteAnalyses,
        monthlyReports: remote.monthlyReports,
        notifications: remote.notifications,
        storageAssets: remote.storageAssets,
        openAiReviews: remote.openAiReviews,
        codexCliRuns: remote.codexCliRuns,
        codexRuns: remote.codexRuns,
        codexResults: remote.codexResults,
        developmentProgressItems: remote.developmentProgressItems,
        snsOperationPlans: remote.snsOperationPlans,
        snsPostTasks: remote.snsPostTasks,
        quickCaptures: remote.quickCaptures,
        companyTimelineEvents: remote.companyTimelineEvents,
        salesActionTasks: remote.salesActionTasks,
        companyContacts: remote.companyContacts,
        salesActivities: remote.salesActivities,
        meetings: remote.meetings,
        meetingAssets: remote.meetingAssets,
        meetingAnalyses: remote.meetingAnalyses,
        minutes: remote.minutes,
        requirementDrafts: remote.requirementDrafts,
        products: remote.products,
        workTasks: remote.workTasks
      };
    }

    return null;
  }, [auth.firebaseConfigured, auth.user]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (auth.loading) return;

      setIsDashboardReady(false);

      try {
        if (!auth.firebaseConfigured) {
          setData(fallbackData);
          setSource("sample");
          setStatus("Firebase未設定です");
          return;
        }

        if (!auth.user) {
          setData(fallbackData);
          setSource("sample");
          setStatus("ログイン待ち");
          return;
        }

        const remoteData = await refreshFirestore();
        if (!active) return;

        if (remoteData) {
          setData(remoteData);
          setSource("firestore");
          setStatus("Firestoreと同期中");
          return;
        }

        setData(fallbackData);
        setSource("sample");
        setStatus("Firestoreは空です。初期データ投入で永続化できます");
      } catch (error: unknown) {
        if (!active) return;
        setSource("sample");
        setData(fallbackData);
        setStatus(error instanceof Error ? `Firestore読込エラー: ${error.message}` : "Firestore読込エラー");
      } finally {
        if (active) setIsDashboardReady(true);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [auth.firebaseConfigured, auth.loading, auth.user, refreshFirestore]);

  const refreshHomeCliEvents = useCallback(async () => {
    try {
      const response = await fetch("/api/cli/events", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { events?: HomeCliEvent[] };
      setHomeCliEvents(payload.events ?? []);
    } catch {
      setHomeCliEvents([]);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshHomeCliEvents();
    }, 0);
    const timer = window.setInterval(() => {
      void refreshHomeCliEvents();
    }, 5000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refreshHomeCliEvents]);

  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean);
    const routeId = segments[1];
    if (!routeId) return;

    let nextProjectId: string | null = null;
    if (segments[0] === "projects") {
      const project = data.projects.find((item) => item.id === routeId);
      nextProjectId = project?.id ?? null;
    }

    if (segments[0] === "companies") {
      const project = data.projects.find((item) => item.clientId === routeId);
      nextProjectId = project?.id ?? null;
    }

    if (!nextProjectId || nextProjectId === selectedProjectId) return;
    const timer = window.setTimeout(() => setSelectedProjectId(nextProjectId), 0);
    return () => window.clearTimeout(timer);
  }, [data.projects, pathname, selectedProjectId]);

  const resolvedSelectedProjectId = selectedProjectId && data.projects.some((project) => project.id === selectedProjectId) ? selectedProjectId : data.projects[0]?.id;
  const activeProject = data.projects.find((project) => project.id === resolvedSelectedProjectId) ?? data.projects[0] ?? fallbackProjects[0];
  const activeClient = data.clients.find((client) => client.id === activeProject.clientId) ?? fallbackClients[0];
  const activeMinutes = data.minutes.filter((minutes) => minutes.projectId === activeProject.id);
  const activeDrafts = sortRequirementDrafts(data.requirementDrafts.filter((draft) => draft.projectId === activeProject.id));
  const activeDemoTasks = getVisibleDemoTasks(data.workTasks).filter((task) => task.projectId === activeProject.id);
  const activeProductionTasks = getVisibleProductionTasks(data.workTasks).filter((task) => task.projectId === activeProject.id);
  const activeWorkTasks = data.workTasks.filter((task) => task.projectId === activeProject.id);
  const activeCodexRuns = data.codexRuns
    .filter((run) => run.projectId === activeProject.id)
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  const activeCodexResults = data.codexResults
    .filter((result) => result.projectId === activeProject.id)
    .slice()
    .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
  const activeDevelopmentProgressItems = data.developmentProgressItems.filter((item) => item.projectId === activeProject.id);
  const latestCodexResult = activeCodexResults[0];
  const codexProgress = calculateCodexProgress({ progressItems: activeDevelopmentProgressItems, tasks: activeWorkTasks });
  const activeGuideDraft = data.demoGuideDrafts.find((draft) => draft.projectId === activeProject.id);
  const activeSnsPlans = data.snsOperationPlans
    .filter((plan) => plan.projectId === activeProject.id)
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month));
  const activeSnsPosts = data.snsPostTasks.filter((post) => post.projectId === activeProject.id);
  const activeCompanyTimelineEvents = data.companyTimelineEvents
    .filter((event) => event.clientId === activeClient.id)
    .slice()
    .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());
  const activeSalesActionTasks = data.salesActionTasks
    .filter((task) => task.clientId === activeClient.id && task.status !== "done")
    .slice()
    .sort((a, b) => taskDueWeight(a.due) - taskDueWeight(b.due));
  const activeCompanyContacts = data.companyContacts.filter((contact) => contact.clientId === activeClient.id);
  const activeSalesActivities = data.salesActivities.filter((activity) => activity.clientId === activeClient.id);
  const activeMeetings = data.meetings.filter((meeting) => meeting.clientId === activeClient.id);
  const activeMeetingAssets = data.meetingAssets.filter((asset) => asset.clientId === activeClient.id);
  const activeMeetingAnalyses = data.meetingAnalyses.filter((analysis) => analysis.clientId === activeClient.id);
  const activeDemoRun = data.localDemoRuns
    .filter((run) => run.projectId === activeProject.id)
    .slice()
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
  const generatedTasks = generateTasks(activeProject);
  const mergedRules = mergeRules(data.ruleLayers);
  const approvalProjects = data.projects.filter((project) => getApprovalStatus(project) === "pending");
  const visibleDemoTasks = getVisibleDemoTasks(data.workTasks);
  const visibleProductionTasks = getVisibleProductionTasks(data.workTasks);
  const crmView = pathname.startsWith("/meetings")
    ? "meetings"
    : pathname.startsWith("/calendar")
      ? "calendar"
    : pathname.startsWith("/companies/")
      ? "company"
      : pathname.startsWith("/timeline") || pathname.startsWith("/sales/timeline")
        ? "timeline"
        : "sales";
  const allOpenSalesTasks = data.salesActionTasks.filter((task) => task.status !== "done");
  const todaySalesTasks = allOpenSalesTasks.filter((task) => isTodayDue(task.due));
  const overdueSalesTasks = allOpenSalesTasks.filter((task) => isOverdueDue(task.due));
  const todayMeetings = data.meetings.filter((meeting) => isSameDay(meeting.startedAt, new Date()));
  const confirmationSalesTasks = allOpenSalesTasks.filter((task) => task.status === "doing" || task.importance === "high");
  const duplicateClientGroups = detectDuplicateClients(data.clients);
  const latestActiveMeeting = activeMeetings.slice().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  const latestActiveMeetingAnalysis = latestActiveMeeting ? activeMeetingAnalyses.find((analysis) => analysis.meetingId === latestActiveMeeting.id) : undefined;
  const isRequirementsRoute = pathname.startsWith("/requirements") || pathname.startsWith("/projects/requirements");
  const isDeliveryRoute = pathname.startsWith("/delivery") || pathname.startsWith("/projects/demo");
  const isCodexRoute = pathname.startsWith("/codex") || pathname.startsWith("/projects/codex");
  const isTasksRoute = pathname.startsWith("/tasks");
  const isProjectDetailRoute = pathname.startsWith("/projects/") && !isRequirementsRoute && !isDeliveryRoute && !isCodexRoute;
  const doneDemoTasks = visibleDemoTasks.filter((task) => task.status === "done").length;
  const doneProductionTasks = visibleProductionTasks.filter((task) => task.status === "done").length;
  const demoProgress = visibleDemoTasks.length > 0 ? Math.round((doneDemoTasks / visibleDemoTasks.length) * 100) : 0;
  const productionProgress = visibleProductionTasks.length > 0 ? Math.round((doneProductionTasks / visibleProductionTasks.length) * 100) : 0;
  const statCards = [
    { label: "進行中の案件", value: data.projects.filter((project) => !["完了", "失注", "解約"].includes(project.status)).length, note: "営業から運用まで" },
    { label: "完了したタスク", value: data.workTasks.filter((task) => task.status === "done").length, note: "Codex / Sales" },
    { label: "商談予定", value: data.meetings.length, note: "登録済み会議" },
    { label: "確認待ち", value: approvalProjects.length + data.snsPostTasks.filter((post) => post.status === "確認待ち").length, note: "承認・SNS確認" },
    { label: "今日の予定", value: activeSalesActionTasks.length, note: "次回アクション" }
  ];
  const homeTodoItems = [
    ...approvalProjects.slice(0, 2).map((project) => `要件レビュー: ${project.name}`),
    ...activeSalesActionTasks.slice(0, 2).map((task) => task.title),
    visibleDemoTasks.some((task) => task.status !== "done") ? "Demo生成タスク確認" : "",
    latestCodexResult ? "Codex進捗の差分確認" : "Codex Result JSON取込"
  ].filter(Boolean);
  const agentNotices = [
    latestCodexResult ? `Codexが「${latestCodexResult.summary}」を報告しました` : "Codexの実行結果はまだ取り込まれていません",
    activeDrafts[0] ? `Claude要件定義: ${activeDrafts[0].summary.slice(0, 48)}...` : "議事録から要件定義を生成できます",
    data.openAiReviews[0] ? `OpenAIレビュー完了: ${data.openAiReviews[0].title}` : "OpenAIレビューは待機中"
  ];
  const handleSeed = async () => {
    setIsSeeding(true);
    setStatus("Firestoreへ初期データ投入中");
    try {
      await seedInitialFirestoreData();
      const remoteData = await refreshFirestore();
      if (remoteData) {
        setData(remoteData);
        setSource("firestore");
        setStatus("Firestoreへ初期データを保存しました");
      }
    } catch (error) {
      setStatus(error instanceof Error ? `初期投入エラー: ${error.message}` : "初期投入エラー");
    } finally {
      setIsSeeding(false);
    }
  };

  const registerProjectWithMinutes = async (input: ProjectRegistrationInput) => {
    const createdBy = auth.user?.email ?? "local-user";
    setStatus("案件と議事録を登録中");

    try {
      if (source === "firestore" && auth.user) {
        const created = await createProjectWithMinutes({ ...input, createdBy });
        const remoteData = await refreshFirestore();
        if (remoteData) {
          setData(remoteData);
          setSource("firestore");
        }
        setSelectedProjectId(created.project.id);
      } else {
        const clientId = `client-local-${Date.now()}`;
        const projectId = `project-local-${Date.now()}`;
        const minutesId = `minutes-local-${Date.now()}`;
        const timelineId = `timeline-local-${Date.now()}`;
        const needsApproval = input.source === "agency" || input.source === "direct-client";
        const client: Client = {
          id: clientId,
          name: input.clientName,
          industry: input.industry,
          contactName: input.contactName,
          services: input.services
        };
        const project: Project = {
          id: projectId,
          clientId,
          name: input.projectName,
          kind: input.kind,
          source: input.source,
          mode: input.mode,
          status: needsApproval ? "承認待ち" : "要件整理中",
          approvalStatus: needsApproval ? "pending" : "not-required",
          services: input.services,
          owner: createdBy,
          nextAction: needsApproval ? "議事録登録済み。AI要件定義後、石田承認へ進行" : "議事録登録済み。AI要件定義とローカルDemo生成へ進行"
        };
        const minutes: MinutesRecord = {
          id: minutesId,
          clientId,
          projectId,
          content: input.minutes,
          registeredBy: createdBy,
          registeredAt: new Date().toISOString()
        };
        const timelineEvent: TimelineEvent = {
          id: timelineId,
          clientId,
          kind: "minutes",
          title: "議事録登録",
          date: new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric" }),
          summary: `${input.projectName} のヒアリング内容を登録`
        };

        setData((current) => ({
          ...current,
          clients: [client, ...current.clients],
          projects: [project, ...current.projects],
          minutes: [minutes, ...current.minutes],
          timelineEvents: [timelineEvent, ...current.timelineEvents]
        }));
        setSelectedProjectId(project.id);
      }

      setStatus("案件と議事録を登録しました");
    } catch (error) {
      setStatus(error instanceof Error ? `登録エラー: ${error.message}` : "登録エラー");
      throw error;
    }
  };

  const saveCompanyFromDrawer = async (client: Client) => {
    const now = new Date().toISOString();
    const nextClient = {
      ...client,
      id: client.id || `client-${crypto.randomUUID()}`,
      createdAt: client.createdAt ?? now,
      updatedAt: now
    };
    setStatus("会社を保存中");
    try {
      if (source === "firestore" && auth.user) {
        await saveClient(nextClient);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          clients: [nextClient, ...current.clients.filter((item) => item.id !== nextClient.id)]
        }));
      }
      setStatus("会社を保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `会社保存エラー: ${error.message}` : "会社保存エラー");
    }
  };

  const saveProductFromPage = async (product: Product) => {
    const now = new Date().toISOString();
    const nextProduct: Product = {
      ...product,
      id: product.id || `product-${crypto.randomUUID()}`,
      createdBy: product.createdBy || auth.user?.email || "local-user",
      createdAt: product.createdAt || now,
      updatedAt: now
    };
    setStatus("商材を保存中");
    try {
      if (source === "firestore" && auth.user) {
        await saveProduct(nextProduct);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          products: [nextProduct, ...current.products.filter((item) => item.id !== nextProduct.id)]
        }));
      }
      setStatus("商材を保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `商材保存エラー: ${error.message}` : "商材保存エラー");
    }
  };

  const applyProjectApproval = async (project: Project, action: "approve" | "reject") => {
    const approverEmail = auth.user?.email;
    if (!auth.isIshida || !approverEmail) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインすると承認できます`);
      return;
    }

    setApprovalActionId(project.id);
    setStatus(action === "approve" ? "石田承認を保存中" : "差し戻しを保存中");

    try {
      if (source === "firestore") {
        if (action === "approve") {
          await approveProject(project.id, approverEmail);
        } else {
          await rejectProject(project.id, approverEmail);
        }
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          projects: current.projects.map((item) =>
            item.id === project.id
              ? {
                  ...item,
                  approvalStatus: action === "approve" ? "approved" : "rejected",
                  approvedBy: action === "approve" ? approverEmail : item.approvedBy,
                  approvedAt: action === "approve" ? new Date().toISOString() : item.approvedAt,
                  rejectedBy: action === "reject" ? approverEmail : item.rejectedBy,
                  rejectedAt: action === "reject" ? new Date().toISOString() : item.rejectedAt,
                  status: action === "approve" ? "デモ作成中" : "保留",
                  nextAction: action === "approve" ? "石田承認済み。CodexでローカルDemo生成へ進行" : "石田差し戻し。要件・不足確認を更新"
                }
              : item
          )
        }));
      }

      setStatus(action === "approve" ? "石田承認済み" : "石田差し戻し済み");
    } catch (error) {
      setStatus(error instanceof Error ? `承認処理エラー: ${error.message}` : "承認処理エラー");
    } finally {
      setApprovalActionId(null);
    }
  };

  const generateRequirementsForMinutes = async (minutes: MinutesRecord) => {
    const client = data.clients.find((item) => item.id === minutes.clientId);
    const project = data.projects.find((item) => item.id === minutes.projectId);

    if (!client || !project) {
      setStatus("顧客または案件が見つかりません");
      return;
    }

    setRequirementsActionId(minutes.id);
    setStatus("要件定義ドラフトを生成中");

    try {
      const existingDrafts = data.requirementDrafts.filter((draft) => draft.projectId === project.id || draft.minutesId === minutes.id);
      if (source === "firestore" && auth.user) {
        const generatedDraft = await requestRequirementDraft({ client, project, minutes, ruleLayers: data.ruleLayers });
        const draft = withRequirementVersion(
          generatedDraft,
          existingDrafts,
          existingDrafts.length > 0 ? "再生成。前Versionは履歴として保持" : "初回生成"
        );
        await saveRequirementDraftForProject({ project, draft });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        const generatedDraft = generateRequirementDraft({ client, project, minutes });
        const draft = withRequirementVersion(
          generatedDraft,
          existingDrafts,
          existingDrafts.length > 0 ? "再生成。前Versionは履歴として保持" : "初回生成"
        );
        setData((current) => ({
          ...current,
          requirementDrafts: [draft, ...current.requirementDrafts],
          projects: current.projects.map((item) =>
            item.id === project.id
              ? {
                  ...item,
                  requirementDraftId: draft.id,
                  status: "要件確認中",
                  nextAction:
                    item.approvalStatus === "not-required"
                      ? "要件定義ドラフト生成済み。Demo生成へ進行可能"
                      : "要件定義ドラフト生成済み。石田承認後にDemo生成へ進行"
                }
              : item
          )
        }));
      }

      setStatus(existingDrafts.length > 0 ? "要件定義ドラフトを再生成し、履歴に追加しました" : "要件定義ドラフトを生成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `要件定義生成エラー: ${error.message}` : "要件定義生成エラー");
    } finally {
      setRequirementsActionId(null);
    }
  };

  const saveRequirementDraftEdits = async (draft: RequirementDraft) => {
    const editorEmail = auth.user?.email;
    if (!auth.isIshida || !editorEmail) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインすると編集できます`);
      return;
    }

    setDraftActionId(draft.id);
    setStatus("要件定義ドラフトを保存中");

    try {
      if (source === "firestore") {
        await updateRequirementDraft(draft, editorEmail);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          requirementDrafts: current.requirementDrafts.map((item) =>
            item.id === draft.id
              ? { ...draft, sourceLabel: "石田修正", changeNote: draft.changeNote || "石田修正", updatedBy: editorEmail, updatedAt: new Date().toISOString() }
              : item
          )
        }));
      }
      setStatus("要件定義ドラフトを保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `要件定義保存エラー: ${error.message}` : "要件定義保存エラー");
    } finally {
      setDraftActionId(null);
    }
  };

  const approveRequirements = async (draft: RequirementDraft) => {
    const approverEmail = auth.user?.email;
    const project = data.projects.find((item) => item.id === draft.projectId);
    if (!project) {
      setStatus("案件が見つかりません");
      return;
    }
    if (!auth.isIshida || !approverEmail) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインすると承認できます`);
      return;
    }

    setDraftActionId(draft.id);
    setStatus("要件定義を承認中");

    try {
      if (source === "firestore") {
        await approveRequirementDraft({ draft, project, approverEmail });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        const tasks = createDemoWorkTasks({ project, draft, createdBy: approverEmail });
        setData((current) => ({
          ...current,
          requirementDrafts: current.requirementDrafts.map((item) =>
            item.id === draft.id ? { ...item, approvalStatus: "approved", approvedBy: approverEmail, approvedAt: new Date().toISOString() } : item
          ),
          projects: current.projects.map((item) =>
            item.id === project.id ? { ...item, status: "承認済み", nextAction: "要件定義承認済み。CodexでローカルDemo生成タスクへ進行" } : item
          ),
          workTasks: [...tasks, ...current.workTasks.filter((item) => !tasks.some((task) => task.id === item.id))]
        }));
      }
      setStatus("要件定義を承認し、Demo生成タスクを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `要件定義承認エラー: ${error.message}` : "要件定義承認エラー");
    } finally {
      setDraftActionId(null);
    }
  };

  const changeWorkTaskStatus = async (task: WorkTask, status: NonNullable<WorkTask["status"]>) => {
    const updatedBy = auth.user?.email;
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとタスクを更新できます`);
      return;
    }

    setTaskActionId(task.id);
    setStatus("タスクを更新中");

    try {
      if (source === "firestore") {
        await updateWorkTaskStatus({ taskId: task.id, status, updatedBy });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          workTasks: current.workTasks.map((item) => (item.id === task.id ? { ...item, status } : item))
        }));
      }
      setStatus("タスクを更新しました");
    } catch (error) {
      setStatus(error instanceof Error ? `タスク更新エラー: ${error.message}` : "タスク更新エラー");
    } finally {
      setTaskActionId(null);
    }
  };

  const createProductionTasksFromDraft = async (draft: RequirementDraft) => {
    const createdBy = auth.user?.email;
    const project = data.projects.find((item) => item.id === draft.projectId);
    if (!project) {
      setStatus("案件が見つかりません");
      return;
    }
    if (!auth.isIshida || !createdBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインすると本番化タスクを生成できます`);
      return;
    }

    setDraftActionId(draft.id);
    setStatus("本番化タスクを生成中");

    try {
      if (source === "firestore") {
        await createProductionTasksForProject({ project, draft, createdBy });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        const tasks = createProductionWorkTasks({ project, draft, createdBy });
        setData((current) => ({
          ...current,
          projects: current.projects.map((item) =>
            item.id === project.id ? { ...item, status: "契約待ち", nextAction: "本番化タスク作成済み。契約後、石田承認で実行へ進行" } : item
          ),
          workTasks: [...tasks, ...current.workTasks.filter((item) => !tasks.some((task) => task.id === item.id))]
        }));
      }
      setStatus("本番化タスクを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `本番化タスク生成エラー: ${error.message}` : "本番化タスク生成エラー");
    } finally {
      setDraftActionId(null);
    }
  };

  const recordDemoPreviewUrl = async (task: WorkTask, previewUrl: string) => {
    const updatedBy = auth.user?.email;
    const project = data.projects.find((item) => item.id === task.projectId);
    const normalizedPreviewUrl = previewUrl.trim();

    if (!project) {
      setStatus("案件が見つかりません");
      return;
    }
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとPreview URLを保存できます`);
      return;
    }
    if (!isPreviewUrl(normalizedPreviewUrl)) {
      setStatus("Preview URLは http://localhost:3000 または https://... の形式で入力してください");
      return;
    }

    setTaskActionId(task.id);
    setStatus("Preview URLを保存中");

    try {
      if (source === "firestore") {
        await saveDemoPreviewUrl({ task, project, previewUrl: normalizedPreviewUrl, updatedBy });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          projects: current.projects.map((item) =>
            item.id === project.id
              ? { ...item, demoUrl: normalizedPreviewUrl, status: "デモ完成", nextAction: "Preview URL記録済み。デモ案内準備へ進行" }
              : item
          ),
          workTasks: current.workTasks.map((item) => (item.id === task.id ? { ...item, previewUrl: normalizedPreviewUrl, status: "done" } : item))
        }));
      }
      setStatus("Preview URLを案件へ紐づけました");
    } catch (error) {
      setStatus(error instanceof Error ? `Preview URL保存エラー: ${error.message}` : "Preview URL保存エラー");
    } finally {
      setTaskActionId(null);
    }
  };

  const createDemoGuideForTask = async (task: WorkTask) => {
    const updatedBy = auth.user?.email;
    const project = data.projects.find((item) => item.id === task.projectId);
    const client = project ? data.clients.find((item) => item.id === project.clientId) : undefined;
    const requirementDraft = data.requirementDrafts.find((item) => item.projectId === task.projectId);

    if (!project || !client) {
      setStatus("案件または顧客が見つかりません");
      return;
    }
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとデモ案内文を生成できます`);
      return;
    }

    const guideDraft = generateDemoGuideDraft({ client, project, requirementDraft, task, createdBy: updatedBy });
    setTaskActionId(task.id);
    setStatus("デモ案内文の下書きを生成中");

    try {
      if (source === "firestore") {
        await saveDemoGuideDraft({ guideDraft, task, project, updatedBy });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          demoGuideDrafts: [guideDraft, ...current.demoGuideDrafts.filter((item) => item.id !== guideDraft.id)],
          projects: current.projects.map((item) =>
            item.id === project.id
              ? { ...item, status: "デモ案内待ち", nextAction: "デモ案内文の下書き作成済み。石田確認後、送付へ進行" }
              : item
          ),
          workTasks: current.workTasks.map((item) => (item.id === task.id ? { ...item, status: "done" } : item))
        }));
      }
      setStatus("デモ案内文の下書きを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `デモ案内文生成エラー: ${error.message}` : "デモ案内文生成エラー");
    } finally {
      setTaskActionId(null);
    }
  };

  const saveRuleLayerFromEditor = async (ruleLayer: RuleLayer) => {
    const updatedBy = auth.user?.email;
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとRuleを編集できます`);
      return;
    }

    setStatus("Ruleを保存中");
    try {
      if (source === "firestore") {
        await saveRuleLayer(ruleLayer, updatedBy);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          ruleLayers: current.ruleLayers.map((item) => (item.id === ruleLayer.id ? ruleLayer : item))
        }));
      }
      setStatus("Ruleを保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `Rule保存エラー: ${error.message}` : "Rule保存エラー");
    }
  };

  const saveAgentConfigFromEditor = async (agentConfig: AgentConfig) => {
    const updatedBy = auth.user?.email;
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとAI Routingを編集できます`);
      return;
    }

    setStatus("AI Routingを保存中");
    try {
      if (source === "firestore") {
        await saveAgentConfig(agentConfig, updatedBy);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          agentConfigs: current.agentConfigs.map((item) => (item.id === agentConfig.id ? agentConfig : item))
        }));
      }
      setStatus("AI Routingを保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `AI Routing保存エラー: ${error.message}` : "AI Routing保存エラー");
    }
  };

  const addAgentConfigFromEditor = async (agentConfig: AgentConfig) => {
    const updatedBy = auth.user?.email;
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとAgentを追加できます`);
      return;
    }

    try {
      if (source === "firestore") {
        await saveAgentConfig(agentConfig, updatedBy);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, agentConfigs: [agentConfig, ...current.agentConfigs] }));
      }
      setStatus("Agentを追加しました");
    } catch (error) {
      setStatus(error instanceof Error ? `Agent追加エラー: ${error.message}` : "Agent追加エラー");
    }
  };

  const generateLocalDemoForActiveProject = async () => {
    const createdBy = auth.user?.email ?? "local-user";
    const draft = activeDrafts[0];
    if (demoActionId === activeProject.id) return;
    setDemoActionId(activeProject.id);
    setStatus("ローカルDemoを生成中");

    try {
      const response = await fetch("/api/demo/local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client: activeClient, project: activeProject, draft, createdBy })
      });
      if (!response.ok) throw new Error("ローカルDemo生成APIに失敗しました");
      const result = (await response.json()) as { run: LocalDemoRun };

      if (source === "firestore" && auth.isIshida) {
        await saveLocalDemoRun(result.run);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          localDemoRuns: [result.run, ...current.localDemoRuns.filter((run) => run.id !== result.run.id)]
        }));
      }
      setStatus("ローカルDemoを生成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `ローカルDemo生成エラー: ${error.message}` : "ローカルDemo生成エラー");
    } finally {
      setDemoActionId(null);
    }
  };

  const createWebsiteAnalysisFromUrl = async (url: string) => {
    const createdBy = auth.user?.email ?? "local-user";
    try {
      const analysis = createWebsiteAnalysis({ url, createdBy });
      if (source === "firestore" && auth.isIshida) {
        await saveWebsiteAnalysis(analysis);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, websiteAnalyses: [analysis, ...current.websiteAnalyses] }));
      }
      setStatus("Website Analysisを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `Website Analysisエラー: ${error.message}` : "Website Analysisエラー");
    }
  };

  const createMonthlyReportFromInput = async ({ title, period, sourceText }: { title: string; period: string; sourceText: string }) => {
    const createdBy = auth.user?.email ?? "local-user";
    const report = createMonthlyReport({ title, period, sourceText, createdBy });

    try {
      if (source === "firestore" && auth.isIshida) {
        await saveMonthlyReport(report);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, monthlyReports: [report, ...current.monthlyReports] }));
      }
      setStatus("月次レポートを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `月次レポート作成エラー: ${error.message}` : "月次レポート作成エラー");
    }
  };

  const updateActiveProjectStatus = async (nextStatus: WorkflowStage) => {
    const updatedBy = auth.user?.email;
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインすると案件ステータスを変更できます`);
      return;
    }

    const nextAction = `${nextStatus} に更新。次の担当者が進行内容を確認`;
    try {
      if (source === "firestore") {
        await updateProjectStatus({ projectId: activeProject.id, status: nextStatus, nextAction, updatedBy });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          projects: current.projects.map((project) => (project.id === activeProject.id ? { ...project, status: nextStatus, nextAction } : project))
        }));
      }
      setStatus("案件ステータスを更新しました");
    } catch (error) {
      setStatus(error instanceof Error ? `ステータス更新エラー: ${error.message}` : "ステータス更新エラー");
    }
  };

  const saveTemplateFromEditor = async (template: EmailTemplate) => {
    const updatedBy = auth.user?.email;
    if (!auth.isIshida || !updatedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとメールテンプレートを編集できます`);
      return;
    }

    const safeTemplate = {
      ...template,
      mode: resolveCommunicationSafety({ project: activeProject, text: `${template.name} ${template.subject} ${template.body ?? ""}` })
    };

    try {
      if (source === "firestore") {
        await saveEmailTemplate(safeTemplate, updatedBy);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          emailTemplates: current.emailTemplates.map((item) => (item.id === safeTemplate.id ? safeTemplate : item))
        }));
      }
      setStatus("メールテンプレートを保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `メールテンプレート保存エラー: ${error.message}` : "メールテンプレート保存エラー");
    }
  };

  const createNotificationFromInput = async ({ title, body, kind }: { title: string; body: string; kind: NotificationItem["kind"] }) => {
    const createdBy = auth.user?.email ?? "local-user";
    const notification: NotificationItem = {
      id: `notification-${crypto.randomUUID()}`,
      title,
      body,
      kind,
      safety: resolveCommunicationSafety({ project: activeProject, text: `${title} ${body}` }),
      targetProjectId: activeProject.id,
      read: false,
      createdAt: new Date().toISOString(),
      createdBy
    };

    try {
      if (source === "firestore" && auth.isIshida) {
        await saveNotification(notification);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, notifications: [notification, ...current.notifications] }));
      }
      setStatus("通知を作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `通知作成エラー: ${error.message}` : "通知作成エラー");
    }
  };

  const uploadAssetFromPanel = async ({ file, kind }: { file: File; kind: StorageAsset["kind"] }) => {
    const uploadedBy = auth.user?.email;
    if (!auth.isIshida || !uploadedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインするとStorageへ保存できます`);
      return;
    }

    try {
      const asset = await uploadStorageAsset({ file, kind, projectId: activeProject.id, uploadedBy });
      await saveStorageAsset(asset);
      const remoteData = await refreshFirestore();
      if (remoteData) setData(remoteData);
      setStatus("Storageへ保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `Storage保存エラー: ${error.message}` : "Storage保存エラー");
    }
  };

  const createOpenAiReviewFromInput = async ({ title, input }: { title: string; input: string }) => {
    const createdBy = auth.user?.email ?? "local-user";
    try {
      const response = await fetch("/api/openai/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, input, projectId: activeProject.id, createdBy })
      });
      if (!response.ok) throw new Error("OpenAI Review APIに失敗しました");
      const result = (await response.json()) as { review: OpenAiReview };
      if (source === "firestore" && auth.isIshida) {
        await saveOpenAiReview(result.review);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, openAiReviews: [result.review, ...current.openAiReviews] }));
      }
      setStatus(result.review.generatedBy === "openai" ? "OpenAIレビューを作成しました" : "OpenAI fallbackレビューを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `OpenAIレビューエラー: ${error.message}` : "OpenAIレビューエラー");
    }
  };

  const createCodexCliRunFromInput = async ({ taskTitle, taskBody }: { taskTitle: string; taskBody: string }) => {
    const createdBy = auth.user?.email ?? "local-user";
    try {
      const response = await fetch("/api/codex/cli", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: activeProject.id, taskTitle, taskBody, createdBy })
      });
      if (!response.ok) throw new Error("Codex CLI連携APIに失敗しました");
      const result = (await response.json()) as { run: CodexCliRun };
      if (source === "firestore" && auth.isIshida) {
        await saveCodexCliRun(result.run);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, codexCliRuns: [result.run, ...current.codexCliRuns] }));
      }
      setStatus("Codex CLI連携タスクを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `Codex CLI連携エラー: ${error.message}` : "Codex CLI連携エラー");
    }
  };

  const importCodexResultFromJson = async ({ title, jsonText, resultPath }: { title: string; jsonText: string; resultPath?: string }) => {
    const importedBy = auth.user?.email ?? "local-user";
    try {
      const input = parseCodexResultJson(jsonText);
      const now = new Date().toISOString();
      const run: CodexRun = {
        id: `codex-run-${crypto.randomUUID()}`,
        projectId: activeProject.id,
        title: title.trim() || input.summary || "Codex実行",
        status: input.status === "completed" ? "completed" : "failed",
        startedAt: new Date(Date.now() - input.duration * 1000).toISOString(),
        finishedAt: now,
        createdBy: importedBy,
        executor: "codex-cli",
        resultPath,
        createdAt: now,
        updatedAt: now
      };
      const result = createCodexResultRecord({ input, runId: run.id, projectId: activeProject.id, importedBy });
      const progressItems = mapCodexResultToProgressItems({ result, updatedBy: importedBy });
      const completedTaskIds = findCompletedWorkTaskIds({ result, tasks: activeWorkTasks });
      const timelineEvent = createCodexTimelineEvent({ result, project: activeProject, clientId: activeClient.id });

      if (source === "firestore" && auth.user) {
        await saveCodexProgressImport({ run, result, progressItems, timelineEvent, completedTaskIds });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          codexRuns: [run, ...current.codexRuns],
          codexResults: [result, ...current.codexResults],
          developmentProgressItems: mergeProgressItems(current.developmentProgressItems, progressItems),
          timelineEvents: [timelineEvent, ...current.timelineEvents],
          workTasks: current.workTasks.map((task) => (completedTaskIds.includes(task.id) ? { ...task, status: "done", updatedBy: importedBy, updatedAt: now } : task))
        }));
      }
      setStatus(`Codex結果を取り込みました: ${result.completedItems.length}件完了 / ${result.remainingItems.length}件残`);
    } catch (error) {
      setStatus(error instanceof Error ? `Codex結果JSON取込エラー: ${error.message}` : "Codex結果JSON取込エラー");
    }
  };

  const createGolfDemoTestProject = async () => {
    await registerProjectWithMinutes(golfDemoTestInput);
    navigateToPage("home");
  };

  const generateLatestActiveRequirements = async () => {
    const latestMinutes = activeMinutes
      .slice()
      .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())[0];
    if (!latestMinutes) {
      setStatus("先に案件と議事録を登録してください");
      return;
    }
    await generateRequirementsForMinutes(latestMinutes);
  };

  const approveLatestActiveRequirements = async () => {
    const latestDraft = activeDrafts[0];
    if (!latestDraft) {
      setStatus("先に要件定義を生成してください");
      return;
    }
    await approveRequirements(latestDraft);
  };

  const createSnsPlanForActiveProject = async (input: {
    month: string;
    contractPlan: string;
    platforms: SnsPlatform[];
    monthlyPostCount: number;
    meetingMemo: string;
  }) => {
    const owner = auth.user?.email ?? "local-user";
    const { plan, posts } = createSnsOperationPlan({
      client: activeClient,
      project: activeProject,
      month: input.month,
      contractPlan: input.contractPlan,
      platforms: input.platforms,
      monthlyPostCount: input.monthlyPostCount,
      owner,
      meetingMemo: input.meetingMemo
    });

    try {
      if (source === "firestore" && auth.user) {
        await saveSnsOperationPlanWithPosts({ plan, posts });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          snsOperationPlans: [plan, ...current.snsOperationPlans],
          snsPostTasks: [...posts, ...current.snsPostTasks]
        }));
      }
      setStatus("SNS運用の月次プランを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `SNS月次プラン作成エラー: ${error.message}` : "SNS月次プラン作成エラー");
    }
  };

  const updateSnsPostFromPanel = async (post: SnsPostTask) => {
    const updatedBy = auth.user?.email ?? "local-user";
    try {
      if (source === "firestore" && auth.user) {
        await updateSnsPostTask(post, updatedBy);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          snsPostTasks: current.snsPostTasks.map((item) => (item.id === post.id ? { ...post, updatedAt: new Date().toISOString() } : item))
        }));
      }
      setStatus("SNS投稿タスクを更新しました");
    } catch (error) {
      setStatus(error instanceof Error ? `SNS投稿タスク更新エラー: ${error.message}` : "SNS投稿タスク更新エラー");
    }
  };

  const analyzeQuickCaptureInput = (rawText: string): QuickCaptureAnalysis => {
    return analyzeQuickCapture({ rawText, clients: data.clients, projects: data.projects, inputBy: auth.user?.email ?? "local-user" });
  };

  const saveQuickCaptureFromPanel = async ({ rawText, analysis }: { rawText: string; analysis: QuickCaptureAnalysis }) => {
    const inputBy = auth.user?.email ?? "local-user";
    const now = new Date().toISOString();
    const matchedClient = analysis.companyCandidates[0]?.clientId
      ? data.clients.find((client) => client.id === analysis.companyCandidates[0].clientId)
      : data.clients.find((client) => client.name === analysis.companyName);
    const matchedProject = analysis.projectId
      ? data.projects.find((project) => project.id === analysis.projectId)
      : matchedClient
        ? data.projects.find((project) => project.clientId === matchedClient.id)
        : undefined;
    const duplicate = data.quickCaptures.some((capture) => {
      const closeInTime = Date.now() - new Date(capture.inputAt).getTime() < 10 * 60 * 1000;
      return closeInTime && capture.rawText.trim() === rawText.trim();
    });

    if (duplicate) {
      setStatus("同じ内容のクイックメモが短時間に登録されています。重複候補として確認してください");
      return;
    }

    const captureId = `quick-capture-${crypto.randomUUID()}`;
    const capture: QuickCapture = {
      id: captureId,
      rawText,
      source: "web-quick-capture",
      inputBy,
      inputAt: now,
      clientId: matchedClient?.id,
      projectId: matchedProject?.id,
      analysis,
      confirmed: true
    };
    const timelineEvent: CompanyTimelineEvent = {
      id: `company-timeline-${crypto.randomUUID()}`,
      clientId: matchedClient?.id,
      projectId: matchedProject?.id,
      sourceCaptureId: captureId,
      kind: analysis.contactKind,
      title: `${analysis.companyName ?? "未設定会社"} / ${analysis.contactKind}`,
      summary: rawText,
      eventAt: now,
      createdBy: inputBy,
      source: "web-quick-capture",
      importantInfo: analysis.importantInfo
    };
    const tasks: SalesActionTask[] = analysis.nextActions.map((action) => ({
      id: `sales-task-${crypto.randomUUID()}`,
      clientId: matchedClient?.id,
      projectId: matchedProject?.id,
      sourceCaptureId: captureId,
      title: action.title,
      assignee: action.assignee,
      due: action.due,
      status: "todo",
      importance: action.importance,
      createdBy: inputBy,
      createdAt: now
    }));

    try {
      if (source === "firestore" && auth.user) {
        await saveQuickCaptureBundle({ capture, timelineEvent, tasks });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          quickCaptures: [capture, ...current.quickCaptures],
          companyTimelineEvents: [timelineEvent, ...current.companyTimelineEvents],
          salesActionTasks: [...tasks, ...current.salesActionTasks]
        }));
      }
      setStatus(`クイックメモを保存しました。次のアクション: ${tasks.length}件`);
    } catch (error) {
      setStatus(error instanceof Error ? `クイックメモ保存エラー: ${error.message}` : "クイックメモ保存エラー");
    }
  };

  const updateSalesActionTaskFromPanel = async (task: SalesActionTask) => {
    const updatedBy = auth.user?.email ?? "local-user";
    try {
      if (source === "firestore" && auth.isIshida) {
        await updateSalesActionTask(task, updatedBy);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          salesActionTasks: current.salesActionTasks.map((item) => (item.id === task.id ? { ...task, updatedAt: new Date().toISOString() } : item))
        }));
      }
      setStatus("営業タスクを更新しました");
    } catch (error) {
      setStatus(error instanceof Error ? `営業タスク更新エラー: ${error.message}` : "営業タスク更新エラー");
    }
  };

  const saveCompanyContactFromPanel = async (contact: CompanyContact) => {
    try {
      if (source === "firestore" && auth.user) {
        await saveCompanyContact(contact);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, companyContacts: [contact, ...current.companyContacts] }));
      }
      setStatus("顧客担当者を保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `担当者保存エラー: ${error.message}` : "担当者保存エラー");
    }
  };

  const saveSalesActivityFromPanel = async (activity: SalesActivity) => {
    const timelineEvent: CompanyTimelineEvent = {
      id: `company-timeline-${crypto.randomUUID()}`,
      clientId: activity.clientId,
      projectId: activity.projectId,
      kind: "meeting",
      title: activity.title,
      summary: activity.body,
      eventAt: activity.occurredAt,
      createdBy: activity.createdBy,
      source: "system",
      importantInfo: []
    };
    try {
      if (source === "firestore" && auth.user) {
        await saveSalesActivity(activity, timelineEvent);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          salesActivities: [activity, ...current.salesActivities],
          companyTimelineEvents: [timelineEvent, ...current.companyTimelineEvents]
        }));
      }
      setStatus("営業活動を保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `営業活動保存エラー: ${error.message}` : "営業活動保存エラー");
    }
  };

  const saveMeetingFromPanel = async (meeting: MeetingRecord) => {
    const timelineEvent: CompanyTimelineEvent = {
      id: `company-timeline-${crypto.randomUUID()}`,
      clientId: meeting.clientId,
      projectId: meeting.projectId,
      kind: "meeting",
      title: meeting.title,
      summary: meeting.manualMemo || meeting.transcription || meeting.kind,
      eventAt: meeting.startedAt,
      createdBy: auth.user?.email ?? "local-user",
      source: "system",
      importantInfo: []
    };
    try {
      if (source === "firestore" && auth.user) {
        await saveMeetingRecord(meeting, timelineEvent);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          meetings: [meeting, ...current.meetings],
          companyTimelineEvents: [timelineEvent, ...current.companyTimelineEvents]
        }));
      }
      setStatus("会議を保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `会議保存エラー: ${error.message}` : "会議保存エラー");
    }
  };

  const createMeetingAnalysisFromPanel = async (meeting: MeetingRecord) => {
    const meetingLogs = meeting.conversationLogs ?? [];
    const text = meetingLogs.length > 0 ? conversationLogsToTranscript(meetingLogs) : `${meeting.transcription ?? ""}\n${meeting.manualMemo ?? ""}`;
    const speaker = splitSpeakerTranscript(text);
    const leadScore = scoreMeetingLead(text);
    const leadGrade = leadScore >= 72 ? "高" : leadScore >= 45 ? "中" : "低";
    let analysis: MeetingAnalysis = {
      id: `meeting-analysis-${crypto.randomUUID()}`,
      meetingId: meeting.id,
      clientId: meeting.clientId,
      projectId: meeting.projectId,
      analysisMode: meeting.kind === "電話" ? "combined" : "post-meeting",
      summary: summarizeMeetingText(text, meeting.kind),
      customerStatements: speaker.customer.length > 0 ? speaker.customer : extractKeywordLines(text, ["顧客", "先方", "相手", "お客様"]),
      mogciaStatements: speaker.mogcia.length > 0 ? speaker.mogcia : extractKeywordLines(text, ["MOGCIA", "石田", "提案", "弊社"]),
      issues: extractKeywordLines(text, ["課題", "困", "不足"]),
      requests: extractKeywordLines(text, ["要望", "欲しい", "したい"]),
      concerns: extractKeywordLines(text, ["懸念", "不安", "負担"]),
      importantPoints: extractKeywordLines(text, ["重要", "優先", "気に"]),
      proposals: extractKeywordLines(text, ["提案", "MOGCIA"]),
      decisions: extractKeywordLines(text, ["決定", "確定"]),
      undecided: extractKeywordLines(text, ["未定", "確認", "検討"]),
      confirmations: extractKeywordLines(text, ["確認", "質問"]),
      nextActions: analyzeQuickCapture({ rawText: text, clients: data.clients, projects: data.projects, inputBy: auth.user?.email ?? "local-user" }).nextActions,
      dealStatusCandidate: leadGrade === "高" ? "提案中" : leadGrade === "中" ? "商談中" : "保留",
      leadScore,
      leadGrade,
      goodPoints: createMeetingGoodPoints(text, speaker),
      badPoints: createMeetingBadPoints(text, speaker),
      talkFlow: createTalkFlow(text, activeClient, activeProject),
      talkScript: createTalkScript(text, activeClient, activeProject),
      preparationItems: createPreparationItems(text, activeClient, activeProject),
      objectionHandling: createObjectionHandling(text),
      projectCandidate: text.includes("案件") || text.includes("Demo") || text.includes("制作"),
      requirementInput: extractKeywordLines(text, ["要件", "Demo", "画面", "機能"]),
      salesNotes: extractKeywordLines(text, ["注意", "懸念", "負担"]),
      status: "ai-candidate",
      generatedBy: "local-crm-ai",
      generatedAt: new Date().toISOString()
    };
    try {
      const token = await auth.getIdToken();
      const response = await fetch("/api/ai/meeting-analysis", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ meeting, client: activeClient, project: activeProject, conversationLogs: meetingLogs })
      });

      if (response.ok) {
        const payload = (await response.json()) as { analysis?: Partial<MeetingAnalysis> };
        if (payload.analysis) {
          analysis = {
            ...analysis,
            ...payload.analysis,
            id: analysis.id,
            meetingId: meeting.id,
            clientId: meeting.clientId,
            projectId: meeting.projectId,
            status: "ai-candidate",
            generatedBy: "claude",
            generatedAt: new Date().toISOString()
          };
        }
      }

      if (source === "firestore" && auth.user) {
        await saveMeetingAnalysis(analysis);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({ ...current, meetingAnalyses: [analysis, ...current.meetingAnalyses] }));
      }
      setStatus(analysis.generatedBy === "claude" ? "Claudeで商談分析候補を作成しました" : "ローカル商談分析候補を作成しました");
    } catch (error) {
      try {
        if (source === "firestore" && auth.user) {
          await saveMeetingAnalysis(analysis);
          const remoteData = await refreshFirestore();
          if (remoteData) setData(remoteData);
        } else {
          setData((current) => ({ ...current, meetingAnalyses: [analysis, ...current.meetingAnalyses] }));
        }
        setStatus("Claude解析に失敗したため、ローカル商談分析候補を作成しました");
      } catch {
        setStatus(error instanceof Error ? `会議AI解析エラー: ${error.message}` : "会議AI解析エラー");
      }
    }
  };

  const uploadMeetingAssetFromPanel = async ({ meeting, file, kind }: { meeting: MeetingRecord; file: File; kind: MeetingAsset["kind"] }) => {
    const uploadedBy = auth.user?.email;
    if (!auth.isIshida || !uploadedBy) {
      setStatus(`${ISHIDA_EMAIL} の石田アカウントでログインすると会議ファイルを保存できます`);
      return;
    }

    try {
      const asset = await uploadMeetingAsset({
        file,
        clientId: meeting.clientId,
        projectId: meeting.projectId,
        meetingId: meeting.id,
        kind,
        uploadedBy
      });
      await saveMeetingAsset(asset);
      const remoteData = await refreshFirestore();
      if (remoteData) setData(remoteData);
      setStatus("会議ファイルをStorageへ保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `会議ファイル保存エラー: ${error.message}` : "会議ファイル保存エラー");
    }
  };

  const saveMeetingAnalysisFromPanel = async (analysis: MeetingAnalysis) => {
    const confirmedBy = auth.user?.email ?? "local-user";
    const confirmedAnalysis: MeetingAnalysis = {
      ...analysis,
      status: "confirmed",
      confirmedBy,
      confirmedAt: new Date().toISOString()
    };

    try {
      if (source === "firestore" && auth.user) {
        await saveMeetingAnalysis(confirmedAnalysis);
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          meetingAnalyses: current.meetingAnalyses.map((item) => (item.id === analysis.id ? confirmedAnalysis : item))
        }));
      }
      setStatus("AI解析結果を確定保存しました");
    } catch (error) {
      setStatus(error instanceof Error ? `AI解析保存エラー: ${error.message}` : "AI解析保存エラー");
    }
  };

  const createRequirementsFromMeetingAnalysis = async (analysis: MeetingAnalysis) => {
    const project = data.projects.find((item) => item.id === analysis.projectId) ?? activeProject;
    const client = data.clients.find((item) => item.id === analysis.clientId) ?? activeClient;
    const meeting = data.meetings.find((item) => item.id === analysis.meetingId);
    if (!project || !client) {
      setStatus("顧客または案件が見つかりません");
      return;
    }

    const content = meetingAnalysisToMinutesText(analysis, meeting);
    const minutes: MinutesRecord = {
      id: `meeting-minutes-${analysis.id}`,
      projectId: project.id,
      clientId: client.id,
      content,
      registeredBy: auth.user?.email ?? "local-user",
      registeredAt: new Date().toISOString()
    };

    setRequirementsActionId(analysis.id);
    setStatus("会議解析から要件定義ドラフトを生成中");

    try {
      const existingDrafts = data.requirementDrafts.filter((draft) => draft.projectId === project.id || draft.minutesId === minutes.id);
      const generatedDraft =
        source === "firestore" && auth.user
          ? await requestRequirementDraft({ client, project, minutes, ruleLayers: data.ruleLayers })
          : generateRequirementDraft({ client, project, minutes });
      const draft = withRequirementVersion(generatedDraft, existingDrafts, "会議AI解析から生成");

      if (source === "firestore" && auth.user) {
        await saveRequirementDraftForProject({ project, draft });
        const remoteData = await refreshFirestore();
        if (remoteData) setData(remoteData);
      } else {
        setData((current) => ({
          ...current,
          requirementDrafts: [draft, ...current.requirementDrafts],
          projects: current.projects.map((item) =>
            item.id === project.id
              ? {
                  ...item,
                  requirementDraftId: draft.id,
                  status: "要件確認中",
                  nextAction:
                    item.approvalStatus === "not-required"
                      ? "会議解析から要件定義ドラフト生成済み。Demo生成へ進行可能"
                      : "会議解析から要件定義ドラフト生成済み。石田承認後にDemo生成へ進行"
                }
              : item
          )
        }));
      }
      setStatus("会議解析から要件定義ドラフトを作成しました");
    } catch (error) {
      setStatus(error instanceof Error ? `会議解析の要件定義化エラー: ${error.message}` : "会議解析の要件定義化エラー");
    } finally {
      setRequirementsActionId(null);
    }
  };

  return (
    <AppShell
      activePage={activePage}
      currentPath={pathname}
      isSeeding={isSeeding}
      onSeed={handleSeed}
      onOpenCreate={(action) => setPageAction(action)}
      source={source}
      status={status}
      todoCount={homeTodoItems.length}
    >
      {!isDashboardReady ? (
        <DashboardLoadingState />
      ) : (
      <div className="space-y-8">
        <DashboardPageChrome
          authPanel={!auth.user ? <AuthPanel source={source} status={status} onSeed={handleSeed} isSeeding={isSeeding} /> : null}
          hero={null}
          stats={activePage === "home" ? (
            <DashboardStatsGrid>
              {statCards.map((card) => (
                <div key={card.label} className="flex min-h-[142px] flex-col rounded-[18px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.045)]">
                  <p className="text-sm font-medium text-neutral-700">{card.label}</p>
                  <p className="mt-4 text-4xl font-semibold text-neutral-950">{card.value}<span className="ml-1 text-base font-medium">件</span></p>
                  <p className="mt-auto pt-3 text-xs text-neutral-500">{card.note}</p>
                </div>
              ))}
            </DashboardStatsGrid>
          ) : null}
        />

        <StatusFeedback status={status} source={source} />

        <RouteFocusBanner pathname={pathname} client={activeClient} project={activeProject} meetings={activeMeetings} />

        {activePage === "home" ? (
          <HomeDashboardPage>
            <div className="grid gap-8">
              <HomeOperatingPanel
                todoItems={homeTodoItems}
                notices={agentNotices}
                projects={data.projects}
                clients={data.clients}
                approvalProjects={approvalProjects}
                demoTasks={visibleDemoTasks}
                codexResult={latestCodexResult}
                snsPosts={data.snsPostTasks}
                onOpenProjects={() => navigateToPage("projects")}
                onOpenTasks={() => navigateToPage("tasks")}
                onOpenSales={() => navigateToPage("crm")}
              />
              <HomeFocusPanel
                project={activeProject}
                client={activeClient}
                timelineEvents={activeCompanyTimelineEvents}
                salesTasks={activeSalesActionTasks}
                codexResult={latestCodexResult}
              />
            </div>
          </HomeDashboardPage>
        ) : null}

        {activePage === "crm" ? (
          <SalesDashboardPage>
            <div className="grid gap-8">
              {crmView === "sales" ? (
                <SalesTopWorkspace
                  analyses={data.meetingAnalyses}
                  clients={data.clients}
                  duplicateGroups={duplicateClientGroups}
                  filter={salesFilter}
                  isAdmin={auth.isIshida}
                  meetings={data.meetings}
                  onCreateCompany={() => setPageAction("company")}
                  onOpenClient={(clientId) => router.push(`/companies/${clientId}` as Route<string>)}
                  onSearchChange={setSalesSearch}
                  onFilterChange={setSalesFilter}
                  search={salesSearch}
                  tasks={data.salesActionTasks}
                  todayMeetingCount={todayMeetings.length}
                  todayTaskCount={todaySalesTasks.length}
                  overdueCount={overdueSalesTasks.length}
                  confirmationCount={confirmationSalesTasks.length}
                />
              ) : null}

              {crmView === "calendar" ? (
                <CalendarWorkspace clients={data.clients} meetings={data.meetings} salesTasks={data.salesActionTasks} snsPosts={data.snsPostTasks} />
              ) : null}

              {crmView === "company" ? (
                <CompanyDetailWorkspace
                  activeClient={activeClient}
                  activeProject={activeProject}
                  analyses={activeMeetingAnalyses}
                  assets={activeMeetingAssets}
                  contacts={activeCompanyContacts}
                  latestAnalysis={latestActiveMeetingAnalysis}
                  latestMeeting={latestActiveMeeting}
                  meetings={activeMeetings}
                  onAdd={() => setPageAction("quick-capture")}
                  onAddMeeting={() => setPageAction("meeting")}
                  projects={data.projects.filter((project) => project.clientId === activeClient.id)}
                  snsPlans={activeSnsPlans}
                  tasks={activeSalesActionTasks}
                  timelineEvents={activeCompanyTimelineEvents}
                />
              ) : null}

              {crmView === "timeline" ? (
                <CompanyTimeline events={data.companyTimelineEvents.slice().sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())} onAdd={() => setPageAction("quick-capture")} />
              ) : null}

              {crmView === "meetings" ? (
                <MeetingsWorkspace
                  analyses={data.meetingAnalyses}
                  assets={data.meetingAssets}
                  canUploadMeetingAsset={auth.isIshida}
                  clients={data.clients}
                  currentUser={auth.user?.email ?? "local-user"}
                  getAuthToken={auth.getIdToken}
                  meetings={data.meetings}
                  onAnalyzeMeeting={createMeetingAnalysisFromPanel}
                  onAnalysisSave={saveMeetingAnalysisFromPanel}
                  onCreateRequirements={createRequirementsFromMeetingAnalysis}
                  onMeetingAssetUpload={uploadMeetingAssetFromPanel}
                  onMeetingSave={saveMeetingFromPanel}
                  products={data.products}
                  projects={data.projects}
                />
              ) : null}
            </div>
          </SalesDashboardPage>
        ) : null}

        {activePage === "products" ? (
          <SettingsDashboardPage>
            <ProductsWorkspace currentUser={auth.user?.email ?? "local-user"} products={data.products} onSave={saveProductFromPage} />
          </SettingsDashboardPage>
        ) : null}

        {activePage !== "home" && activePage !== "crm" && activePage !== "products" ? (
        <DashboardWorkspace>
        <DashboardColumn>
          {activePage === "projects" ? (
            <ProjectsDashboardPage>
            <>
          {!isRequirementsRoute ? (
            <ProjectPipelinePanel
              projects={data.projects}
              clients={data.clients}
              activeProjectId={activeProject.id}
              codexResults={data.codexResults}
              onSelectProject={setSelectedProjectId}
            />
          ) : null}

          {!isRequirementsRoute && !isProjectDetailRoute ? (
          <Panel title="案件一覧" action={`${data.projects.length}件`}>
            <div className="grid gap-3 md:grid-cols-2">
              {data.projects.map((project) => {
                const client = data.clients.find((item) => item.id === project.clientId);
                const selected = project.id === activeProject.id;

                return (
                  <button
                    key={project.id}
                    className={`rounded-lg border p-4 text-left transition ${
                      selected ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-mogcia-primary-dark hover:bg-mogcia-light/20"
                    }`}
                    onClick={() => setSelectedProjectId(project.id)}
                    type="button"
                  >
                    <p className={selected ? "text-sm text-white/70" : "text-sm text-neutral-500"}>{client?.name ?? project.clientId}</p>
                    <h3 className="mt-1 font-semibold">{project.name}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-md px-2 py-1 text-xs ${selected ? "bg-white/15 text-white" : "bg-mogcia-light text-ink"}`}>
                        {(project.kind ?? "development") === "sns-operation" ? "SNS運用" : "開発 / Demo"}
                      </span>
                      <span className={`rounded-md px-2 py-1 text-xs ${selected ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"}`}>{project.status}</span>
                      <span className={`rounded-md px-2 py-1 text-xs ${selected ? "bg-white/15 text-white" : "bg-mogcia-light text-ink"}`}>{project.source}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
          ) : null}

          {!isRequirementsRoute ? (
            <ProjectDetailPanel
              client={activeClient}
              demoRun={activeDemoRun}
              demoTasks={activeDemoTasks}
              drafts={activeDrafts}
              isGeneratingDemo={demoActionId === activeProject.id}
              guideDraft={activeGuideDraft}
              companyTimelineEvents={activeCompanyTimelineEvents}
              minutes={activeMinutes}
              onGenerateLocalDemo={generateLocalDemoForActiveProject}
              onSnsPlanCreate={createSnsPlanForActiveProject}
              onSnsPostUpdate={updateSnsPostFromPanel}
              onSalesTaskUpdate={updateSalesActionTaskFromPanel}
              productionTasks={activeProductionTasks}
              project={activeProject}
              salesActionTasks={activeSalesActionTasks}
              snsPlans={activeSnsPlans}
              snsPosts={activeSnsPosts}
            />
          ) : null}

          {!isRequirementsRoute ? <ProjectStatusPanel project={activeProject} canEdit={auth.isIshida} onChange={updateActiveProjectStatus} /> : null}

          {isProjectDetailRoute ? (
            <ClientTimelinePanel
              client={activeClient}
              demoRuns={data.localDemoRuns.filter((run) => run.clientId === activeClient.id)}
              guideDrafts={data.demoGuideDrafts.filter((draft) => draft.clientId === activeClient.id)}
              minutes={data.minutes.filter((item) => item.clientId === activeClient.id)}
              notifications={data.notifications.filter((item) => item.targetProjectId === activeProject.id)}
              projects={data.projects.filter((project) => project.clientId === activeClient.id)}
              timelineEvents={data.timelineEvents.filter((event) => event.clientId === activeClient.id)}
              companyTimelineEvents={data.companyTimelineEvents.filter((event) => event.clientId === activeClient.id)}
            />
          ) : null}

          {!isRequirementsRoute ? (
          <Panel title="Active Workflow" action="承認へ">
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div>
                <p className="text-sm text-neutral-500">{activeClient.name}</p>
                <h3 className="mt-1 text-2xl font-semibold">{activeProject.name}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeProject.services.map((service) => (
                    <span key={service} className="rounded-md border border-line bg-neutral-50 px-3 py-1 text-sm">
                      {service}
                    </span>
                  ))}
                </div>
                <p className="mt-5 text-sm leading-6 text-neutral-600">{activeProject.nextAction}</p>
                {activeProject.demoUrl ? (
                  <a
                    className="mt-4 inline-flex rounded-md bg-mogcia-primary px-3 py-2 text-sm font-medium text-ink hover:bg-mogcia-dark"
                    href={activeProject.demoUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Previewを開く
                  </a>
                ) : null}
              </div>
              <div className="rounded-lg bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">Mode</p>
                <p className="mt-1 text-xl font-semibold">{activeProject.mode === "demo" ? "Demo" : "Production"}</p>
                <div className="mt-4 space-y-2">
                  {getModeRestrictions(activeProject.mode).slice(0, 4).map((restriction) => (
                    <p key={restriction} className="rounded-md bg-white px-3 py-2 text-xs text-neutral-600">
                      {restriction}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-2 md:grid-cols-5">
              {workflowStages.slice(0, 15).map((stage) => (
                <div
                  key={stage}
                  className={`rounded-md border px-3 py-2 text-xs ${
                    stage === activeProject.status ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-500"
                  }`}
                >
                  {stage}
                </div>
              ))}
            </div>
          </Panel>
          ) : null}

          {!isRequirementsRoute && !isProjectDetailRoute ? (
          <Panel title="Generated Tasks" action="タスク生成">
            <div className="grid gap-3">
              {generatedTasks.map((task) => (
                <div key={task.id} className="grid gap-3 rounded-lg border border-line bg-white p-4 md:grid-cols-[1fr_130px_130px] md:items-center">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {task.assignee} / {task.kind}
                    </p>
                  </div>
                  <span className="rounded-md bg-neutral-100 px-3 py-2 text-center text-sm">{task.due}</span>
                  <SafetyBadge safety={task.safety} />
                </div>
              ))}
            </div>
          </Panel>
          ) : null}

          <Panel title="最近の議事録" action={`${data.minutes.length}件`}>
            <div className="grid gap-3">
              {data.minutes.length > 0 ? (
                data.minutes.slice(0, 4).map((minutes) => {
                  const project = data.projects.find((item) => item.id === minutes.projectId);
                  const client = data.clients.find((item) => item.id === minutes.clientId);

                  const draftCount = data.requirementDrafts.filter((draft) => draft.minutesId === minutes.id).length;

                  return (
                    <div key={minutes.id} className="rounded-lg border border-line bg-white p-4">
                      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
                        <div>
                          <p className="text-sm text-neutral-500">{client?.name ?? minutes.clientId}</p>
                          <h3 className="mt-1 font-semibold">{project?.name ?? minutes.projectId}</h3>
                        </div>
                        <p className="text-xs text-neutral-400">{new Date(minutes.registeredAt).toLocaleString("ja-JP")}</p>
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">{minutes.content}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                          disabled={requirementsActionId === minutes.id}
                          onClick={() => generateRequirementsForMinutes(minutes)}
                          type="button"
                        >
                          {requirementsActionId === minutes.id ? "生成中" : draftCount > 0 ? "要件定義再生成" : "要件定義生成"}
                        </button>
                        {draftCount > 0 ? (
                          <span className="rounded-md bg-mogcia-light px-3 py-2 text-xs text-ink">Version {draftCount}まで生成済み</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">まだ議事録は登録されていません。</p>
              )}
            </div>
          </Panel>

          <Panel title="要件定義ドラフト" action={`${data.requirementDrafts.length}件`}>
            <div className="grid gap-3">
              {data.requirementDrafts.length > 0 ? (
                sortRequirementDrafts(data.requirementDrafts).slice(0, 3).map((draft) => {
                  const project = data.projects.find((item) => item.id === draft.projectId);
                  const client = data.clients.find((item) => item.id === draft.clientId);

                  return (
                    <RequirementDraftCard
                      key={draft.id}
                      busy={draftActionId === draft.id}
                      canApprove={auth.isIshida}
                      clientName={client?.name ?? draft.clientId}
                      draft={draft}
                      onApprove={approveRequirements}
                      onCreateProductionTasks={createProductionTasksFromDraft}
                      onSave={saveRequirementDraftEdits}
                      projectName={project?.name ?? draft.projectId}
                    />
                  );
                })
              ) : (
                <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">議事録から要件定義を生成するとここに表示されます。</p>
              )}
            </div>
          </Panel>
            </>
            </ProjectsDashboardPage>
          ) : null}

          {activePage === "tasks" ? (
            <TasksDashboardPage>
            <>
          {isTasksRoute ? (
            <UnifiedTasksWorkspace
              clients={data.clients}
              projects={data.projects}
              salesTasks={data.salesActionTasks}
              snsPosts={data.snsPostTasks}
              workTasks={data.workTasks}
              onSalesTaskUpdate={updateSalesActionTaskFromPanel}
              onWorkTaskStatusChange={changeWorkTaskStatus}
              onSnsPostUpdate={updateSnsPostFromPanel}
            />
          ) : null}

          {isDeliveryRoute ? (
            <div className="grid gap-8">
              <Panel title="Demo生成タスク" action={`${visibleDemoTasks.length}件`}>
                <div className="grid gap-6">
                  {visibleDemoTasks.length > 0 ? (
                    <>
                      <div className="rounded-lg border border-line bg-white p-4">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">Demo進捗</span>
                          <span className="text-neutral-500">
                            {doneDemoTasks} / {visibleDemoTasks.length} 完了
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
                          <div className="h-full rounded-full bg-mogcia-primary-dark transition-all" style={{ width: `${demoProgress}%` }} />
                        </div>
                      </div>
                      {visibleDemoTasks.map((task) => {
                        const project = data.projects.find((item) => item.id === task.projectId);
                        const guideDraft = data.demoGuideDrafts.find((item) => item.taskId === task.id || item.projectId === task.projectId);
                        return (
                          <DemoTaskCard
                            key={task.id}
                            busy={taskActionId === task.id}
                            canManage={auth.isIshida}
                            guideDraft={guideDraft}
                            onGuideGenerate={createDemoGuideForTask}
                            onPreviewSave={recordDemoPreviewUrl}
                            onStatusChange={changeWorkTaskStatus}
                            projectName={project?.name ?? task.projectId}
                            task={task}
                          />
                        );
                      })}
                    </>
                  ) : (
                    <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">要件定義を承認すると、Codex向けDemo生成タスクが作成されます。</p>
                  )}
                </div>
              </Panel>

              <Panel title="本番化タスク" action={`${visibleProductionTasks.length}件`}>
                <div className="grid gap-6">
                  {visibleProductionTasks.length > 0 ? (
                    <>
                      <div className="rounded-lg border border-line bg-white p-4">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">本番化準備</span>
                          <span className="text-neutral-500">
                            {doneProductionTasks} / {visibleProductionTasks.length} 完了
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
                          <div className="h-full rounded-full bg-mogcia-primary-dark transition-all" style={{ width: `${productionProgress}%` }} />
                        </div>
                        <p className="mt-3 text-sm text-neutral-500">契約後に実行するためのチェックリストです。外部リソースの作成はここでは行いません。</p>
                      </div>
                      {visibleProductionTasks.map((task) => {
                        const project = data.projects.find((item) => item.id === task.projectId);
                        return (
                          <WorkTaskCard
                            key={task.id}
                            busy={taskActionId === task.id}
                            canManage={auth.isIshida}
                            onStatusChange={changeWorkTaskStatus}
                            projectName={project?.name ?? task.projectId}
                            task={task}
                          />
                        );
                      })}
                    </>
                  ) : (
                    <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">要件定義ドラフトから本番化タスクを生成すると、契約後に必要な作業がここに表示されます。</p>
                  )}
                </div>
              </Panel>
            </div>
          ) : null}

          {!isDeliveryRoute && !isCodexRoute && !isTasksRoute ? (
            <Panel title="Demo・Codexの確認入口" action="分割済み">
              <div className="grid gap-6 md:grid-cols-2">
                <button className="rounded-[18px] border border-line bg-white p-5 text-left hover:bg-mogcia-icon" onClick={() => router.push("/delivery" as Route<string>)} type="button">
                  <p className="font-semibold text-neutral-950">Demo・本番化へ</p>
                  <p className="mt-2 text-sm text-neutral-500">Demoタスク、Preview URL、本番化判断を確認します。</p>
                </button>
                <button className="rounded-[18px] border border-line bg-white p-5 text-left hover:bg-mogcia-icon" onClick={() => router.push("/codex" as Route<string>)} type="button">
                  <p className="font-semibold text-neutral-950">Codex進捗へ</p>
                  <p className="mt-2 text-sm text-neutral-500">Codex Result JSON、Build/Lint/Typecheckを確認します。</p>
                </button>
              </div>
            </Panel>
          ) : null}
            </>
            </TasksDashboardPage>
          ) : null}

          {activePage === "projects" ? (
          <ProjectsDashboardPage>
          <Panel title="石田承認キュー" action={auth.isIshida ? "処理可能" : "閲覧のみ"}>
            <div className="mb-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              承認者: {ISHIDA_EMAIL} / 現在: {auth.user?.email ?? "未ログイン"} / Role: {auth.role}
            </div>
            <div className="grid gap-3">
              {approvalProjects.length > 0 ? (
                approvalProjects.map((project) => {
                  const client = data.clients.find((item) => item.id === project.clientId);
                  const isBusy = approvalActionId === project.id;

                  return (
                    <div key={project.id} className="rounded-lg border border-line bg-white p-4">
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                        <div>
                          <p className="text-sm text-neutral-500">{client?.name ?? project.clientId}</p>
                          <h3 className="mt-1 font-semibold">{project.name}</h3>
                          <p className="mt-2 text-sm leading-5 text-neutral-600">{project.nextAction}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-md bg-mogcia-light px-2 py-1 text-xs text-ink">{project.source}</span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{project.mode}</span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{project.status}</span>
                          </div>
                        </div>
                        <div className="grid min-w-40 gap-2">
                          <button
                            className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                            disabled={!auth.isIshida || isBusy}
                            onClick={() => applyProjectApproval(project, "approve")}
                            type="button"
                          >
                            {isBusy ? "保存中" : "承認"}
                          </button>
                          <button
                            className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                            disabled={!auth.isIshida || isBusy}
                            onClick={() => applyProjectApproval(project, "reject")}
                            type="button"
                          >
                            差し戻し
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">現在、石田承認待ちの案件はありません。</p>
              )}
            </div>
          </Panel>
          </ProjectsDashboardPage>
          ) : null}

          {activePage === "routing" ? (
          <AiDashboardPage>
          <Panel title="AI Routing" action="設定">
            <div className="grid gap-3 md:grid-cols-2">
              {aiRoutes.map((route) => (
                <div key={route.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-neutral-500">{route.trigger}</p>
                      <h3 className="mt-1 font-semibold">{route.agentName}</h3>
                    </div>
                    <span className="rounded-md bg-ink px-2 py-1 text-xs uppercase text-white">{route.provider}</span>
                  </div>
                  <p className="mt-3 text-sm text-neutral-600">{route.reason}</p>
                  <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm">{route.output}</p>
                </div>
              ))}
            </div>
          </Panel>
          </AiDashboardPage>
          ) : null}
        </DashboardColumn>

        <DashboardColumn>
          {activePage === "rules" ? (
            <SettingsDashboardPage>
            <>
          <RuleEngineEditor ruleLayers={data.ruleLayers} canEdit={auth.isIshida} onSave={saveRuleLayerFromEditor} />

          <Panel title="Rule Engine" action="GUI編集">
            <div className="space-y-2">
              {mergedRules.slice(0, 8).map((rule) => (
                <p key={rule} className="rounded-md bg-neutral-50 px-3 py-2 text-sm leading-5 text-neutral-700">
                  {rule}
                </p>
              ))}
            </div>
          </Panel>
            </>
            </SettingsDashboardPage>
          ) : null}

          {activePage === "routing" ? (
            <AiDashboardPage>
            <AgentRoutingEditor agentConfigs={data.agentConfigs} canEdit={auth.isIshida} onAdd={addAgentConfigFromEditor} onSave={saveAgentConfigFromEditor} />
            </AiDashboardPage>
          ) : null}

          {activePage === "reports" ? (
            <ReportsDashboardPage>
            <>
              <OpenAiReviewPanel reviews={data.openAiReviews.filter((review) => review.projectId === activeProject.id)} onCreate={createOpenAiReviewFromInput} />
              <WebsiteAnalysisPanel analyses={data.websiteAnalyses} onCreate={createWebsiteAnalysisFromUrl} />
              <MonthlyReportPanel reports={data.monthlyReports} onCreate={createMonthlyReportFromInput} />
            </>
            </ReportsDashboardPage>
          ) : null}

          {activePage === "sns" ? (
            <ReportsDashboardPage>
              <>
                <SnsDashboardOverview
                  clients={data.clients}
                  projects={data.projects}
                  plans={data.snsOperationPlans}
                  posts={data.snsPostTasks}
                  activeProject={activeProject}
                  onSelectProject={setSelectedProjectId}
                />
                <SnsOperationPanel plans={activeSnsPlans} posts={activeSnsPosts} onCreatePlan={createSnsPlanForActiveProject} onUpdatePost={updateSnsPostFromPanel} />
              </>
            </ReportsDashboardPage>
          ) : null}

          {activePage === "gmail" || activePage === "settings" ? (
            <SettingsDashboardPage>
            <>
              <OperationalReadinessPanel
                analyses={data.meetingAnalyses}
                assets={data.meetingAssets}
                meetings={data.meetings}
                projects={data.projects}
                source={source}
                workTasks={data.workTasks}
              />
              <SystemOperationsPanel
                authEmail={auth.user?.email}
                source={source}
                status={status}
                isSeeding={isSeeding}
                onSeed={handleSeed}
                onLogout={auth.signOutUser}
              />
              <StorageAssetsPanel assets={data.storageAssets.filter((asset) => !asset.projectId || asset.projectId === activeProject.id)} canUpload={auth.isIshida} onUpload={uploadAssetFromPanel} />
              <EmailTemplateEditor templates={data.emailTemplates} canEdit={auth.isIshida} onSave={saveTemplateFromEditor} />
              <NotificationPanel notifications={data.notifications} onCreate={createNotificationFromInput} />

          <Panel title="Email Templates" action="下書き">
            <div className="space-y-3">
              {data.emailTemplates.map((template) => (
                <div key={template.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{template.name}</p>
                    <SafetyBadge safety={template.mode} />
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">{template.subject}</p>
                  <p className="mt-3 text-xs text-neutral-400">{template.variables.map((item) => `{{${item}}}`).join(" ")}</p>
                </div>
              ))}
            </div>
          </Panel>
            </>
            </SettingsDashboardPage>
          ) : null}

          {activePage === "team" ? (
            <SettingsDashboardPage>
              <TeamAccessPanel currentEmail={auth.user?.email} role={auth.role} isIshida={auth.isIshida} />
            </SettingsDashboardPage>
          ) : null}

          {activePage === "tasks" ? (
            <TasksDashboardPage>
            {isCodexRoute ? <CodexCliPanel runs={data.codexCliRuns.filter((run) => !run.projectId || run.projectId === activeProject.id)} onCreate={createCodexCliRunFromInput} /> : null}
            </TasksDashboardPage>
          ) : null}

          {activePage === "tasks" ? (
            <TasksDashboardPage>
            {isCodexRoute ? (
              <CodexProgressPanel
              progress={codexProgress}
              runs={activeCodexRuns}
              results={activeCodexResults}
              progressItems={activeDevelopmentProgressItems}
              latestResult={latestCodexResult}
              onImport={importCodexResultFromJson}
              />
            ) : null}
            </TasksDashboardPage>
          ) : null}

          {activePage === "projects" ? (
          <ProjectsDashboardPage>
          <Panel title="Client Timeline" action="詳細">
            <div className="space-y-3">
              {data.timelineEvents.map((event) => (
                <div key={event.id} className="relative border-l border-line pl-4">
                  <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-sage" />
                  <p className="text-sm text-neutral-500">
                    {event.date} / {event.kind}
                  </p>
                  <p className="mt-1 font-medium">{event.title}</p>
                  <p className="mt-1 text-sm leading-5 text-neutral-600">{event.summary}</p>
                </div>
              ))}
            </div>
          </Panel>
          </ProjectsDashboardPage>
          ) : null}
        </DashboardColumn>
        </DashboardWorkspace>
        ) : null}

        {pageAction === "project" ? (
          <HomeActionModal title="案件登録 + 議事録登録" subtitle="営業・代理店メンバーは、まずここから案件を作れます。" onClose={() => setPageAction(null)}>
            <ProjectRegistrationForm
              firebaseReady={auth.firebaseConfigured && Boolean(auth.user)}
              onSubmit={async (input) => {
                await registerProjectWithMinutes(input);
                setPageAction(null);
              }}
            />
          </HomeActionModal>
        ) : null}
        {pageAction === "company" ? (
          <HomeActionModal title="会社追加" subtitle="見込み客・既存顧客・代理店を会社一覧へ登録します。" onClose={() => setPageAction(null)}>
            <CreateCompanyForm
              currentUser={auth.user?.email ?? "local-user"}
              onSave={async (client) => {
                await saveCompanyFromDrawer(client);
                setPageAction(null);
              }}
            />
          </HomeActionModal>
        ) : null}
        {pageAction === "quick-capture" ? (
          <HomeActionModal title="営業クイックメモ" subtitle="雑に書いて保存すると、会社タイムラインと次回アクションへ整理します。" onClose={() => setPageAction(null)}>
            <QuickCapturePanel onAnalyze={analyzeQuickCaptureInput} onSave={saveQuickCaptureFromPanel} />
          </HomeActionModal>
        ) : null}
        {pageAction === "meeting" ? (
          <HomeActionModal title="商談・会議メモ" subtitle="会議内容を登録し、あとからAI解析や要件定義へ送れます。" onClose={() => setPageAction(null)}>
            <HomeMeetingCaptureForm
              clients={data.clients}
              projects={data.projects}
              currentUser={auth.user?.email ?? "local-user"}
              onSave={async (meeting) => {
                await saveMeetingFromPanel(meeting);
                setPageAction(null);
              }}
            />
          </HomeActionModal>
        ) : null}
        {pageAction === "sns-plan" ? (
          <HomeActionModal title="SNS月次運用タスク" subtitle={`${activeProject.name} に月ごとの投稿タスクを作成します。`} onClose={() => setPageAction(null)}>
            <SnsOperationPanel
              plans={activeSnsPlans}
              posts={activeSnsPosts}
              onCreatePlan={async (input) => {
                await createSnsPlanForActiveProject(input);
                setPageAction(null);
              }}
              onUpdatePost={updateSnsPostFromPanel}
            />
          </HomeActionModal>
        ) : null}
      </div>
      )}
    </AppShell>
  );
}

async function requestRequirementDraft({
  client,
  project,
  minutes,
  ruleLayers
}: {
  client: Client;
  project: Project;
  minutes: MinutesRecord;
  ruleLayers: RuleLayer[];
}): Promise<RequirementDraft> {
  const response = await fetch("/api/ai/requirements", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ client, project, minutes, ruleLayers })
  });

  if (!response.ok) {
    throw new Error("要件定義APIの呼び出しに失敗しました。");
  }

  const data = (await response.json()) as { draft?: RequirementDraft };
  if (!data.draft) throw new Error("要件定義APIのレスポンスが不正です。");
  return data.draft;
}

function DashboardLoadingState() {
  return (
    <div className="grid min-h-[calc(100vh-120px)] place-items-center">
      <div className="w-full max-w-md rounded-[24px] border border-line bg-white p-8 text-center shadow-[0_18px_50px_rgba(31,31,34,0.05)]">
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-mogcia-light bg-mogcia-icon">
          <span className="absolute -top-1 left-5 h-4 w-1.5 rounded-full bg-mogcia-primary-dark" />
          <span className="absolute -top-1 right-5 h-4 w-1.5 rounded-full bg-mogcia-primary" />
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-neutral-800 text-sm font-bold text-mogcia-eye">M</span>
        </div>
        <h2 className="mt-5 text-lg font-semibold text-neutral-900">MOGCIA Dev Agentを同期中</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">AuthとFirestoreの状態を確認しています。</p>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-mogcia-light">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-mogcia-primary-dark" />
        </div>
      </div>
    </div>
  );
}

function RequirementDraftCard({
  draft,
  clientName,
  projectName,
  canApprove,
  busy,
  onSave,
  onApprove,
  onCreateProductionTasks
}: {
  draft: RequirementDraft;
  clientName: string;
  projectName: string;
  canApprove: boolean;
  busy: boolean;
  onSave: (draft: RequirementDraft) => Promise<void>;
  onApprove: (draft: RequirementDraft) => Promise<void>;
  onCreateProductionTasks: (draft: RequirementDraft) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editableDraft, setEditableDraft] = useState(draft);

  const updateText = (key: keyof Pick<RequirementDraft, "summary">, value: string) => {
    setEditableDraft((current) => ({ ...current, [key]: value }));
  };

  const updateList = (
    key: keyof Pick<RequirementDraft, "requirements" | "missingQuestions" | "demoScope" | "screens" | "features" | "productionTasks" | "aiRoutes">,
    value: string
  ) => {
    setEditableDraft((current) => ({ ...current, [key]: splitLines(value) }));
  };

  const save = async () => {
    await onSave(editableDraft);
    setIsEditing(false);
  };

  const approved = draft.approvalStatus === "approved";

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm text-neutral-500">{clientName}</p>
          <h3 className="mt-1 font-semibold">{projectName}</h3>
          <p className="mt-1 text-xs text-neutral-400">Version {draft.version ?? 1} / {new Date(draft.updatedAt ?? draft.generatedAt).toLocaleString("ja-JP")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{draft.generatedBy}</span>
          <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{draft.sourceLabel ?? "AI生成"}</span>
          <span className={`rounded-md px-2 py-1 text-xs ${approved ? "bg-mogcia-primary text-ink" : "bg-neutral-100 text-neutral-700"}`}>
            {approved ? "要件承認済み" : "未承認"}
          </span>
        </div>
      </div>

      {isEditing ? (
        <div className="mt-4 grid gap-3">
          <DraftTextArea label="概要" value={editableDraft.summary} onChange={(value) => updateText("summary", value)} rows={4} />
          <DraftTextArea label="要件" value={editableDraft.requirements.join("\n")} onChange={(value) => updateList("requirements", value)} />
          <DraftTextArea label="不足確認" value={editableDraft.missingQuestions.join("\n")} onChange={(value) => updateList("missingQuestions", value)} />
          <DraftTextArea label="Demo範囲" value={editableDraft.demoScope.join("\n")} onChange={(value) => updateList("demoScope", value)} />
          <div className="grid gap-3 md:grid-cols-2">
            <DraftTextArea label="必要画面" value={editableDraft.screens.join("\n")} onChange={(value) => updateList("screens", value)} />
            <DraftTextArea label="必要機能" value={editableDraft.features.join("\n")} onChange={(value) => updateList("features", value)} />
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-neutral-700">{draft.summary}</p>
          {draft.changeNote ? <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">{draft.changeNote}</p> : null}
          <RequirementList title="要件" items={draft.requirements} />
          <RequirementList title="不足確認" items={draft.missingQuestions} />
          <RequirementList title="Demo範囲" items={draft.demoScope} />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <RequirementList title="必要画面" items={draft.screens} compact />
            <RequirementList title="必要機能" items={draft.features} compact />
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50" disabled={busy} onClick={save} type="button">
              {busy ? "保存中" : "保存"}
            </button>
            <button className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50" disabled={busy} onClick={() => setIsEditing(false)} type="button">
              キャンセル
            </button>
          </>
        ) : (
          <button
            className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            disabled={!canApprove || busy || approved}
            onClick={() => {
              setEditableDraft(draft);
              setIsEditing(true);
            }}
            type="button"
          >
            編集
          </button>
        )}
        <button
          className="rounded-md bg-mogcia-primary px-3 py-2 text-sm text-ink hover:bg-mogcia-dark disabled:opacity-50"
          disabled={!canApprove || busy || approved || isEditing}
          onClick={() => onApprove(draft)}
          type="button"
        >
          {busy ? "処理中" : approved ? "承認済み" : "要件承認"}
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!canApprove || busy || isEditing}
          onClick={() => onCreateProductionTasks(draft)}
          type="button"
        >
          本番化タスク生成
        </button>
      </div>
    </div>
  );
}

function DraftTextArea({ label, value, onChange, rows = 5 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <textarea
        className="rounded-md border border-line bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-ink"
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </label>
  );
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function RuleEngineEditor({ ruleLayers, canEdit, onSave }: { ruleLayers: RuleLayer[]; canEdit: boolean; onSave: (ruleLayer: RuleLayer) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(ruleLayers[0]?.id ?? "");
  const selected = ruleLayers.find((rule) => rule.id === selectedId) ?? ruleLayers[0];
  const [draft, setDraft] = useState<RuleLayer | null>(selected ?? null);

  const selectRule = (ruleLayer: RuleLayer) => {
    setSelectedId(ruleLayer.id);
    setDraft(ruleLayer);
  };

  const save = async () => {
    if (!draft) return;
    await onSave(draft);
  };

  return (
    <Panel title="Rule Engine編集" action={canEdit ? "保存可" : "閲覧のみ"}>
      {draft ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {ruleLayers.map((ruleLayer) => (
              <button
                key={ruleLayer.id}
                className={`rounded-md px-3 py-2 text-sm ${ruleLayer.id === draft.id ? "bg-ink text-white" : "border border-line bg-white hover:bg-neutral-50"}`}
                onClick={() => selectRule(ruleLayer)}
                type="button"
              >
                {ruleLayer.name}
              </button>
            ))}
          </div>
          <Field label="Rule名" value={draft.name} onChange={(value) => setDraft((current) => (current ? { ...current, name: value } : current))} placeholder="MOGCIA共通ルール" />
          <DraftTextArea label="Rules" value={draft.rules.join("\n")} onChange={(value) => setDraft((current) => (current ? { ...current, rules: splitLines(value) } : current))} rows={6} />
          <DraftTextArea
            label="Claude Prompt"
            value={draft.prompts?.claude ?? ""}
            onChange={(value) =>
              setDraft((current) => (current ? { ...current, prompts: { ...(current.prompts ?? {}), claude: value } } : current))
            }
            rows={3}
          />
          <button className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50" disabled={!canEdit} onClick={save} type="button">
            Rule保存
          </button>
        </div>
      ) : (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">Ruleがありません。</p>
      )}
    </Panel>
  );
}

function AgentRoutingEditor({
  agentConfigs,
  canEdit,
  onSave,
  onAdd
}: {
  agentConfigs: AgentConfig[];
  canEdit: boolean;
  onSave: (agentConfig: AgentConfig) => Promise<void>;
  onAdd: (agentConfig: AgentConfig) => Promise<void>;
}) {
  const [newName, setNewName] = useState("Designer Agent");
  const [newRole, setNewRole] = useState("デザインレビューとUI改善提案を担当する。");

  const addAgent = async () => {
    const id = `agent-${newName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    await onAdd({
      id,
      name: newName.trim(),
      provider: "openai",
      role: newRole.trim(),
      prompt: `${newName.trim()}として、MOGCIAのRuleに沿って担当領域を支援してください。`,
      enabled: true
    });
  };

  return (
    <Panel title="AI Routing管理" action={canEdit ? "編集可" : "閲覧のみ"}>
      <div className="grid gap-3">
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="font-semibold">Agent追加</p>
          <div className="mt-3 grid gap-3">
            <Field label="Agent名" value={newName} onChange={setNewName} placeholder="Designer Agent" />
            <DraftTextArea label="役割" value={newRole} onChange={setNewRole} rows={3} />
            <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!canEdit || !newName.trim()} onClick={addAgent} type="button">
              Agent追加
            </button>
          </div>
        </div>
        {agentConfigs.map((agentConfig) => (
          <AgentConfigCard key={agentConfig.id} agentConfig={agentConfig} canEdit={canEdit} onSave={onSave} />
        ))}
      </div>
    </Panel>
  );
}

function AgentConfigCard({ agentConfig, canEdit, onSave }: { agentConfig: AgentConfig; canEdit: boolean; onSave: (agentConfig: AgentConfig) => Promise<void> }) {
  const [draft, setDraft] = useState(agentConfig);

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{draft.name}</p>
          <p className="mt-1 text-sm text-neutral-500">{draft.role}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input checked={draft.enabled} disabled={!canEdit} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
          有効
        </label>
      </div>
      <div className="mt-3 grid gap-3">
        <SelectField
          label="Provider"
          onChange={(value) => setDraft((current) => ({ ...current, provider: value as AgentConfig["provider"] }))}
          options={[
            ["claude", "Claude"],
            ["codex", "Codex"],
            ["gemini", "Gemini"],
            ["openai", "ChatGPT / OpenAI"]
          ]}
          value={draft.provider}
        />
        <DraftTextArea label="Prompt" value={draft.prompt} onChange={(value) => setDraft((current) => ({ ...current, prompt: value }))} rows={3} />
        <button className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50" disabled={!canEdit} onClick={() => onSave(draft)} type="button">
          設定保存
        </button>
      </div>
    </div>
  );
}

function CrmManagementPanel({
  client,
  project,
  contacts,
  activities,
  meetings,
  assets,
  analyses,
  currentUser,
  canUploadMeetingAsset,
  onContactSave,
  onActivitySave,
  onMeetingSave,
  onAnalyzeMeeting,
  onMeetingAssetUpload,
  onAnalysisSave,
  onCreateRequirements
}: {
  client: Client;
  project: Project;
  contacts: CompanyContact[];
  activities: SalesActivity[];
  meetings: MeetingRecord[];
  assets: MeetingAsset[];
  analyses: MeetingAnalysis[];
  currentUser: string;
  canUploadMeetingAsset: boolean;
  onContactSave: (contact: CompanyContact) => Promise<void>;
  onActivitySave: (activity: SalesActivity) => Promise<void>;
  onMeetingSave: (meeting: MeetingRecord) => Promise<void>;
  onAnalyzeMeeting: (meeting: MeetingRecord) => Promise<void>;
  onMeetingAssetUpload: (input: { meeting: MeetingRecord; file: File; kind: MeetingAsset["kind"] }) => Promise<void>;
  onAnalysisSave: (analysis: MeetingAnalysis) => Promise<void>;
  onCreateRequirements: (analysis: MeetingAnalysis) => Promise<void>;
}) {
  const [contactName, setContactName] = useState("");
  const [activityBody, setActivityBody] = useState("");
  const [meetingMemo, setMeetingMemo] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("商談・打ち合わせ");
  const [meetingKind, setMeetingKind] = useState<MeetingRecord["kind"]>("Google Meet");
  const [meetingTranscription, setMeetingTranscription] = useState("");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(meetings[0]?.id ?? null);
  const [assetKind, setAssetKind] = useState<MeetingAsset["kind"]>("audio");
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, MeetingAnalysis>>({});
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSplittingLogs, setIsSplittingLogs] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [conversationLogDrafts, setConversationLogDrafts] = useState<Record<string, ConversationLog[]>>({});
  const sortedMeetings = meetings.slice().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const selectedMeeting = sortedMeetings.find((meeting) => meeting.id === selectedMeetingId) ?? sortedMeetings[0];
  const selectedAnalysis = selectedMeeting ? analyses.find((item) => item.meetingId === selectedMeeting.id) : undefined;
  const editableAnalysis = selectedAnalysis ? analysisDrafts[selectedAnalysis.id] ?? selectedAnalysis : undefined;
  const selectedAssets = selectedMeeting ? assets.filter((asset) => asset.meetingId === selectedMeeting.id) : [];
  const selectedConversationLogs = selectedMeeting ? conversationLogDrafts[selectedMeeting.id] ?? selectedMeeting.conversationLogs ?? [] : [];

  const createContact = async () => {
    if (!contactName.trim()) return;
    await onContactSave({
      id: `contact-${crypto.randomUUID()}`,
      clientId: client.id,
      name: contactName.trim(),
      isDecisionMaker: false,
      isPrimary: contacts.length === 0,
      active: true,
      createdAt: new Date().toISOString()
    });
    setContactName("");
  };

  const createActivity = async () => {
    if (!activityBody.trim()) return;
    await onActivitySave({
      id: `sales-activity-${crypto.randomUUID()}`,
      clientId: client.id,
      projectId: project.id,
      kind: "社内メモ",
      occurredAt: new Date().toISOString(),
      title: "営業活動メモ",
      body: activityBody.trim(),
      participants: [],
      owner: currentUser,
      relatedTaskIds: [],
      attachmentIds: [],
      createdBy: currentUser,
      createdAt: new Date().toISOString()
    });
    setActivityBody("");
  };

  const createMeeting = async () => {
    if (!meetingMemo.trim() && !meetingTranscription.trim()) return;
    const conversationLogs = conversationLogsFromManualPaste(meetingTranscription.trim());
    const meeting: MeetingRecord = {
      id: `meeting-${crypto.randomUUID()}`,
      clientId: client.id,
      projectId: project.id,
      title: meetingTitle.trim() || "商談・打ち合わせ",
      kind: meetingKind,
      startedAt: new Date().toISOString(),
      participants: contacts.map((contact) => contact.name),
      mogciaParticipants: [currentUser],
      clientParticipants: contacts.map((contact) => contact.name),
      transcription: meetingTranscription.trim(),
      transcriptionModel: "manual-paste",
      conversationLogModel: "manual-paste",
      conversationLogs,
      manualMemo: meetingMemo.trim(),
      status: "未整理",
      relatedTaskIds: [],
      createdAt: new Date().toISOString()
    };
    await onMeetingSave(meeting);
    setSelectedMeetingId(meeting.id);
    setMeetingMemo("");
    setMeetingTranscription("");
  };

  const saveMeetingText = async () => {
    if (!selectedMeeting) return;
    const pastedLogs = meetingTranscription.trim() ? conversationLogsFromManualPaste(meetingTranscription.trim()) : [];
    const nextLogs = pastedLogs.length > 0 ? [...(selectedMeeting.conversationLogs ?? []), ...pastedLogs] : selectedConversationLogs;
    await onMeetingSave({
      ...selectedMeeting,
      transcription: meetingTranscription.trim() || selectedMeeting.transcription,
      transcriptionModel: meetingTranscription.trim() ? "manual-paste" : selectedMeeting.transcriptionModel,
      conversationLogModel: meetingTranscription.trim() ? "manual-paste" : selectedMeeting.conversationLogModel,
      conversationLogs: nextLogs,
      manualMemo: meetingMemo.trim() || selectedMeeting.manualMemo,
      status: "未整理",
      updatedAt: new Date().toISOString()
    });
    setMeetingMemo("");
    setMeetingTranscription("");
    setConversationLogDrafts((current) => ({ ...current, [selectedMeeting.id]: nextLogs }));
  };

  const transcribeMp4File = async (file: File) => {
    setIsTranscribing(true);
    setTranscriptionError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("speakerHint", "MOGCIA, 顧客");
      const response = await fetch("/api/openai/transcribe", {
        method: "POST",
        body: form
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
      if (!response.ok || !payload.text) {
        throw new Error(payload.error || "文字起こしに失敗しました。");
      }
      setMeetingTranscription((current) => [current.trim(), payload.text].filter(Boolean).join("\n\n"));
      if (selectedMeeting && payload.conversationLogs) {
        const nextLogs = [...(selectedMeeting.conversationLogs ?? []), ...payload.conversationLogs];
        setConversationLogDrafts((current) => ({ ...current, [selectedMeeting.id]: nextLogs }));
        await onMeetingSave({
          ...selectedMeeting,
          transcription: [selectedMeeting.transcription?.trim(), payload.text].filter(Boolean).join("\n\n"),
          transcriptionModel: "gpt-4o-mini-transcribe",
          conversationLogModel: "openai-transcribe-segments",
          conversationLogs: nextLogs,
          transcriptionLanguage: payload.language,
          transcriptionDurationSec: payload.durationSec,
          transcriptionChunkCount: payload.chunkCount,
          transcriptionWasChunked: payload.wasChunked,
          status: "未整理",
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : "文字起こしに失敗しました。");
    } finally {
      setIsTranscribing(false);
    }
  };

  const splitConversationLogsWithAi = async () => {
    if (!selectedMeeting) return;
    const transcriptText = [selectedMeeting.transcription, meetingTranscription].filter(Boolean).join("\n\n");
    if (!transcriptText.trim()) return;
    setIsSplittingLogs(true);
    setTranscriptionError("");
    try {
      const response = await fetch("/api/openai/conversation-logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcriptText })
      });
      const payload = (await response.json()) as { logs?: ConversationLog[]; error?: string };
      if (!response.ok || !payload.logs) throw new Error(payload.error || "AI補助分割に失敗しました。");
      setConversationLogDrafts((current) => ({ ...current, [selectedMeeting.id]: payload.logs ?? [] }));
      await onMeetingSave({
        ...selectedMeeting,
        conversationLogs: payload.logs,
        conversationLogModel: "gpt-4o-mini",
        status: "未整理",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : "AI補助分割に失敗しました。");
    } finally {
      setIsSplittingLogs(false);
    }
  };

  const updateAnalysisText = (
    key: keyof Pick<
      MeetingAnalysis,
      | "customerStatements"
      | "mogciaStatements"
      | "issues"
      | "requests"
      | "concerns"
      | "importantPoints"
      | "proposals"
      | "decisions"
      | "undecided"
      | "confirmations"
      | "requirementInput"
      | "salesNotes"
      | "goodPoints"
      | "badPoints"
      | "talkFlow"
      | "talkScript"
      | "preparationItems"
      | "objectionHandling"
    >,
    value: string
  ) => {
    if (!editableAnalysis) return;
    setAnalysisDrafts((current) => ({
      ...current,
      [editableAnalysis.id]: {
        ...editableAnalysis,
        [key]: splitLines(value)
      }
    }));
  };

  const updateAnalysisSummary = (value: string) => {
    if (!editableAnalysis) return;
    setAnalysisDrafts((current) => ({
      ...current,
      [editableAnalysis.id]: {
        ...editableAnalysis,
        summary: value
      }
    }));
  };

  return (
    <Panel title="営業CRM" action={client.name}>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailMetric label="担当者" value={`${contacts.length}名`} />
          <DetailMetric label="営業活動" value={`${activities.length}件`} />
          <DetailMetric label="会議" value={`${meetings.length}件`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">担当者追加</p>
            <Field label="氏名" value={contactName} onChange={setContactName} placeholder="支配人 山田様" />
            <button className="mt-3 rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!contactName.trim()} onClick={createContact} type="button">
              担当者保存
            </button>
            <div className="mt-3 grid gap-2">
              {contacts.slice(0, 4).map((contact) => (
                <p key={contact.id} className="rounded-md bg-neutral-50 px-3 py-2 text-sm">{contact.name}{contact.isPrimary ? " / 主担当" : ""}</p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">営業活動登録</p>
            <DraftTextArea label="内容" value={activityBody} onChange={setActivityBody} rows={4} />
            <button className="mt-3 rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!activityBody.trim()} onClick={createActivity} type="button">
              活動保存
            </button>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">テレアポ / 商談登録</p>
            <p className="mt-1 text-sm leading-6 text-neutral-500">テレアポはMP4を添付し、文字起こしは話者ラベル付きで貼り付けます。</p>
            <Field label="会議名" value={meetingTitle} onChange={setMeetingTitle} placeholder="テレアポ / 初回商談 / 商談後振り返り" />
            <SelectField
              label="種別"
              value={meetingKind}
              onChange={(value) => setMeetingKind(value as MeetingRecord["kind"])}
              options={[
                ["Google Meet", "Google Meet"],
                ["Zoom", "Zoom"],
                ["Microsoft Teams", "Microsoft Teams"],
                ["電話", "電話"],
                ["対面", "対面"],
                ["その他", "その他"]
              ]}
            />
            <DraftTextArea label="メモ" value={meetingMemo} onChange={setMeetingMemo} rows={3} />
            <DraftTextArea
              label="文字起こし / 話者分離"
              value={meetingTranscription}
              onChange={setMeetingTranscription}
              rows={6}
            />
            <p className="mt-2 rounded-md bg-mogcia-icon px-3 py-2 text-xs leading-5 text-neutral-500">
              例: MOGCIA: 本日は公式LINEの件でお電話しました。 / 顧客: 運用負担が増えるのは少し不安です。
            </p>
            <button className="mt-3 rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!meetingMemo.trim() && !meetingTranscription.trim()} onClick={createMeeting} type="button">
              保存して分析準備
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-lg border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">会議一覧</p>
              <span className="rounded-md bg-mogcia-light px-2 py-1 text-xs">{sortedMeetings.length}件</span>
            </div>
            <div className="mt-3 grid gap-2">
              {sortedMeetings.map((meeting) => {
                const analysis = analyses.find((item) => item.meetingId === meeting.id);
                return (
                  <button
                    key={meeting.id}
                    className={`rounded-md border px-3 py-3 text-left text-sm transition ${selectedMeeting?.id === meeting.id ? "border-ink bg-mogcia-icon" : "border-line bg-neutral-50 hover:bg-mogcia-surface"}`}
                    onClick={() => setSelectedMeetingId(meeting.id)}
                    type="button"
                  >
                    <span className="block font-medium">{meeting.title}</span>
                    <span className="mt-1 block text-xs text-neutral-500">{new Date(meeting.startedAt).toLocaleString("ja-JP")} / {meeting.status}</span>
                    <span className="mt-2 inline-flex rounded-md bg-white px-2 py-1 text-xs text-neutral-600">{analysis ? `解析: ${analysis.status}` : "解析未作成"}</span>
                  </button>
                );
              })}
              {sortedMeetings.length === 0 ? <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">会議を保存すると詳細と解析画面が表示されます。</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            {selectedMeeting ? (
              <div className="grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{selectedMeeting.title}</p>
                    <p className="mt-1 text-sm text-neutral-500">{selectedMeeting.kind} / {new Date(selectedMeeting.startedAt).toLocaleString("ja-JP")}</p>
                  </div>
                  <span className="rounded-md bg-neutral-100 px-3 py-2 text-sm">{selectedMeeting.status}</span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-neutral-50 p-3">
                    <p className="text-sm font-semibold">参加者</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{selectedMeeting.participants.join(" / ") || "未設定"}</p>
                  </div>
                  <div className="rounded-md bg-neutral-50 p-3">
                    <p className="text-sm font-semibold">会議メモ</p>
                    <p className="mt-2 line-clamp-4 text-sm leading-6 text-neutral-600">{selectedMeeting.manualMemo || selectedMeeting.transcription || "未登録"}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-mogcia-surface p-4">
                  <p className="font-semibold">録音 / 動画 / 文字起こし添付</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                    <SelectField
                      label="添付種別"
                      value={assetKind}
                      onChange={(value) => setAssetKind(value as MeetingAsset["kind"])}
                      options={[
                        ["audio", "録音"],
                        ["video", "動画"],
                        ["transcription", "文字起こし"],
                        ["memo", "メモ"],
                        ["other", "その他"]
                      ]}
                    />
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-neutral-700">ファイル</span>
                      <input
                        className="rounded-md border border-line bg-white px-3 py-2 text-sm disabled:opacity-50"
                        accept={assetKind === "video" ? "video/mp4,video/*" : assetKind === "audio" ? "audio/*" : undefined}
                        disabled={!canUploadMeetingAsset}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void onMeetingAssetUpload({ meeting: selectedMeeting, file, kind: assetKind });
                          event.currentTarget.value = "";
                        }}
                        type="file"
                      />
                    </label>
                  </div>
                  {!canUploadMeetingAsset ? <p className="mt-2 text-xs text-neutral-500">Storage保存は石田アカウントのみ可能です。</p> : null}
                  <div className="mt-3 grid gap-2">
                    {selectedAssets.map((asset) => (
                      <p key={asset.id} className="rounded-md bg-white px-3 py-2 text-sm">
                        <span className="font-medium">{asset.name}</span>
                        <span className="ml-2 text-xs text-neutral-500">{asset.kind} / {Math.round(asset.size / 1024)}KB</span>
                      </p>
                    ))}
                    {selectedAssets.length === 0 ? <p className="rounded-md bg-white px-3 py-2 text-sm text-neutral-500">添付ファイルはまだありません。</p> : null}
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-mogcia-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">文字起こし / メモ追記</p>
                      <p className="mt-1 text-sm text-neutral-500">MP4から自動文字起こし、またはコピペで追記できます。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer rounded-md border border-line bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                        {isTranscribing ? "文字起こし中" : "MP4文字起こし"}
                        <input
                          accept="video/mp4,video/*,audio/*"
                          className="hidden"
                          disabled={isTranscribing}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void transcribeMp4File(file);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!meetingMemo.trim() && !meetingTranscription.trim()} onClick={saveMeetingText} type="button">
                        追記保存
                      </button>
                      <button className="rounded-md bg-mogcia-primary px-3 py-2 text-sm text-ink disabled:opacity-50" disabled={isSplittingLogs || !(selectedMeeting.transcription || meetingTranscription).trim()} onClick={splitConversationLogsWithAi} type="button">
                        {isSplittingLogs ? "AI分割中" : "AI補助分割"}
                      </button>
                    </div>
                  </div>
                  {transcriptionError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{transcriptionError}</p> : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <DraftTextArea label="追記メモ" value={meetingMemo} onChange={setMeetingMemo} rows={4} />
                    <DraftTextArea label="追記文字起こし" value={meetingTranscription} onChange={setMeetingTranscription} rows={4} />
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">会話ログ</p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {selectedMeeting.conversationLogModel ?? "未作成"} / {selectedConversationLogs.length}件
                      </p>
                    </div>
                    <span className="rounded-md bg-mogcia-light px-3 py-2 text-xs text-neutral-700">
                      {selectedMeeting.transcriptionWasChunked ? `分割 ${selectedMeeting.transcriptionChunkCount ?? 0} chunks` : "単体処理"}
                    </span>
                  </div>
                  <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
                    {selectedConversationLogs.length > 0 ? (
                      selectedConversationLogs.map((log) => (
                        <div key={log.id} className={`rounded-[16px] border px-4 py-3 ${log.speaker === "sales" ? "border-mogcia-light bg-mogcia-icon" : log.speaker === "customer" ? "border-line bg-neutral-50" : "border-line bg-white"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-mogcia-blush">{log.label}</p>
                            <p className="text-xs text-neutral-400">
                              {typeof log.startSec === "number" ? `${log.startSec}s-${log.endSec ?? log.startSec}s / ` : ""}confidence {Math.round(log.confidence * 100)}%
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-neutral-700">{log.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                        文字起こしを貼り付けて保存、またはMP4文字起こしを実行すると会話ログが作成されます。
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">AI解析確認</p>
                      <p className="mt-1 text-sm text-neutral-500">顧客発言、MOGCIA提案、未確定事項を確認してから要件定義へ送ります。</p>
                    </div>
                    <button className="rounded-md bg-mogcia-primary px-3 py-2 text-sm text-ink" onClick={() => onAnalyzeMeeting(selectedMeeting)} type="button">
                      AI候補作成
                    </button>
                  </div>

                  {editableAnalysis ? (
                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-[18px] border border-line bg-mogcia-icon p-4">
                          <p className="text-xs font-semibold uppercase text-mogcia-blush">Lead score</p>
                          <p className="mt-2 text-3xl font-semibold text-neutral-950">{editableAnalysis.leadScore ?? "-"}<span className="ml-1 text-base">点</span></p>
                          <p className="mt-1 text-sm text-neutral-500">見込み度: {editableAnalysis.leadGrade ?? "未判定"}</p>
                        </div>
                        <div className="rounded-[18px] border border-line bg-white p-4">
                          <p className="text-sm font-semibold text-neutral-900">準備するもの</p>
                          <div className="mt-2 grid gap-1 text-sm text-neutral-600">
                            {(editableAnalysis.preparationItems ?? ["準備物は未生成です。"]).slice(0, 4).map((item) => <p key={item}>・{item}</p>)}
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-line bg-white p-4">
                          <p className="text-sm font-semibold text-neutral-900">次にすること</p>
                          <div className="mt-2 grid gap-1 text-sm text-neutral-600">
                            {editableAnalysis.nextActions.length > 0 ? editableAnalysis.nextActions.slice(0, 3).map((action) => <p key={`${action.title}-${action.due}`}>・{action.title} / {action.due || "期限未定"}</p>) : <p>・次回アクションを手動で確認してください。</p>}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <RequirementList title="打ち合わせの流れ" items={editableAnalysis.talkFlow ?? []} compact />
                        <RequirementList title="トークスクリプト" items={editableAnalysis.talkScript ?? []} compact />
                        <RequirementList title="良かった点" items={editableAnalysis.goodPoints ?? []} compact />
                        <RequirementList title="悪かった点" items={editableAnalysis.badPoints ?? []} compact />
                      </div>
                      <DraftTextArea label="要約" value={editableAnalysis.summary} onChange={updateAnalysisSummary} rows={3} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <DraftTextArea label="顧客発言" value={editableAnalysis.customerStatements.join("\n")} onChange={(value) => updateAnalysisText("customerStatements", value)} rows={4} />
                        <DraftTextArea label="MOGCIA提案" value={editableAnalysis.mogciaStatements.join("\n")} onChange={(value) => updateAnalysisText("mogciaStatements", value)} rows={4} />
                        <DraftTextArea label="課題" value={editableAnalysis.issues.join("\n")} onChange={(value) => updateAnalysisText("issues", value)} rows={4} />
                        <DraftTextArea label="要望" value={editableAnalysis.requests.join("\n")} onChange={(value) => updateAnalysisText("requests", value)} rows={4} />
                        <DraftTextArea label="懸念" value={editableAnalysis.concerns.join("\n")} onChange={(value) => updateAnalysisText("concerns", value)} rows={4} />
                        <DraftTextArea label="未確定 / 確認事項" value={[...editableAnalysis.undecided, ...editableAnalysis.confirmations].join("\n")} onChange={(value) => updateAnalysisText("confirmations", value)} rows={4} />
                        <DraftTextArea label="決定事項" value={editableAnalysis.decisions.join("\n")} onChange={(value) => updateAnalysisText("decisions", value)} rows={4} />
                        <DraftTextArea label="良かった点" value={(editableAnalysis.goodPoints ?? []).join("\n")} onChange={(value) => updateAnalysisText("goodPoints", value)} rows={4} />
                        <DraftTextArea label="悪かった点" value={(editableAnalysis.badPoints ?? []).join("\n")} onChange={(value) => updateAnalysisText("badPoints", value)} rows={4} />
                        <DraftTextArea label="打ち合わせの流れ" value={(editableAnalysis.talkFlow ?? []).join("\n")} onChange={(value) => updateAnalysisText("talkFlow", value)} rows={4} />
                        <DraftTextArea label="トークスクリプト" value={(editableAnalysis.talkScript ?? []).join("\n")} onChange={(value) => updateAnalysisText("talkScript", value)} rows={4} />
                        <DraftTextArea label="準備するもの" value={(editableAnalysis.preparationItems ?? []).join("\n")} onChange={(value) => updateAnalysisText("preparationItems", value)} rows={4} />
                        <DraftTextArea label="切り返し・懸念対応" value={(editableAnalysis.objectionHandling ?? []).join("\n")} onChange={(value) => updateAnalysisText("objectionHandling", value)} rows={4} />
                        <DraftTextArea label="要件定義へ送る材料" value={editableAnalysis.requirementInput.join("\n")} onChange={(value) => updateAnalysisText("requirementInput", value)} rows={4} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-md bg-ink px-3 py-2 text-sm text-white" onClick={() => onAnalysisSave(editableAnalysis)} type="button">
                          解析結果を確定保存
                        </button>
                        <button className="rounded-md bg-mogcia-primary px-3 py-2 text-sm text-ink" onClick={() => onCreateRequirements(editableAnalysis)} type="button">
                          要件定義へ送る
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">AI候補を作成すると、確認・修正できる解析結果が表示されます。</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">会議を選択してください。</p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function meetingAnalysisToMinutesText(analysis: MeetingAnalysis, meeting?: MeetingRecord): string {
  return [
    `会議: ${meeting?.title ?? analysis.meetingId}`,
    `解析ステータス: ${analysis.status}`,
    analysis.leadGrade ? `見込み度: ${analysis.leadGrade} (${analysis.leadScore ?? 0}点)` : "",
    formatAnalysisSection("要約", [analysis.summary]),
    formatAnalysisSection("良かった点", analysis.goodPoints ?? []),
    formatAnalysisSection("悪かった点", analysis.badPoints ?? []),
    formatAnalysisSection("顧客発言", analysis.customerStatements),
    formatAnalysisSection("MOGCIA提案", analysis.mogciaStatements),
    formatAnalysisSection("課題", analysis.issues),
    formatAnalysisSection("要望", analysis.requests),
    formatAnalysisSection("懸念", analysis.concerns),
    formatAnalysisSection("重要ポイント", analysis.importantPoints),
    formatAnalysisSection("決定事項", analysis.decisions),
    formatAnalysisSection("未確定事項", analysis.undecided),
    formatAnalysisSection("確認事項", analysis.confirmations),
    formatAnalysisSection("次回商談の流れ", analysis.talkFlow ?? []),
    formatAnalysisSection("トークスクリプト", analysis.talkScript ?? []),
    formatAnalysisSection("準備するもの", analysis.preparationItems ?? []),
    formatAnalysisSection("要件定義へ送る材料", analysis.requirementInput),
    formatAnalysisSection("営業メモ", analysis.salesNotes)
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatAnalysisSection(title: string, items: string[]): string {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (normalized.length === 0) return "";
  return `${title}\n${normalized.map((item) => `- ${item}`).join("\n")}`;
}

function splitSpeakerTranscript(text: string): { customer: string[]; mogcia: string[]; unknown: string[] } {
  const customerLabels = ["顧客", "お客様", "先方", "相手", "クライアント", "支配人", "担当者", "社長"];
  const mogciaLabels = ["MOGCIA", "石田", "真梨奈", "弊社", "営業", "担当"];
  const customer: string[] = [];
  const mogcia: string[] = [];
  const unknown: string[] = [];

  splitLines(text).forEach((line) => {
    const normalized = line.replace(/^[-・\s]+/, "");
    const separatorIndex = normalized.search(/[:：]/);
    if (separatorIndex <= 0) {
      unknown.push(normalized);
      return;
    }
    const label = normalized.slice(0, separatorIndex).trim();
    const body = normalized.slice(separatorIndex + 1).trim();
    if (!body) return;
    if (customerLabels.some((candidate) => label.includes(candidate))) {
      customer.push(body);
      return;
    }
    if (mogciaLabels.some((candidate) => label.includes(candidate))) {
      mogcia.push(body);
      return;
    }
    unknown.push(normalized);
  });

  return { customer, mogcia, unknown };
}

function summarizeMeetingText(text: string, kind: MeetingKind): string {
  const lines = splitLines(text);
  if (lines.length === 0) return kind === "電話" ? "テレアポ内容から商談準備候補を作成しました。" : "商談内容から振り返り候補を作成しました。";
  return lines.slice(0, 3).join(" / ").slice(0, 220);
}

function scoreMeetingLead(text: string): number {
  const positiveKeywords = ["興味", "検討", "お願い", "進め", "見積", "提案", "デモ", "Demo", "詳しく", "次回", "日程", "課題", "困", "必要"];
  const negativeKeywords = ["不要", "今は", "高い", "予算", "忙しい", "難しい", "保留", "また今度", "断", "必要ない"];
  const positive = positiveKeywords.reduce((count, keyword) => count + countKeyword(text, keyword), 0);
  const negative = negativeKeywords.reduce((count, keyword) => count + countKeyword(text, keyword), 0);
  return Math.max(10, Math.min(95, 45 + positive * 7 - negative * 8));
}

function countKeyword(text: string, keyword: string): number {
  return text.split(keyword).length - 1;
}

function createMeetingGoodPoints(text: string, speaker: { customer: string[]; mogcia: string[] }): string[] {
  const points = [
    ...extractKeywordLines(text, ["興味", "課題", "困", "検討", "次回"]).slice(0, 3),
    ...speaker.mogcia.filter((line) => line.includes("確認") || line.includes("提案") || line.includes("できます")).slice(0, 2)
  ];
  const unique = uniqueNonEmpty(points);
  return unique.length > 0 ? unique : ["相手の課題や関心を会話から拾えているため、次回提案に繋げられます。"];
}

function createMeetingBadPoints(text: string, speaker: { customer: string[]; mogcia: string[] }): string[] {
  const concerns = extractKeywordLines(text, ["不安", "負担", "高い", "予算", "難しい", "未定", "確認", "忙しい"]);
  const missing = speaker.customer.length === 0 ? ["話者ラベルが少ないため、顧客発言とMOGCIA提案の分離を手動で整える必要があります。"] : [];
  return uniqueNonEmpty([...concerns.slice(0, 4), ...missing]);
}

function createTalkFlow(text: string, client: Client, project: Project): string[] {
  const concerns = extractKeywordLines(text, ["不安", "負担", "高い", "予算", "難しい"]).slice(0, 2);
  return uniqueNonEmpty([
    `${client.name}の前回状況を確認し、今日は${project.name}の目的確認から入る。`,
    "相手の現状運用、困っていること、意思決定者、時期、予算感を順番に確認する。",
    concerns.length > 0 ? `懸念点として ${concerns.join(" / ")} を先に受け止める。` : "懸念が出たら、運用負担・費用・社内確認のどれかに分類する。",
    "Demoまたは資料を見せる前に、相手が一番確認したい成果を一つに絞る。",
    "最後に次回アクション、担当者、期限をその場で確認する。"
  ]);
}

function createTalkScript(text: string, client: Client, project: Project): string[] {
  const issue = extractKeywordLines(text, ["課題", "困", "不足"])[0] ?? "今の運用で一番手間になっているところ";
  const interest = extractKeywordLines(text, ["興味", "したい", "欲しい"])[0] ?? project.name;
  return [
    `本日は${client.name}様の${interest}について、まず現状と優先順位を整理させてください。`,
    `前回は「${issue}」がポイントだと感じたので、今日はそこを解消できる形か確認したいです。`,
    "こちらから機能を増やす話ではなく、最初に必要な導線だけをDemoで見えるようにします。",
    "運用負担が増えないように、誰が・いつ・何を更新するかまで一緒に決めたいです。",
    "今日の最後に、次回までにMOGCIA側で準備するものと、先方で確認いただくものを分けます。"
  ];
}

function createPreparationItems(text: string, client: Client, project: Project): string[] {
  const items = [
    `${client.name}向けの会社概要・現在サービス情報`,
    `${project.name}の簡易Demoまたは画面構成`,
    "料金表または概算見積のたたき台",
    "導入後の運用フロー案",
    "次回アクションをその場で決めるための候補日"
  ];
  if (text.includes("事例") || text.includes("ゴルフ")) items.push("同業または近い業種の事例資料");
  if (text.includes("LINE")) items.push("公式LINE導線のサンプル画面");
  if (text.includes("SNS")) items.push("SNS運用の月次進行サンプル");
  return uniqueNonEmpty(items);
}

function createObjectionHandling(text: string): string[] {
  const handlers = [
    "費用が不安: まずDemoで必要範囲を絞り、初期費用と運用費を分けて説明する。",
    "運用負担が不安: 更新頻度、担当者、MOGCIA側で巻き取る範囲を先に決める。",
    "社内確認が必要: 決裁者向けに1枚で分かる目的・費用・効果の資料を用意する。"
  ];
  if (text.includes("予約")) handlers.push("予約連携が気になる: Demoでは画面導線だけ確認し、本番連携は契約後の別タスクとして切る。");
  if (text.includes("LINE")) handlers.push("LINE連携が気になる: DemoではAPI接続せず、導線と表示内容だけを先に固める。");
  return handlers;
}

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function HomeCard({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex h-full min-h-[260px] flex-col rounded-[20px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)] ${className}`}>
      {children}
    </section>
  );
}

function HomeCardHeader({
  eyebrow,
  title,
  badge
}: {
  eyebrow?: string;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[48px] items-start justify-between gap-3 border-b border-line/70 pb-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase text-mogcia-blush">{eyebrow}</p> : null}
        <h3 className="mt-1 truncate text-lg font-semibold text-neutral-900">{title}</h3>
      </div>
      {badge}
    </div>
  );
}

function HomeCardFooterButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="mt-auto w-full rounded-full bg-white py-2 text-sm text-neutral-600 ring-1 ring-line hover:bg-mogcia-surface" onClick={onClick} type="button">
      {children}
    </button>
  );
}

function ProductsWorkspace({
  currentUser,
  onSave,
  products
}: {
  currentUser: string;
  onSave: (product: Product) => Promise<void>;
  products: Product[];
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    category: "HP" as ProductCategory,
    description: ""
  });
  const activeProducts = products.filter((product) => product.active !== false);
  const inactiveProducts = products.filter((product) => product.active === false);

  const submit = async () => {
    if (!draft.name.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        id: `product-${crypto.randomUUID()}`,
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description.trim(),
        active: true,
        createdBy: currentUser,
        createdAt: new Date().toISOString()
      });
      setDraft({ name: "", category: "HP", description: "" });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (product: Product) => {
    await onSave({ ...product, active: !product.active, updatedAt: new Date().toISOString() });
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-950">商材</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">テレアポ、打ち合わせ、案件登録で選択する商材マスタです。</p>
          </div>
          <span className="rounded-full bg-mogcia-light px-3 py-1 text-xs font-semibold text-mogcia-blush">{activeProducts.length}件有効</span>
        </div>
        <div className="mt-5 grid gap-3">
          {activeProducts.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-line bg-mogcia-surface p-5 text-sm text-neutral-500">まだ商材がありません。右側から追加してください。</div>
          ) : null}
          {activeProducts.map((product) => (
            <div key={product.id} className="rounded-[18px] border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-neutral-950">{product.name}</p>
                  <p className="mt-1 text-xs font-semibold text-mogcia-blush">{product.category}</p>
                </div>
                <button className="rounded-full border border-line px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50" onClick={() => toggleActive(product)} type="button">
                  無効にする
                </button>
              </div>
              {product.description ? <p className="mt-3 text-sm leading-6 text-neutral-600">{product.description}</p> : null}
            </div>
          ))}
        </div>
        {inactiveProducts.length > 0 ? (
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm font-semibold text-neutral-500">無効</p>
            <div className="mt-3 grid gap-2">
              {inactiveProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-[14px] bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
                  <span>{product.name}</span>
                  <button className="text-mogcia-blush hover:underline" onClick={() => toggleActive(product)} type="button">
                    有効に戻す
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
        <h3 className="text-lg font-semibold text-neutral-950">商材を追加</h3>
        <div className="mt-5 grid gap-4">
          <Field label="商材名" placeholder="例: 公式LINEミニページ" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <SelectField
            label="カテゴリ"
            options={productCategoryOptions.map((category) => [category, category])}
            value={draft.category}
            onChange={(value) => setDraft((current) => ({ ...current, category: value as ProductCategory }))}
          />
          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-700">説明</span>
            <textarea
              className="min-h-32 rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-ink"
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="商談分析で参照したい内容、提案時の注意点など"
              value={draft.description}
            />
          </label>
          <button className="rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-45" disabled={isSaving || !draft.name.trim()} onClick={submit} type="button">
            {isSaving ? "保存中" : "保存する"}
          </button>
        </div>
      </div>
    </section>
  );
}

const pageActionLabels: Record<DashboardPage, { title: string; note: string }> = {
  home: { title: "Home operations", note: "今日の対応を整理します。" },
  projects: { title: "案件操作", note: "案件登録、議事録、承認、Demo進捗をここから動かします。" },
  crm: { title: "営業操作", note: "営業メモ、商談メモ、会社タイムラインへの登録をすぐ開けます。" },
  rules: { title: "Rules操作", note: "要件・AI・Coding Ruleを確認しながら案件や議事録へ戻れます。" },
  routing: { title: "AI操作", note: "Agentの稼働状況を見ながら、実行履歴と人間確認へ進めます。" },
  tasks: { title: "Demo / Codex操作", note: "Demo生成、Codex結果、残タスクを確認します。" },
  gmail: { title: "設定操作", note: "テンプレート、通知、素材アップロードを管理します。" },
  reports: { title: "分析操作", note: "Website分析、AIレビュー、月次レポートを手動作成できます。" },
  sns: { title: "SNS運用操作", note: "月次投稿タスクと確認待ちを手動で管理します。" },
  team: { title: "チーム操作", note: "ユーザー、代理店、権限の状態を確認します。" },
  products: { title: "商材管理", note: "テレアポ、打ち合わせ、案件に紐づける商材を管理します。" },
  settings: { title: "システム操作", note: "初期データ、Storage、通知、メールテンプレートを管理します。" }
};

function PageActionBar({
  activePage,
  approvalCount,
  demoTaskCount,
  snsWaitingCount,
  onOpenApproval,
  onOpenMeeting,
  onOpenProject,
  onOpenQuickCapture,
  onOpenSnsPlan,
  onOpenTasks
}: {
  activePage: DashboardPage;
  approvalCount: number;
  demoTaskCount: number;
  snsWaitingCount: number;
  onOpenApproval: () => void;
  onOpenMeeting: () => void;
  onOpenProject: () => void;
  onOpenQuickCapture: () => void;
  onOpenSnsPlan: () => void;
  onOpenTasks: () => void;
}) {
  const label = pageActionLabels[activePage];
  const actions = [
    { title: "案件・議事録", note: "新規登録", tone: "primary", onClick: onOpenProject },
    { title: "営業メモ", note: "会社タイムライン", tone: "plain", onClick: onOpenQuickCapture },
    { title: "商談メモ", note: "会議記録", tone: "plain", onClick: onOpenMeeting },
    { title: "SNS月次", note: `確認待ち ${snsWaitingCount}件`, tone: "plain", onClick: onOpenSnsPlan },
    { title: "承認キュー", note: `${approvalCount}件`, tone: "soft", onClick: onOpenApproval },
    { title: "Demo進捗", note: `残 ${demoTaskCount}件`, tone: "soft", onClick: onOpenTasks }
  ];

  return (
    <section className="rounded-[20px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mogcia-blush">Manual operations</p>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">{label.title}</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">{label.note}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:min-w-[680px] xl:grid-cols-6">
          {actions.map((action) => (
            <button
              key={action.title}
              className={`min-h-[76px] rounded-[16px] border px-3 py-3 text-left transition hover:-translate-y-0.5 ${
                action.tone === "primary"
                  ? "border-mogcia-primary-dark bg-mogcia-primary text-neutral-950 shadow-[0_10px_28px_rgba(197,154,152,0.24)]"
                  : action.tone === "soft"
                    ? "border-mogcia-light bg-mogcia-icon text-neutral-900"
                    : "border-line bg-white text-neutral-900 hover:border-mogcia-primary-dark"
              }`}
              onClick={action.onClick}
              type="button"
            >
              <span className="block text-sm font-semibold">{action.title}</span>
              <span className="mt-1 block text-xs text-neutral-500">{action.note}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusFeedback({ status, source }: { status: string; source: "sample" | "firestore" }) {
  const isError = status.includes("エラー") || status.includes("失敗") || status.includes("failed") || status.includes("Unauthorized");
  const isSaved = status.includes("保存") || status.includes("作成") || status.includes("完了") || status.includes("反映");
  const shouldShow = isError || isSaved || source === "sample";
  if (!shouldShow) return null;

  return (
    <div
      className={`rounded-[18px] border px-4 py-3 text-sm shadow-[0_10px_28px_rgba(31,31,34,0.03)] ${
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : isSaved
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-line bg-white text-neutral-600"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{status}</span>
        {source === "sample" ? <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-neutral-500">サンプル表示</span> : null}
      </div>
    </div>
  );
}

function RouteFocusBanner({
  pathname,
  client,
  project,
  meetings
}: {
  pathname: string;
  client: Client;
  project: Project;
  meetings: MeetingRecord[];
}) {
  const isCompanyDetail = pathname.startsWith("/companies/") && pathname.split("/").filter(Boolean).length > 1;
  const isProjectDetail = pathname.startsWith("/projects/") && !pathname.startsWith("/projects/demo") && pathname.split("/").filter(Boolean).length > 1;
  const isMeetings = pathname.startsWith("/meetings");
  if (!isCompanyDetail && !isProjectDetail && !isMeetings) return null;

  const title = isProjectDetail ? project.name : isCompanyDetail ? client.name : "商談分析";
  const note = isMeetings
    ? "テレアポ、商談前準備、商談後振り返りをここで整理します。"
    : isProjectDetail
      ? `${client.name} / ${project.status}`
      : `${project.name} / ${client.companyType ?? "会社詳細"}`;

  return (
    <section className="rounded-[20px] border border-mogcia-light bg-mogcia-icon p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mogcia-blush">Focused detail</p>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{note}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">商談</p>
            <p className="mt-1 text-lg font-semibold">{meetings.length}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">状態</p>
            <p className="mt-1 text-sm font-semibold">{project.status}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">種別</p>
            <p className="mt-1 text-sm font-semibold">{project.kind === "sns-operation" ? "SNS" : "開発"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeActionLauncher({
  approvalCount,
  demoTaskCount,
  snsWaitingCount,
  cliEvents,
  onOpenProject,
  onOpenQuickCapture,
  onOpenMeeting,
  onOpenSns,
  onOpenApproval
}: {
  approvalCount: number;
  demoTaskCount: number;
  snsWaitingCount: number;
  cliEvents: HomeCliEvent[];
  onOpenProject: () => void;
  onOpenQuickCapture: () => void;
  onOpenMeeting: () => void;
  onOpenSns: () => void;
  onOpenApproval: () => void;
}) {
  const latestCliEvent = cliEvents[0];
  const actions = [
    {
      title: "案件・議事録を登録",
      note: "営業・代理店の入口",
      accent: "bg-mogcia-primary text-neutral-900",
      onClick: onOpenProject
    },
    {
      title: "営業メモを残す",
      note: "会社タイムラインへ整理",
      accent: "bg-white text-neutral-900",
      onClick: onOpenQuickCapture
    },
    {
      title: "商談メモを登録",
      note: "会議・文字起こし",
      accent: "bg-white text-neutral-900",
      onClick: onOpenMeeting
    },
    {
      title: "SNS運用を確認",
      note: `素材待ち・確認待ち ${snsWaitingCount}件`,
      accent: "bg-white text-neutral-900",
      onClick: onOpenSns
    }
  ];

  return (
    <HomeCard className="min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mogcia-blush">Quick operations</p>
          <h2 className="mt-2 text-xl font-semibold text-neutral-950">Homeからすぐ作業する</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-500">状況を見ながら、必要な操作だけその場で開きます。入力フォームは閉じるまでHomeを邪魔しません。</p>
        </div>
        <button className="rounded-2xl border border-mogcia-light bg-mogcia-icon px-4 py-3 text-sm font-semibold text-mogcia-blush hover:bg-mogcia-light" onClick={onOpenApproval} type="button">
          承認待ち {approvalCount}件 / Demo残 {demoTaskCount}件
        </button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.title}
            className={`rounded-[18px] border border-line px-4 py-4 text-left shadow-[0_10px_30px_rgba(31,31,34,0.035)] transition hover:-translate-y-0.5 hover:border-mogcia-primary-dark ${action.accent}`}
            onClick={action.onClick}
            type="button"
          >
            <span className="block text-sm font-semibold">{action.title}</span>
            <span className="mt-2 block text-xs text-neutral-500">{action.note}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="rounded-[18px] border border-mogcia-light bg-mogcia-icon px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mogcia-blush">CLI live</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {latestCliEvent ? `${latestCliEvent.command} / ${latestCliEvent.projectName}` : "CLIの実行待ち"}
              </p>
              <p className="mt-1 text-sm leading-6 text-neutral-600">
                {latestCliEvent ? latestCliEvent.summary : "ターミナルで mogcia status や mogcia run を実行すると、ここに反応が出ます。"}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${latestCliEvent?.status === "failed" ? "bg-red-100 text-red-700" : latestCliEvent?.status === "started" ? "bg-yellow-100 text-yellow-700" : "bg-emerald-100 text-emerald-700"}`}>
              {latestCliEvent ? latestCliEvent.status : "waiting"}
            </span>
          </div>
        </div>
        <div className="rounded-[18px] border border-line bg-white px-4 py-4 text-sm text-neutral-600">
          <p className="font-semibold text-neutral-900">CLI連携</p>
          <p className="mt-1 text-xs leading-5">Webをモニターに表示したまま、CLI操作の結果をHomeへ反映します。</p>
        </div>
      </div>
    </HomeCard>
  );
}

function HomeActionModal({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <AppDrawer eyebrow="Page operation" onClose={onClose} subtitle={subtitle} title={title}>
      {children}
    </AppDrawer>
  );
}

function HomeMeetingCaptureForm({
  clients,
  projects,
  currentUser,
  onSave
}: {
  clients: Client[];
  projects: Project[];
  currentUser: string;
  onSave: (meeting: MeetingRecord) => Promise<void>;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const relatedProjects = projects.filter((project) => project.clientId === clientId);
  const [projectId, setProjectId] = useState(relatedProjects[0]?.id ?? projects[0]?.id ?? "");
  const [title, setTitle] = useState("商談・打ち合わせ");
  const [kind, setKind] = useState<MeetingRecord["kind"]>("Google Meet");
  const [manualMemo, setManualMemo] = useState("");
  const [transcription, setTranscription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const canSave = Boolean(clientId && title.trim() && (manualMemo.trim() || transcription.trim()));

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave({
        id: `meeting-${crypto.randomUUID()}`,
        clientId,
        projectId: projectId || undefined,
        title: title.trim(),
        kind,
        startedAt: new Date().toISOString(),
        endedAt: undefined,
        participants: [],
        mogciaParticipants: [currentUser],
        clientParticipants: [],
        status: "未整理",
        relatedTaskIds: [],
        transcription: transcription.trim(),
        manualMemo: manualMemo.trim(),
        createdAt: new Date().toISOString()
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel title="商談・会議メモ登録" action="Firestore保存">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-3">
          <SelectField
            label="会社"
            value={clientId}
            onChange={(value) => {
              setClientId(value);
              const nextProject = projects.find((project) => project.clientId === value);
              setProjectId(nextProject?.id ?? "");
            }}
            options={clients.map((client) => [client.id, client.name])}
          />
          <SelectField label="案件" value={projectId} onChange={setProjectId} options={(relatedProjects.length > 0 ? relatedProjects : projects).map((project) => [project.id, project.name])} />
          <Field label="会議名" value={title} onChange={setTitle} placeholder="初回ヒアリング / 定例MTG" />
          <SelectField
            label="種別"
            value={kind}
            onChange={(value) => setKind(value as MeetingRecord["kind"])}
            options={[
              ["Google Meet", "Google Meet"],
              ["電話", "電話"],
              ["対面", "対面"],
              ["その他", "その他"]
            ]}
          />
          <div className="rounded-2xl bg-mogcia-icon px-4 py-3 text-sm leading-6 text-neutral-600">
            保存後は会社タイムラインに残ります。詳細なAI解析や要件定義への変換は商談ページで確認できます。
          </div>
        </div>
        <div className="grid gap-3">
          <DraftTextArea label="手入力メモ" value={manualMemo} onChange={setManualMemo} rows={7} />
          <DraftTextArea label="文字起こし" value={transcription} onChange={setTranscription} rows={7} />
          <button className="rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50" disabled={!canSave || isSaving} onClick={() => void save()} type="button">
            {isSaving ? "保存中" : "商談メモを保存"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function HomeOperatingPanel({
  todoItems,
  notices,
  projects,
  clients,
  approvalProjects,
  demoTasks,
  codexResult,
  snsPosts,
  onOpenProjects,
  onOpenTasks,
  onOpenSales
}: {
  todoItems: string[];
  notices: string[];
  projects: Project[];
  clients: Client[];
  approvalProjects: Project[];
  demoTasks: WorkTask[];
  codexResult?: CodexResult;
  snsPosts: SnsPostTask[];
  onOpenProjects: () => void;
  onOpenTasks: () => void;
  onOpenSales: () => void;
}) {
  const activeProjects = projects.filter((project) => !["完了", "失注", "解約"].includes(project.status)).slice(0, 3);
  const waitingSns = snsPosts.filter((post) => post.materialStatus === "未受領" || post.status === "確認待ち");
  const pendingDemoTasks = demoTasks.filter((task) => task.status !== "done").slice(0, 3);
  const recentClients = clients.slice(0, 2);

  return (
    <div className="grid gap-5">
      <div className="grid items-stretch gap-5 xl:grid-cols-[1.05fr_1fr_0.8fr]">
        <HomeCard>
          <HomeCardHeader
            eyebrow="Today"
            title="今日やること"
            badge={<span className="rounded-full bg-mogcia-light px-3 py-1 text-xs text-mogcia-blush">{todoItems.length}</span>}
          />
          <div className="mt-4 grid gap-3 pb-5">
            {(todoItems.length > 0 ? todoItems : ["新しい対応はありません"]).slice(0, 6).map((item) => (
              <div key={item} className="grid grid-cols-[18px_1fr_auto] items-center gap-3">
                <span className="h-4 w-4 rounded border border-neutral-300 bg-white" />
                <span className="truncate text-sm text-neutral-800">{item}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-500">営業</span>
              </div>
            ))}
          </div>
          <HomeCardFooterButton onClick={onOpenProjects}>すべて見る →</HomeCardFooterButton>
        </HomeCard>

        <HomeCard>
          <HomeCardHeader eyebrow="AI updates" title="AIエージェントからのお知らせ" />
          <div className="mt-4 grid gap-3 pb-5">
            {notices.map((notice) => (
              <div key={notice} className="grid grid-cols-[32px_1fr_auto] items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-mogcia-icon text-xs font-semibold text-neutral-800">M</div>
                <p className="line-clamp-2 text-sm leading-5 text-neutral-700">{notice}</p>
                <span className="text-xs text-neutral-400">今</span>
              </div>
            ))}
          </div>
          <HomeCardFooterButton onClick={onOpenTasks}>すべて見る →</HomeCardFooterButton>
        </HomeCard>

        <HomeCard>
          <HomeCardHeader eyebrow="Schedule" title="今日の予定" />
          <div className="mt-4 grid gap-4 pb-5">
            {activeProjects.slice(0, 2).map((project, index) => {
              const client = clients.find((item) => item.id === project.clientId);
              return (
                <div key={project.id} className="grid grid-cols-[52px_1fr] gap-3">
                  <p className="text-sm font-semibold text-neutral-800">{index === 0 ? "16:00" : "18:00"}</p>
                  <div className="border-l border-line pl-4">
                    <p className="text-sm font-semibold">{client?.name ?? project.clientId}</p>
                    <p className="mt-1 text-xs text-neutral-500">{project.name}</p>
                  </div>
                </div>
              );
            })}
            {activeProjects.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500">今日の予定はありません。</p> : null}
          </div>
          <HomeCardFooterButton onClick={onOpenSales}>予定を見る →</HomeCardFooterButton>
        </HomeCard>
      </div>

      <div className="grid items-stretch gap-5 xl:grid-cols-[1.2fr_0.85fr]">
        <HomeCard className="min-h-[280px]">
          <HomeCardHeader eyebrow="Projects" title="進行中の案件" />
          <div className="mt-4 grid gap-4 pb-5">
            {activeProjects.map((project) => {
              const client = clients.find((item) => item.id === project.clientId);
              const progress = project.status.includes("要件") ? 72 : project.status.includes("デモ") ? 45 : 30;
              return (
                <div key={project.id} className="grid gap-3 md:grid-cols-[1fr_60px_170px_130px_20px] md:items-center">
                  <div>
                    <p className="font-semibold text-neutral-800">{project.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">{client?.name ?? project.clientId}</p>
                  </div>
                  <span className="text-sm font-semibold">{progress}%</span>
                  <div className="h-2 overflow-hidden rounded-full bg-mogcia-light">
                    <div className="h-full rounded-full bg-mogcia-primary-dark" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs leading-5 text-neutral-500">担当: {project.status.includes("要件") ? "Claude" : "Codex"}</p>
                  <span className="text-neutral-400">›</span>
                </div>
              );
            })}
          </div>
          <HomeCardFooterButton onClick={onOpenProjects}>すべての案件を見る →</HomeCardFooterButton>
        </HomeCard>

        <HomeCard className="min-h-[280px]">
          <HomeCardHeader eyebrow="Agents" title="AIエージェントの稼働状況" />
          <div className="mt-4 grid gap-3">
            {["MOGCIA Agent", "Codex", "Claude", "OpenAI", "Gemini"].map((agent) => (
              <div key={agent} className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-mogcia-icon text-[10px] font-bold text-neutral-800">{agent.slice(0, 1)}</div>
                <p className="text-sm font-medium">{agent}</p>
                <span className={`rounded-full px-3 py-1 text-xs ${agent === "Codex" ? "bg-sky-100 text-sky-700" : agent === "OpenAI" ? "bg-neutral-100 text-neutral-600" : "bg-emerald-100 text-emerald-700"}`}>
                  {agent === "Codex" ? "実行中" : agent === "OpenAI" ? "完了" : "待機中"}
                </span>
              </div>
            ))}
          </div>
        </HomeCard>

        <HomeCard className="min-h-[220px]">
          <HomeCardHeader
            title="未確認・重要事項"
            badge={<span className="rounded-full bg-mogcia-light px-3 py-1 text-xs text-mogcia-blush">{approvalProjects.length + pendingDemoTasks.length}</span>}
          />
          <div className="mt-4 grid gap-3">
            {[...approvalProjects.map((project) => `要件定義の承認待ち（${project.name}）`), ...pendingDemoTasks.map((task) => task.title)].slice(0, 4).map((item) => (
              <p key={item} className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{item}</p>
            ))}
          </div>
        </HomeCard>

        <HomeCard className="min-h-[220px]">
          <HomeCardHeader title="最近更新された会社" />
          <div className="mt-4 grid gap-3 pb-5">
            {recentClients.map((client) => (
              <div key={client.id} className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-mogcia-icon" />
                <div>
                  <p className="text-sm font-semibold">{client.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">最終更新: 10分前</p>
                </div>
              </div>
            ))}
          </div>
          <HomeCardFooterButton onClick={onOpenSales}>すべての会社を見る →</HomeCardFooterButton>
        </HomeCard>
      </div>

      {codexResult ? <div className="hidden"><CheckStatusCard label="Build" status={codexResult.checks.build} /></div> : null}
    </div>
  );
}

function OperatingMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-neutral-800">{value}</p>
      <p className="mt-2 text-xs text-neutral-500">{note}</p>
    </div>
  );
}

function HomeFocusPanel({
  project,
  client,
  timelineEvents,
  salesTasks,
  codexResult
}: {
  project: Project;
  client: Client;
  timelineEvents: CompanyTimelineEvent[];
  salesTasks: SalesActionTask[];
  codexResult?: CodexResult;
}) {
  return (
    <div className="grid items-stretch gap-5 xl:grid-cols-2">
      <HomeCard className="min-h-[280px]">
        <HomeCardHeader eyebrow="Focus" title="今日のフォーカス" badge={<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{client.name}</span>} />
        <div className="mt-4 grid gap-4">
          <div className="rounded-2xl bg-mogcia-icon p-4">
            <p className="text-sm text-neutral-500">Active project</p>
            <h3 className="mt-1 text-xl font-semibold">{project.name}</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{project.nextAction}</p>
          </div>
          <RequirementList title="次にすること" items={salesTasks.slice(0, 4).map((task) => task.title)} compact />
          {codexResult ? <RequirementList title="Codex完了項目" items={codexResult.completedItems.slice(0, 4)} compact /> : null}
        </div>
      </HomeCard>

      <HomeCard className="min-h-[280px]">
        <HomeCardHeader eyebrow="Timeline" title="会社タイムライン" badge={<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{timelineEvents.length}件</span>} />
        <div className="mt-4 grid gap-3">
          {timelineEvents.slice(0, 5).map((event) => (
            <div key={event.id} className="rounded-2xl bg-neutral-50 px-4 py-3">
              <p className="text-xs text-neutral-500">{new Date(event.eventAt).toLocaleString("ja-JP")} / {event.kind}</p>
              <p className="mt-1 text-sm font-semibold">{event.title}</p>
              <p className="mt-1 text-sm leading-5 text-neutral-600">{event.summary}</p>
            </div>
          ))}
          {timelineEvents.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500">まだ会社タイムラインはありません。</p> : null}
        </div>
      </HomeCard>
    </div>
  );
}

function ProjectPipelinePanel({
  projects,
  clients,
  activeProjectId,
  codexResults,
  onSelectProject
}: {
  projects: Project[];
  clients: Client[];
  activeProjectId: string;
  codexResults: CodexResult[];
  onSelectProject: (projectId: string) => void;
}) {
  const stages = [
    { label: "要件", match: ["要件", "承認待ち", "要件確認中"] },
    { label: "実装", match: ["デモ作成中", "制作中", "承認済み"] },
    { label: "レビュー", match: ["確認待ち", "Demo確認待ち", "デモ確認中"] },
    { label: "Demo", match: ["デモ完成", "デモ案内待ち", "クライアント確認中"] },
    { label: "本番", match: ["本番化判断待ち", "契約待ち", "契約済み", "完了"] }
  ];

  return (
    <Panel title="案件ボード" action="Linear view">
      <div className="grid gap-3 lg:grid-cols-5">
        {stages.map((stage) => {
          const stageProjects = projects.filter((project) => stage.match.some((keyword) => project.status.includes(keyword))).slice(0, 5);
          return (
            <div key={stage.label} className="rounded-[18px] bg-neutral-50 p-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold text-neutral-700">{stage.label}</p>
                <span className="rounded-full bg-white px-2 py-1 text-xs text-neutral-500">{stageProjects.length}</span>
              </div>
              <div className="mt-3 grid gap-2">
                {stageProjects.map((project) => {
                  const client = clients.find((item) => item.id === project.clientId);
                  const latestResult = codexResults.find((result) => result.projectId === project.id);
                  return (
                    <button
                      key={project.id}
                      className={`rounded-2xl border p-3 text-left transition ${project.id === activeProjectId ? "border-mogcia-primary-dark bg-mogcia-icon" : "border-line bg-white hover:border-mogcia-primary"}`}
                      onClick={() => onSelectProject(project.id)}
                      type="button"
                    >
                      <p className="text-xs text-neutral-500">{client?.name ?? project.clientId}</p>
                      <p className="mt-1 text-sm font-semibold leading-5">{project.name}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600">{project.status}</span>
                        {latestResult ? <span className="rounded-full bg-mogcia-light px-2 py-1 text-[11px] text-neutral-700">Codex {latestResult.checks.build}</span> : null}
                      </div>
                    </button>
                  );
                })}
                {stageProjects.length === 0 ? <p className="rounded-2xl bg-white px-3 py-4 text-center text-xs text-neutral-400">なし</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SalesCommandCenterPanel({
  clients,
  activeClient,
  projects,
  contacts,
  salesTasks,
  timelineEvents,
  meetings,
  activities,
  onSelectClient
}: {
  clients: Client[];
  activeClient: Client;
  projects: Project[];
  contacts: CompanyContact[];
  salesTasks: SalesActionTask[];
  timelineEvents: CompanyTimelineEvent[];
  meetings: MeetingRecord[];
  activities: SalesActivity[];
  onSelectClient: (clientId: string) => void;
}) {
  const activeClientProjects = projects.filter((project) => project.clientId === activeClient.id);
  const activeProjects = projects.filter((project) => !["完了", "失注", "解約"].includes(project.status));
  const overdueTasks = salesTasks.filter((task) => task.due && taskDueWeight(task.due) <= 0);
  const recentClients = clients.slice(0, 8);
  const latestProject = activeClientProjects[0];

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard label="対応中の会社" value={`${clients.length}社`} note="営業・既存顧客" />
        <SalesMetricCard label="進行中案件" value={`${activeProjects.length}件`} note="開発 / SNS / 運用" />
        <SalesMetricCard label="次回アクション" value={`${salesTasks.length}件`} note={overdueTasks.length > 0 ? `期限注意 ${overdueTasks.length}件` : "未完了タスク"} tone={overdueTasks.length > 0 ? "alert" : "default"} />
        <SalesMetricCard label="商談履歴" value={`${meetings.length + activities.length}件`} note="会議・電話・訪問" />
      </section>

      <section className="grid min-h-[620px] gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <HomeCard className="min-h-0">
          <HomeCardHeader eyebrow="Companies" title="会社一覧" badge={<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{clients.length}社</span>} />
          <div className="mt-4 grid gap-2">
            {recentClients.map((client) => {
              const selected = client.id === activeClient.id;
              const clientProjects = projects.filter((project) => project.clientId === client.id);
              return (
                <button
                  key={client.id}
                  className={`rounded-[18px] border px-4 py-4 text-left transition ${
                    selected ? "border-mogcia-primary-dark bg-neutral-900 text-white shadow-[0_16px_44px_rgba(31,31,34,0.16)]" : "border-line bg-white hover:border-mogcia-primary hover:bg-mogcia-icon"
                  }`}
                  onClick={() => onSelectClient(client.id)}
                  type="button"
                >
                  <span className="block truncate text-sm font-semibold">{client.name}</span>
                  <span className={`mt-1 block truncate text-xs ${selected ? "text-white/60" : "text-neutral-500"}`}>{client.industry} / {client.contactName}</span>
                  <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] ${selected ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-500"}`}>{clientProjects.length}案件</span>
                </button>
              );
            })}
          </div>
        </HomeCard>

        <div className="grid gap-5">
          <HomeCard>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-mogcia-blush">{activeClient.industry}</p>
                <h2 className="mt-2 text-3xl font-semibold text-neutral-950">{activeClient.name}</h2>
                <p className="mt-2 text-sm text-neutral-500">担当者: {activeClient.contactName}</p>
              </div>
              <span className="rounded-full bg-mogcia-light px-4 py-2 text-sm font-semibold text-mogcia-blush">{activeClient.companyType ?? "CRM"}</span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <DetailMetric label="担当者" value={`${contacts.length}名`} />
              <DetailMetric label="案件" value={`${activeClientProjects.length}件`} />
              <DetailMetric label="次回" value={`${salesTasks.length}件`} />
              <DetailMetric label="履歴" value={`${timelineEvents.length}件`} />
            </div>

            <div className="mt-5 rounded-[18px] border border-mogcia-light bg-mogcia-icon p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mogcia-blush">Current focus</p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-950">{latestProject?.name ?? "案件未登録"}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{latestProject?.nextAction ?? "Homeから案件・議事録を登録すると、ここに次の対応が表示されます。"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(latestProject?.services ?? activeClient.services ?? []).slice(0, 5).map((service) => (
                  <span key={service} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600">{service}</span>
                ))}
              </div>
            </div>
          </HomeCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <HomeCard className="min-h-[260px]">
              <HomeCardHeader eyebrow="Projects" title="案件" />
              <div className="mt-4 grid gap-3">
                {activeClientProjects.slice(0, 4).map((project) => (
                  <div key={project.id} className="rounded-[18px] border border-line bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{project.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">{project.nextAction}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-mogcia-light px-2.5 py-1 text-[11px] font-semibold text-mogcia-blush">{project.status}</span>
                    </div>
                  </div>
                ))}
                {activeClientProjects.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">案件はまだありません。</p> : null}
              </div>
            </HomeCard>

            <HomeCard className="min-h-[260px]">
              <HomeCardHeader eyebrow="Meetings" title="商談・活動" />
              <div className="mt-4 grid gap-3">
                {meetings.slice(0, 3).map((meeting) => (
                  <div key={meeting.id} className="rounded-[18px] bg-neutral-50 px-4 py-4">
                    <p className="text-sm font-semibold text-neutral-900">{meeting.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">{new Date(meeting.startedAt).toLocaleString("ja-JP")} / {meeting.status}</p>
                  </div>
                ))}
                {meetings.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">商談メモはまだありません。</p> : null}
              </div>
            </HomeCard>
          </div>
        </div>

        <div className="grid gap-5">
          <HomeCard className="min-h-[290px]">
            <HomeCardHeader eyebrow="Next actions" title="次にすること" badge={<span className="rounded-full bg-mogcia-light px-3 py-1 text-xs text-mogcia-blush">{salesTasks.length}</span>} />
            <div className="mt-4 grid gap-3">
              {salesTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="rounded-[18px] border border-line bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-neutral-900">{task.title}</p>
                  <p className="mt-2 text-xs text-neutral-500">担当: {task.assignee} / 期限: {task.due || "未設定"}</p>
                  <span className="mt-3 inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500">{task.importance}</span>
                </div>
              ))}
              {salesTasks.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">未完了アクションはありません。</p> : null}
            </div>
          </HomeCard>

          <HomeCard className="min-h-[290px]">
            <HomeCardHeader eyebrow="Timeline" title="会社タイムライン" badge={<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{timelineEvents.length}件</span>} />
            <div className="mt-4 grid gap-3">
              {timelineEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="border-l border-mogcia-primary pl-4">
                  <p className="text-xs text-neutral-500">{new Date(event.eventAt).toLocaleString("ja-JP")} / {event.kind}</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">{event.title}</p>
                  <p className="mt-1 line-clamp-3 text-sm leading-6 text-neutral-600">{event.summary}</p>
                </div>
              ))}
              {timelineEvents.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">タイムラインはまだありません。</p> : null}
            </div>
          </HomeCard>
        </div>
      </section>
    </div>
  );
}

function SalesMetricCard({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "alert" }) {
  return (
    <div className="rounded-[20px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
      <p className="text-sm font-medium text-neutral-600">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-neutral-950">{value}</p>
      <p className={`mt-3 text-xs ${tone === "alert" ? "font-semibold text-rose-500" : "text-neutral-500"}`}>{note}</p>
    </div>
  );
}

function SalesTopWorkspace({
  analyses,
  clients,
  confirmationCount,
  duplicateGroups,
  filter,
  isAdmin,
  meetings,
  onCreateCompany,
  onFilterChange,
  onOpenClient,
  onSearchChange,
  overdueCount,
  search,
  tasks,
  todayMeetingCount,
  todayTaskCount
}: {
  analyses: MeetingAnalysis[];
  clients: Client[];
  confirmationCount: number;
  duplicateGroups: Client[][];
  filter: string;
  isAdmin: boolean;
  meetings: MeetingRecord[];
  onCreateCompany: () => void;
  onFilterChange: (value: string) => void;
  onOpenClient: (clientId: string) => void;
  onSearchChange: (value: string) => void;
  overdueCount: number;
  search: string;
  tasks: SalesActionTask[];
  todayMeetingCount: number;
  todayTaskCount: number;
}) {
  const filteredClients = filter === "today"
    ? clients.filter((client) => tasks.some((task) => task.clientId === client.id && isTodayDue(task.due)))
    : filter === "overdue"
      ? clients.filter((client) => tasks.some((task) => task.clientId === client.id && isOverdueDue(task.due)))
      : clients;

  return (
    <div className="grid gap-8">
      <section className="rounded-[22px] border border-line bg-white p-6 shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mogcia-blush">Sales</p>
            <h2 className="mt-2 text-3xl font-semibold text-neutral-950">営業管理</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">会社、商談状況、次回アクションを一覧で確認します。</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[260px_160px_auto]">
            <input className="h-11 rounded-2xl border border-line bg-white px-4 text-sm outline-none focus:border-mogcia-primary-dark" onChange={(event) => onSearchChange(event.target.value)} placeholder="会社検索..." value={search} />
            <select className="h-11 rounded-2xl border border-line bg-white px-4 text-sm outline-none focus:border-mogcia-primary-dark" onChange={(event) => onFilterChange(event.target.value)} value={filter}>
              <option value="all">すべて</option>
              <option value="today">今日対応</option>
              <option value="overdue">期限超過</option>
            </select>
            <button className="h-11 rounded-2xl bg-mogcia-primary px-5 text-sm font-semibold text-neutral-950 hover:bg-mogcia-primary-dark" onClick={onCreateCompany} type="button">＋新規</button>
          </div>
        </div>
      </section>

      {isAdmin && duplicateGroups.length > 0 ? <DuplicateClientWarning groups={duplicateGroups} /> : null}

      <SalesCompanyList analyses={analyses} clients={filteredClients} meetings={meetings} onCreateCompany={onCreateCompany} onOpenClient={onOpenClient} search={search} tasks={tasks} />
    </div>
  );
}

function CompanyDetailWorkspace({
  activeClient,
  activeProject,
  analyses,
  assets,
  contacts,
  latestAnalysis,
  latestMeeting,
  meetings,
  onAdd,
  onAddMeeting,
  projects,
  snsPlans,
  tasks,
  timelineEvents
}: {
  activeClient: Client;
  activeProject: Project;
  analyses: MeetingAnalysis[];
  assets: MeetingAsset[];
  contacts: CompanyContact[];
  latestAnalysis?: MeetingAnalysis;
  latestMeeting?: MeetingRecord;
  meetings: MeetingRecord[];
  onAdd: () => void;
  onAddMeeting: () => void;
  projects: Project[];
  snsPlans: SnsOperationPlan[];
  tasks: SalesActionTask[];
  timelineEvents: CompanyTimelineEvent[];
}) {
  return (
    <div className="grid gap-5">
      <CompanyHeader client={activeClient} latestMeeting={latestMeeting} nextTask={tasks.find((task) => task.status !== "done")} onAdd={onAdd} />
      <NextActionList onAdd={onAdd} tasks={tasks} />
      <LastMeetingSummary analysis={latestAnalysis} meeting={latestMeeting} onAdd={onAddMeeting} />
      <CompanyTimeline events={timelineEvents} onAdd={onAdd} />
      <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mogcia-blush">Related</p>
            <h3 className="mt-1 text-xl font-semibold text-neutral-950">関連情報</h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{activeProject.name}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <RelatedInfoCard label="関連案件" value={`${projects.length}件`} note={projects[0]?.status ?? "未登録"} />
          <RelatedInfoCard label="Demo" value={projects.some((project) => project.demoUrl) ? "あり" : "未登録"} note="詳細は案件へ" />
          <RelatedInfoCard label="SNS運用" value={`${snsPlans.length}件`} note={snsPlans[0]?.month ?? "未登録"} />
          <RelatedInfoCard label="添付ファイル" value={`${assets.length}件`} note="Storage" />
          <RelatedInfoCard label="担当者" value={`${contacts.length}名`} note={contacts[0]?.name ?? "未登録"} />
        </div>
        <p className="mt-4 text-xs text-neutral-400">商談詳細: {meetings.length}件 / 解析: {analyses.length}件。詳細な操作は商談・会議画面で行います。</p>
      </section>
    </div>
  );
}

function RelatedInfoCard({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-neutral-50 px-4 py-4">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-neutral-950">{value}</p>
      <p className="mt-1 truncate text-xs text-neutral-500">{note}</p>
    </div>
  );
}

function DuplicateClientWarning({ groups }: { groups: Client[][] }) {
  return (
    <section className="rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-sm font-semibold text-amber-900">重複会社候補があります</p>
      <div className="mt-3 grid gap-2 text-sm text-amber-800">
        {groups.slice(0, 3).map((group) => (
          <p key={group.map((client) => client.id).join("-")}>
            {group[0]?.name}: {group.map((client) => client.id).join(" / ")}
          </p>
        ))}
      </div>
      <p className="mt-2 text-xs text-amber-700">自動統合はしません。関連案件、商談、タスク、タイムラインの移行確認が必要です。</p>
    </section>
  );
}

function SalesWorkspacePanel({
  clients,
  activeClient,
  projects,
  contacts,
  salesTasks,
  timelineEvents,
  onSelectClient
}: {
  clients: Client[];
  activeClient: Client;
  projects: Project[];
  contacts: CompanyContact[];
  salesTasks: SalesActionTask[];
  timelineEvents: CompanyTimelineEvent[];
  onSelectClient: (clientId: string) => void;
}) {
  return (
    <Panel title="営業ホーム" action="CRM">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="rounded-[18px] bg-neutral-50 p-3">
          <p className="px-2 text-sm font-semibold text-neutral-700">会社一覧</p>
          <div className="mt-3 grid gap-2">
            {clients.map((client) => (
              <button
                key={client.id}
                className={`rounded-2xl px-3 py-3 text-left transition ${client.id === activeClient.id ? "bg-neutral-800 text-white" : "bg-white hover:bg-mogcia-surface"}`}
                onClick={() => onSelectClient(client.id)}
                type="button"
              >
                <span className="block text-sm font-semibold">{client.name}</span>
                <span className={`mt-1 block text-xs ${client.id === activeClient.id ? "text-white/60" : "text-neutral-500"}`}>{client.industry} / {client.contactName}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[18px] border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-500">{activeClient.industry}</p>
                <h3 className="mt-1 text-2xl font-semibold">{activeClient.name}</h3>
                <p className="mt-2 text-sm text-neutral-600">担当: {activeClient.contactName}</p>
              </div>
              <span className="rounded-full bg-mogcia-light px-3 py-1 text-sm text-neutral-700">{activeClient.companyType ?? "商談管理"}</span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <DetailMetric label="担当者" value={`${contacts.length}名`} />
              <DetailMetric label="次回アクション" value={`${salesTasks.length}件`} />
              <DetailMetric label="案件" value={`${projects.length}件`} />
              <DetailMetric label="履歴" value={`${timelineEvents.length}件`} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[18px] border border-line bg-white p-5">
              <p className="font-semibold">次回アクション</p>
              <div className="mt-3 grid gap-2">
                {salesTasks.slice(0, 5).map((task) => (
                  <p key={task.id} className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{task.title}</p>
                ))}
                {salesTasks.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500">未完了アクションはありません。</p> : null}
              </div>
            </div>
            <div className="rounded-[18px] border border-line bg-white p-5">
              <p className="font-semibold">会社タイムライン</p>
              <div className="mt-3 grid gap-2">
                {timelineEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded-2xl bg-neutral-50 px-4 py-3">
                    <p className="text-xs text-neutral-500">{event.kind}</p>
                    <p className="mt-1 text-sm font-semibold">{event.title}</p>
                  </div>
                ))}
                {timelineEvents.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500">履歴はまだありません。</p> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function GuidedWorkflowPanel({
  project,
  minutes,
  drafts,
  demoTasks,
  latestCodexResult,
  isIshida,
  busy,
  onCreateTestProject,
  onGenerateRequirements,
  onApproveProject,
  onOpenTasks
}: {
  project: Project;
  minutes: MinutesRecord[];
  drafts: RequirementDraft[];
  demoTasks: WorkTask[];
  latestCodexResult?: CodexResult;
  isIshida: boolean;
  busy: boolean;
  onCreateTestProject: () => Promise<void>;
  onGenerateRequirements: () => Promise<void>;
  onApproveProject: () => Promise<void>;
  onOpenTasks: () => void;
}) {
  const hasMinutes = minutes.length > 0;
  const hasDraft = drafts.length > 0;
  const approvalDone = project.approvalStatus === "approved" || project.approvalStatus === "not-required";
  const hasDemoTasks = demoTasks.length > 0;
  const hasCodexResult = Boolean(latestCodexResult);
  const currentStep = !hasMinutes ? 1 : !hasDraft ? 2 : !approvalDone ? 3 : !hasDemoTasks ? 4 : !hasCodexResult ? 5 : 6;
  const steps = [
    { id: 1, label: "案件・議事録", done: hasMinutes },
    { id: 2, label: "要件定義", done: hasDraft },
    { id: 3, label: "石田承認", done: approvalDone },
    { id: 4, label: "Demoタスク", done: hasDemoTasks },
    { id: 5, label: "Codex進捗", done: hasCodexResult }
  ];

  return (
    <Panel title="まずここから" action={`Step ${Math.min(currentStep, 5)} / 5`}>
      <div className="grid gap-4">
        <div className="rounded-lg border border-mogcia-light bg-mogcia-icon p-4">
          <p className="text-sm font-semibold text-mogcia-blush">本番URLでの通しテスト</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">{project.name}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            ゴルフ場の公式LINEミニページを、議事録登録からCodex進捗連携まで流すためのショートカットです。
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((step) => (
            <div key={step.id} className={`rounded-md border px-3 py-3 ${step.done ? "border-mogcia-primary bg-mogcia-light" : currentStep === step.id ? "border-ink bg-white" : "border-line bg-neutral-50"}`}>
              <p className="text-xs text-neutral-500">Step {step.id}</p>
              <p className="mt-1 text-sm font-semibold">{step.done ? "完了" : currentStep === step.id ? "次にやる" : "待機"}</p>
              <p className="mt-1 text-xs text-neutral-600">{step.label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <button className="rounded-md bg-ink px-3 py-3 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void onCreateTestProject()} type="button">
            テスト案件を作る
          </button>
          <button className="rounded-md bg-mogcia-primary px-3 py-3 text-sm text-ink disabled:opacity-50" disabled={!hasMinutes || busy} onClick={() => void onGenerateRequirements()} type="button">
            要件定義生成
          </button>
          <button className="rounded-md bg-mogcia-primary px-3 py-3 text-sm text-ink disabled:opacity-50" disabled={!hasDraft || approvalDone || !isIshida || busy} onClick={() => void onApproveProject()} type="button">
            石田承認
          </button>
          <button className="rounded-md border border-line bg-white px-3 py-3 text-sm text-ink hover:bg-neutral-50" onClick={onOpenTasks} type="button">
            Tasksへ進む
          </button>
        </div>

        <div className="rounded-md bg-neutral-50 px-3 py-3 text-sm leading-6 text-neutral-600">
          {currentStep === 1 ? "まず「テスト案件を作る」を押すと、ゴルフ場の案件と議事録が自動登録されます。" : null}
          {currentStep === 2 ? "次は「要件定義生成」。登録済み議事録からClaudeまたはfallbackで要件定義を作ります。" : null}
          {currentStep === 3 ? "次は「石田承認」。承認後にDemo生成タスクが作られます。" : null}
          {currentStep === 4 ? "承認済みです。Demo生成タスクが表示されるまで少し待つか、要件定義カードからDemoタスク生成を確認してください。" : null}
          {currentStep === 5 ? "次はTasksページの「Codex進捗連携」にResult JSONを入れて、Typecheck/Lint/Buildと完了項目を反映します。" : null}
          {currentStep === 6 ? "通しテストの主要導線は完了しています。残りは実案件の入力で同じ流れを確認します。" : null}
        </div>
      </div>
    </Panel>
  );
}

function WebsiteAnalysisPanel({ analyses, onCreate }: { analyses: WebsiteAnalysis[]; onCreate: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const latest = analyses[0];

  const submit = async () => {
    if (!isPreviewUrl(url.trim())) return;
    await onCreate(url.trim());
    setUrl("");
  };

  return (
    <Panel title="Website Analysis" action={`${analyses.length}件`}>
      <div className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-[1fr_90px]">
          <input className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink" onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" value={url} />
          <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!isPreviewUrl(url.trim())} onClick={submit} type="button">
            分析
          </button>
        </div>
        {latest ? (
          <div className="rounded-lg border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{latest.url}</p>
              <span className="rounded-md bg-mogcia-light px-2 py-1 text-sm font-semibold">{latest.score}</span>
            </div>
            <RequirementList title="改善提案" items={latest.improvements.slice(0, 3)} compact />
            <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">{latest.demoSuggestion}</p>
          </div>
        ) : (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">URLを入力すると、Lighthouse前段の改善仮説とDemo提案を作成します。</p>
        )}
      </div>
    </Panel>
  );
}

function OpenAiReviewPanel({ reviews, onCreate }: { reviews: OpenAiReview[]; onCreate: (input: { title: string; input: string }) => Promise<void> }) {
  const [title, setTitle] = useState("UIレビュー");
  const [input, setInput] = useState("");
  const latest = reviews[0];

  const submit = async () => {
    if (!input.trim()) return;
    await onCreate({ title, input });
    setInput("");
  };

  return (
    <Panel title="OpenAI Review" action={`${reviews.length}件`}>
      <div className="grid gap-3">
        <Field label="レビュー名" value={title} onChange={setTitle} placeholder="UIレビュー" />
        <DraftTextArea label="レビュー対象" value={input} onChange={setInput} rows={5} />
        <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!input.trim()} onClick={submit} type="button">
          OpenAIでレビュー
        </button>
        {latest ? (
          <div className="rounded-lg border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{latest.title}</p>
              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs">{latest.generatedBy}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{latest.summary}</p>
            <RequirementList title="改善提案" items={latest.improvements.slice(0, 3)} compact />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CodexCliPanel({ runs, onCreate }: { runs: CodexCliRun[]; onCreate: (input: { taskTitle: string; taskBody: string }) => Promise<void> }) {
  const [taskTitle, setTaskTitle] = useState("ローカルDemo改善タスク");
  const [taskBody, setTaskBody] = useState("選択中案件のローカルDemoを確認し、UI改善案と実装タスクを整理してください。");
  const latest = runs[0];

  return (
    <Panel title="Codex CLI連携" action={`${runs.length}件`}>
      <div className="grid gap-3">
        <Field label="タスク名" value={taskTitle} onChange={setTaskTitle} placeholder="ローカルDemo改善タスク" />
        <DraftTextArea label="タスク内容" value={taskBody} onChange={setTaskBody} rows={4} />
        <button className="rounded-md bg-ink px-3 py-2 text-sm text-white" onClick={() => onCreate({ taskTitle, taskBody })} type="button">
          Codexタスク作成
        </button>
        {latest ? (
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">{latest.taskTitle}</p>
            <p className="mt-2 text-sm text-neutral-500">{latest.status}</p>
            <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{latest.output}</p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CodexProgressPanel({
  progress,
  runs,
  results,
  progressItems,
  latestResult,
  onImport
}: {
  progress: number;
  runs: CodexRun[];
  results: CodexResult[];
  progressItems: DevelopmentProgressItem[];
  latestResult?: CodexResult;
  onImport: (input: { title: string; jsonText: string; resultPath?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("Codex実行結果");
  const [jsonText, setJsonText] = useState("");
  const [resultPath, setResultPath] = useState(".mogcia/codex-results/latest.json");
  const completedItems = progressItems.filter((item) => item.status === "completed");
  const remainingItems = progressItems.filter((item) => item.status === "remaining");

  const submit = async () => {
    if (!jsonText.trim()) return;
    await onImport({ title, jsonText, resultPath });
    setJsonText("");
  };

  return (
    <Panel title="Codex進捗連携" action={`${progress}%`}>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <DetailMetric label="進行率" value={`${progress}%`} />
          <DetailMetric label="最新Codex実行" value={runs[0]?.status ?? "未取込"} />
          <DetailMetric label="変更ファイル数" value={`${latestResult?.changedFiles.length ?? 0}`} />
          <DetailMetric label="残タスク" value={`${remainingItems.length}`} />
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-mogcia-primary-dark transition-all" style={{ width: `${progress}%` }} />
        </div>

        {latestResult ? (
          <div className="rounded-lg border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-500">最新Result</p>
                <p className="mt-1 font-semibold">{latestResult.summary}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs ${latestResult.status === "completed" ? "bg-mogcia-light text-ink" : "bg-rose-100 text-rose-700"}`}>
                {latestResult.status}
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <CheckStatusCard label="Typecheck" status={latestResult.checks.typecheck} />
              <CheckStatusCard label="Lint" status={latestResult.checks.lint} />
              <CheckStatusCard label="Build" status={latestResult.checks.build} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <RequirementList title="完了項目" items={latestResult.completedItems.slice(0, 8)} compact />
              <RequirementList title="残タスク" items={latestResult.remainingItems.slice(0, 8)} compact />
            </div>
            <ChangedFilesList files={latestResult.changedFiles} />
            {latestResult.warnings.length > 0 ? <RequirementList title="Warnings" items={latestResult.warnings.slice(0, 5)} compact /> : null}
            {latestResult.errors.length > 0 ? <RequirementList title="Errors" items={latestResult.errors.slice(0, 5)} compact /> : null}
          </div>
        ) : (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">Codex結果JSONを取り込むと、進捗、Checks、変更ファイル、開発タイムラインが自動更新されます。</p>
        )}

        <div className="rounded-lg border border-line bg-mogcia-surface p-4">
          <p className="font-semibold">Codex Result JSON取込</p>
          <p className="mt-1 text-sm text-neutral-500">今は貼り付け/ファイル選択で取り込みます。フォルダ監視やCodex API化しても同じJSON契約を使います。</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Run名" value={title} onChange={setTitle} placeholder="顧客管理実装" />
            <Field label="想定Result Path" value={resultPath} onChange={setResultPath} placeholder=".mogcia/codex-results/latest.json" />
          </div>
          <div className="mt-3 grid gap-3">
            <input
              className="rounded-md border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setJsonText(String(reader.result ?? ""));
                reader.readAsText(file);
                event.currentTarget.value = "";
              }}
              type="file"
              accept="application/json,.json"
            />
            <DraftTextArea label="JSON貼り付け" value={jsonText} onChange={setJsonText} rows={8} />
            <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!jsonText.trim()} onClick={submit} type="button">
              Codex結果を取り込む
            </button>
          </div>
        </div>

        {results.length > 1 ? (
          <div className="grid gap-2">
            {results.slice(1, 5).map((result) => (
              <div key={result.id} className="rounded-md bg-neutral-50 px-3 py-2 text-sm">
                <span className="font-medium">{result.summary}</span>
                <span className="ml-2 text-xs text-neutral-500">{new Date(result.importedAt).toLocaleString("ja-JP")}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CheckStatusCard({ label, status }: { label: string; status: CodexResult["checks"]["typecheck"] }) {
  const tone = status === "passed" ? "bg-mogcia-light text-ink" : status === "failed" ? "bg-rose-100 text-rose-700" : "bg-neutral-100 text-neutral-500";
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-2 inline-flex rounded-md px-2 py-1 text-sm font-semibold ${tone}`}>{status}</p>
    </div>
  );
}

function ChangedFilesList({ files }: { files: string[] }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-neutral-700">Changed Files</p>
      <div className="mt-2 grid gap-2">
        {files.slice(0, 10).map((file) => (
          <a key={file} className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700 hover:bg-mogcia-light" href={`/${file.replace(/^\/+/, "")}`}>
            {file}
          </a>
        ))}
      </div>
    </div>
  );
}

function StorageAssetsPanel({
  assets,
  canUpload,
  onUpload
}: {
  assets: StorageAsset[];
  canUpload: boolean;
  onUpload: (input: { file: File; kind: StorageAsset["kind"] }) => Promise<void>;
}) {
  const [kind, setKind] = useState<StorageAsset["kind"]>("placeholder");

  return (
    <Panel title="Firebase Storage" action={`${assets.length}件`}>
      <div className="grid gap-3">
        <SelectField
          label="種別"
          value={kind}
          onChange={(value) => setKind(value as StorageAsset["kind"])}
          options={[
            ["placeholder", "Placeholder"],
            ["attachment", "Attachment"],
            ["report", "Report"]
          ]}
        />
        <input
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
          disabled={!canUpload}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload({ file, kind });
            event.currentTarget.value = "";
          }}
          type="file"
        />
        {assets.slice(0, 4).map((asset) => (
          <a key={asset.id} className="rounded-lg border border-line bg-white p-3 text-sm hover:bg-neutral-50" href={asset.url} rel="noreferrer" target="_blank">
            <span className="font-medium">{asset.name}</span>
            <span className="mt-1 block text-xs text-neutral-500">{asset.kind} / {Math.round(asset.size / 1024)}KB</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

function MonthlyReportPanel({
  reports,
  onCreate
}: {
  reports: MonthlyReport[];
  onCreate: (input: { title: string; period: string; sourceText: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("月次レポート");
  const [period, setPeriod] = useState(new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long" }));
  const [sourceText, setSourceText] = useState("");
  const latest = reports[0];

  const submit = async () => {
    await onCreate({ title, period, sourceText });
    setSourceText("");
  };

  return (
    <Panel title="自動レポート" action={`${reports.length}件`}>
      <div className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="タイトル" value={title} onChange={setTitle} placeholder="月次レポート" />
          <Field label="対象月" value={period} onChange={setPeriod} placeholder="2026年7月" />
        </div>
        <DraftTextArea label="分析元メモ" value={sourceText} onChange={setSourceText} rows={4} />
        <button className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800" onClick={submit} type="button">
          レポート生成
        </button>
        {latest ? (
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">{latest.title} / {latest.period}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{latest.summary}</p>
            <RequirementList title="来月やるべきこと" items={latest.nextActions} compact />
            <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">{latest.demoSuggestion}</p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ProjectStatusPanel({ project, canEdit, onChange }: { project: Project; canEdit: boolean; onChange: (status: WorkflowStage) => Promise<void> }) {
  return (
    <Panel title="案件ステータス管理" action={project.status}>
      <div className="grid gap-2 md:grid-cols-5">
        {workflowStages.map((stage) => (
          <button
            key={stage}
            className={`rounded-md border px-3 py-2 text-xs ${stage === project.status ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-600 hover:bg-neutral-50"}`}
            disabled={!canEdit || stage === project.status}
            onClick={() => onChange(stage)}
            type="button"
          >
            {stage}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function ClientTimelinePanel({
  client,
  projects,
  minutes,
  timelineEvents,
  demoRuns,
  guideDrafts,
  notifications,
  companyTimelineEvents
}: {
  client: Client;
  projects: Project[];
  minutes: MinutesRecord[];
  timelineEvents: TimelineEvent[];
  demoRuns: LocalDemoRun[];
  guideDrafts: DemoGuideDraft[];
  notifications: NotificationItem[];
  companyTimelineEvents: CompanyTimelineEvent[];
}) {
  const rows = [
    ...projects.map((project) => ({ id: `project-${project.id}`, date: "", kind: "project", title: project.name, body: project.nextAction })),
    ...companyTimelineEvents.map((item) => ({ id: item.id, date: item.eventAt, kind: item.kind, title: item.title, body: item.summary })),
    ...minutes.map((item) => ({ id: item.id, date: item.registeredAt, kind: "minutes", title: "議事録登録", body: item.content })),
    ...timelineEvents.map((item) => ({ id: item.id, date: item.date, kind: item.kind, title: item.title, body: item.summary })),
    ...demoRuns.map((item) => ({ id: item.id, date: item.generatedAt, kind: "demo", title: "ローカルDemo生成", body: item.demoUrl })),
    ...guideDrafts.map((item) => ({ id: item.id, date: item.generatedAt, kind: "mail", title: "デモ案内文下書き", body: item.subject })),
    ...notifications.map((item) => ({ id: item.id, date: item.createdAt, kind: item.kind, title: item.title, body: item.body }))
  ]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 12);

  return (
    <Panel title="顧客タイムライン" action={client.name}>
      <div className="space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.id} className="relative border-l border-line pl-4">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-mogcia-primary-dark" />
              <p className="text-xs text-neutral-400">{row.date || row.kind}</p>
              <p className="mt-1 font-medium">{row.title}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-600">{row.body}</p>
            </div>
          ))
        ) : (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">顧客タイムラインはまだありません。</p>
        )}
      </div>
    </Panel>
  );
}

function EmailTemplateEditor({ templates, canEdit, onSave }: { templates: EmailTemplate[]; canEdit: boolean; onSave: (template: EmailTemplate) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const [draft, setDraft] = useState<EmailTemplate | null>(selected ?? null);

  const selectTemplate = (template: EmailTemplate) => {
    setSelectedId(template.id);
    setDraft(template);
  };

  return (
    <Panel title="メールテンプレートCRUD" action={canEdit ? "編集可" : "閲覧のみ"}>
      {draft ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`rounded-md px-3 py-2 text-sm ${template.id === draft.id ? "bg-ink text-white" : "border border-line bg-white hover:bg-neutral-50"}`}
                onClick={() => selectTemplate(template)}
                type="button"
              >
                {template.name}
              </button>
            ))}
          </div>
          <Field label="名称" value={draft.name} onChange={(value) => setDraft((current) => (current ? { ...current, name: value } : current))} placeholder="デモ案内" />
          <Field label="件名" value={draft.subject} onChange={(value) => setDraft((current) => (current ? { ...current, subject: value } : current))} placeholder="件名" />
          <DraftTextArea label="本文" value={draft.body ?? ""} onChange={(value) => setDraft((current) => (current ? { ...current, body: value } : current))} rows={5} />
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">保存時に安全ルールを再判定し、初回・金額・請求・契約・本番・送付を含む文面は承認必須になります。</p>
          <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!canEdit} onClick={() => onSave(draft)} type="button">
            テンプレート保存
          </button>
        </div>
      ) : (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">テンプレートがありません。</p>
      )}
    </Panel>
  );
}

function NotificationPanel({
  notifications,
  onCreate
}: {
  notifications: NotificationItem[];
  onCreate: (input: { title: string; body: string; kind: NotificationItem["kind"] }) => Promise<void>;
}) {
  const [title, setTitle] = useState("確認依頼");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<NotificationItem["kind"]>("system");

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    await onCreate({ title: title.trim(), body: body.trim(), kind });
    setBody("");
  };

  return (
    <Panel title="通知" action={`${notifications.length}件`}>
      <div className="grid gap-3">
        <Field label="タイトル" value={title} onChange={setTitle} placeholder="確認依頼" />
        <SelectField
          label="種類"
          value={kind}
          onChange={(value) => setKind(value as NotificationItem["kind"])}
          options={[
            ["system", "System"],
            ["approval", "Approval"],
            ["demo", "Demo"],
            ["report", "Report"]
          ]}
        />
        <DraftTextArea label="本文" value={body} onChange={setBody} rows={3} />
        <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!title.trim() || !body.trim()} onClick={submit} type="button">
          通知作成
        </button>
        {notifications.slice(0, 3).map((notification) => (
          <div key={notification.id} className="rounded-lg border border-line bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{notification.title}</p>
              <SafetyBadge safety={notification.safety} />
            </div>
            <p className="mt-2 text-sm leading-5 text-neutral-600">{notification.body}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ProjectDetailPanel({
  project,
  client,
  minutes,
  drafts,
  demoTasks,
  productionTasks,
  guideDraft,
  demoRun,
  snsPlans,
  snsPosts,
  companyTimelineEvents,
  salesActionTasks,
  isGeneratingDemo,
  onGenerateLocalDemo,
  onSnsPlanCreate,
  onSnsPostUpdate,
  onSalesTaskUpdate
}: {
  project: Project;
  client: Client;
  minutes: MinutesRecord[];
  drafts: RequirementDraft[];
  demoTasks: WorkTask[];
  productionTasks: WorkTask[];
  guideDraft?: DemoGuideDraft;
  demoRun?: LocalDemoRun;
  snsPlans: SnsOperationPlan[];
  snsPosts: SnsPostTask[];
  companyTimelineEvents: CompanyTimelineEvent[];
  salesActionTasks: SalesActionTask[];
  isGeneratingDemo: boolean;
  onGenerateLocalDemo: () => Promise<void>;
  onSnsPlanCreate: (input: { month: string; contractPlan: string; platforms: SnsPlatform[]; monthlyPostCount: number; meetingMemo: string }) => Promise<void>;
  onSnsPostUpdate: (post: SnsPostTask) => Promise<void>;
  onSalesTaskUpdate: (task: SalesActionTask) => Promise<void>;
}) {
  const latestMinutes = minutes[0];
  const latestDraft = drafts[0];
  const doneDemoTasks = demoTasks.filter((task) => task.status === "done").length;
  const doneProductionTasks = productionTasks.filter((task) => task.status === "done").length;
  const demoProgress = demoTasks.length > 0 ? Math.round((doneDemoTasks / demoTasks.length) * 100) : 0;
  const productionProgress = productionTasks.length > 0 ? Math.round((doneProductionTasks / productionTasks.length) * 100) : 0;

  return (
    <Panel title="案件詳細" action={project.status}>
      <div className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <p className="text-sm text-neutral-500">{client.name} / {client.industry}</p>
            <h3 className="mt-1 text-2xl font-semibold">{project.name}</h3>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{project.nextAction}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.services.map((service) => (
                <span key={service} className="rounded-md border border-line bg-white px-3 py-1 text-sm">
                  {service}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-4">
            <p className="text-sm text-neutral-500">担当者</p>
            <p className="mt-1 font-semibold">{client.contactName}</p>
            <p className="mt-4 text-sm text-neutral-500">Mode</p>
            <p className="mt-1 font-semibold">{project.mode === "demo" ? "Demo" : "Production"}</p>
            {project.demoUrl ? (
              <a className="mt-4 inline-flex rounded-md bg-mogcia-primary px-3 py-2 text-sm font-medium text-ink hover:bg-mogcia-dark" href={project.demoUrl} rel="noreferrer" target="_blank">
                Previewを開く
              </a>
            ) : null}
            {demoRun ? (
              <a className="mt-2 inline-flex rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50" href={demoRun.demoUrl} rel="noreferrer" target="_blank">
                生成済みDemo
              </a>
            ) : null}
            <button className="mt-2 w-full rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50" disabled={isGeneratingDemo} onClick={onGenerateLocalDemo} type="button">
              {isGeneratingDemo ? "生成中" : demoRun ? "ローカルDemo再生成" : "ローカルDemo生成"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <DetailMetric label="議事録" value={`${minutes.length}件`} />
          <DetailMetric label="要件定義" value={latestDraft ? "生成済み" : "未生成"} />
          <DetailMetric label="Demo" value={`${doneDemoTasks}/${demoTasks.length}`} />
          <DetailMetric label="本番化" value={`${doneProductionTasks}/${productionTasks.length}`} />
        </div>

        <SalesNextActionPanel tasks={salesActionTasks} onUpdate={onSalesTaskUpdate} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">最新議事録</p>
            {latestMinutes ? (
              <>
                <p className="mt-1 text-xs text-neutral-400">{new Date(latestMinutes.registeredAt).toLocaleString("ja-JP")}</p>
                <p className="mt-3 line-clamp-6 text-sm leading-6 text-neutral-600">{latestMinutes.content}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">まだ議事録はありません。</p>
            )}
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <p className="font-semibold">要件定義サマリー</p>
            {latestDraft ? (
              <>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{latestDraft.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {latestDraft.screens.slice(0, 4).map((screen) => (
                    <span key={screen} className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{screen}</span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">議事録から要件定義を生成すると表示されます。</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TaskSummary title="Demo生成" tasks={demoTasks} progress={demoProgress} />
          <TaskSummary title="本番化" tasks={productionTasks} progress={productionProgress} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <RequirementHistoryPanel drafts={drafts} />
          <DemoSafetyPanel run={demoRun} />
        </div>

        <CompanyTimelineEventsPanel events={companyTimelineEvents} />

        {(project.kind ?? "development") === "sns-operation" ? (
          <SnsOperationPanel plans={snsPlans} posts={snsPosts} onCreatePlan={onSnsPlanCreate} onUpdatePost={onSnsPostUpdate} />
        ) : null}

        <div className="rounded-lg border border-line bg-white p-4">
          <p className="font-semibold">デモ案内文</p>
          {guideDraft ? (
            <div className="mt-3 grid gap-3">
              <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm font-medium">{guideDraft.subject}</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-50 px-3 py-3 text-sm leading-6 text-neutral-600">{guideDraft.body}</pre>
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">デモ案内準備タスクから下書きを生成すると表示されます。</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function CreateCompanyForm({
  currentUser,
  onSave
}: {
  currentUser: string;
  onSave: (client: Client) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [companyType, setCompanyType] = useState<NonNullable<Client["companyType"]>>("見込み客");
  const [contractStatus, setContractStatus] = useState<NonNullable<Client["contractStatus"]>>("未契約");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canSave = name.trim() && industry.trim();

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave({
        id: `client-${crypto.randomUUID()}`,
        name: name.trim(),
        industry: industry.trim(),
        companyType,
        contractStatus,
        contactName: contactName.trim() || "未登録",
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        salesOwner: currentUser,
        notes: notes.trim() || undefined,
        services: []
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel title="会社情報" action="Firestore保存">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="会社名" value={name} onChange={setName} placeholder="八女上陽ゴルフ倶楽部" />
        <Field label="業種" value={industry} onChange={setIndustry} placeholder="ゴルフ場 / ホテル / 美容室" />
        <Field label="主担当者" value={contactName} onChange={setContactName} placeholder="支配人 山田様" />
        <Field label="電話番号" value={phone} onChange={setPhone} placeholder="0943-..." />
        <Field label="メール" value={email} onChange={setEmail} placeholder="client@example.com" />
        <Field label="Webサイト" value={website} onChange={setWebsite} placeholder="https://..." />
        <SelectField
          label="営業ステータス"
          value={companyType}
          onChange={(value) => setCompanyType(value as NonNullable<Client["companyType"]>)}
          options={["見込み客", "商談中", "既存顧客", "代理店", "協力会社", "失注", "保留"].map((item) => [item, item])}
        />
        <SelectField
          label="契約状況"
          value={contractStatus}
          onChange={(value) => setContractStatus(value as NonNullable<Client["contractStatus"]>)}
          options={["未契約", "提案中", "契約待ち", "契約中", "終了"].map((item) => [item, item])}
        />
        <div className="lg:col-span-2">
          <DraftTextArea label="メモ" value={notes} onChange={setNotes} rows={4} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!canSave || isSaving} onClick={save} type="button">
          {isSaving ? "保存中" : "会社を保存"}
        </button>
      </div>
    </Panel>
  );
}

function UnifiedTasksWorkspace({
  clients,
  projects,
  salesTasks,
  snsPosts,
  workTasks,
  onSalesTaskUpdate,
  onWorkTaskStatusChange,
  onSnsPostUpdate
}: {
  clients: Client[];
  projects: Project[];
  salesTasks: SalesActionTask[];
  snsPosts: SnsPostTask[];
  workTasks: WorkTask[];
  onSalesTaskUpdate: (task: SalesActionTask) => Promise<void>;
  onWorkTaskStatusChange: (task: WorkTask, status: NonNullable<WorkTask["status"]>) => Promise<void>;
  onSnsPostUpdate: (post: SnsPostTask) => Promise<void>;
}) {
  const openSalesTasks = salesTasks.filter((task) => task.status !== "done");
  const openWorkTasks = workTasks.filter((task) => (task.status ?? "todo") !== "done");
  const openSnsPosts = snsPosts.filter((post) => post.status !== "投稿済み");

  return (
    <section className="grid gap-8">
      <Panel title="タスク一覧" action={`${openSalesTasks.length + openWorkTasks.length + openSnsPosts.length}件`}>
        <div className="grid gap-4 lg:grid-cols-3">
          <TaskBucket title="営業タスク" count={openSalesTasks.length}>
            {openSalesTasks.map((task) => {
              const client = clients.find((item) => item.id === task.clientId);
              return (
                <TaskRow
                  key={task.id}
                  meta={`${client?.name ?? "会社未設定"} / ${task.assignee}`}
                  status={task.status}
                  title={task.title}
                  due={task.due}
                  onDone={() => onSalesTaskUpdate({ ...task, status: "done" })}
                />
              );
            })}
          </TaskBucket>

          <TaskBucket title="案件・開発タスク" count={openWorkTasks.length}>
            {openWorkTasks.map((task) => {
              const project = projects.find((item) => item.id === task.projectId);
              return (
                <TaskRow
                  key={task.id}
                  meta={`${project?.name ?? task.projectId} / ${task.assignee}`}
                  status={task.status ?? "todo"}
                  title={task.title}
                  due={task.due}
                  onDone={() => onWorkTaskStatusChange(task, "done")}
                />
              );
            })}
          </TaskBucket>

          <TaskBucket title="SNSタスク" count={openSnsPosts.length}>
            {openSnsPosts.map((post) => {
              const client = clients.find((item) => item.id === post.clientId);
              return (
                <TaskRow
                  key={post.id}
                  meta={`${client?.name ?? "会社未設定"} / ${post.platform}`}
                  status={post.status}
                  title={post.title}
                  due={post.publishDate || post.dueDate}
                  onDone={() => onSnsPostUpdate({ ...post, status: "投稿済み" })}
                />
              );
            })}
          </TaskBucket>
        </div>
      </Panel>
    </section>
  );
}

function TaskBucket({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-neutral-950">{title}</h3>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{count}</span>
      </div>
      <div className="mt-4 grid gap-3">
        {count > 0 ? children : <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">未完了タスクはありません。</p>}
      </div>
    </div>
  );
}

function TaskRow({ due, meta, onDone, status, title }: { due: string; meta: string; onDone: () => void; status: string; title: string }) {
  return (
    <div className="rounded-2xl border border-line bg-neutral-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          <p className="mt-1 text-xs text-neutral-500">{meta}</p>
          <p className="mt-2 text-xs text-neutral-500">期限: {due || "未設定"} / {status}</p>
        </div>
        <button className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-mogcia-icon" onClick={onDone} type="button">
          完了
        </button>
      </div>
    </div>
  );
}

function CalendarWorkspace({
  clients,
  meetings,
  salesTasks,
  snsPosts
}: {
  clients: Client[];
  meetings: MeetingRecord[];
  salesTasks: SalesActionTask[];
  snsPosts: SnsPostTask[];
}) {
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const events = [
    ...meetings.map((meeting) => ({
      id: meeting.id,
      date: meeting.startedAt,
      kind: "商談・会議",
      title: meeting.title,
      clientId: meeting.clientId
    })),
    ...salesTasks.filter((task) => task.due).map((task) => ({
      id: task.id,
      date: task.due,
      kind: "営業タスク",
      title: task.title,
      clientId: task.clientId
    })),
    ...snsPosts.filter((post) => post.publishDate).map((post) => ({
      id: post.id,
      date: post.publishDate,
      kind: "SNS投稿",
      title: post.title,
      clientId: post.clientId
    }))
  ];
  const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const monthEnd = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
  const monthEvents = events
    .filter((event) => {
      const date = parseCalendarDate(event.date);
      return date && date >= monthStart && date <= endOfDay(monthEnd);
    })
    .sort((a, b) => (parseCalendarDate(a.date)?.getTime() ?? 0) - (parseCalendarDate(b.date)?.getTime() ?? 0));
  const undatedEvents = events.filter((event) => !parseCalendarDate(event.date));
  const selectedTodayKey = toCalendarKey(new Date());

  return (
    <section className="grid gap-6">
      <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-950">カレンダー</h2>
            <p className="mt-1 text-sm text-neutral-500">商談、営業タスク、SNS投稿日を月表示で確認します。</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50" onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1))} type="button">
              前月
            </button>
            <p className="min-w-32 text-center text-lg font-semibold text-neutral-950">
              {cursorDate.getFullYear()}年 {cursorDate.getMonth() + 1}月
            </p>
            <button className="rounded-full border border-line px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50" onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1))} type="button">
              次月
            </button>
            <button className="rounded-full bg-mogcia-light px-3 py-2 text-sm font-semibold text-mogcia-blush" onClick={() => setCursorDate(new Date())} type="button">
              今月
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 border-l border-t border-line text-center text-xs font-semibold text-neutral-400">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <div className="border-b border-r border-line bg-neutral-50 py-2" key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-l border-line">
          {calendarDays.map((day) => {
            const dayKey = toCalendarKey(day);
            const dayEvents = monthEvents.filter((event) => {
              const eventDate = parseCalendarDate(event.date);
              return eventDate ? toCalendarKey(eventDate) === dayKey : false;
            });
            const isCurrentMonth = day.getMonth() === cursorDate.getMonth();
            const isToday = dayKey === selectedTodayKey;

            return (
              <div className={`min-h-[132px] border-b border-r border-line p-2 text-left ${isCurrentMonth ? "bg-white" : "bg-neutral-50/70"}`} key={dayKey}>
                <div className="flex items-center justify-between">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${isToday ? "bg-ink text-white" : isCurrentMonth ? "text-neutral-800" : "text-neutral-300"}`}>{day.getDate()}</span>
                  {dayEvents.length > 0 ? <span className="rounded-full bg-mogcia-icon px-2 py-0.5 text-[10px] font-semibold text-mogcia-blush">{dayEvents.length}</span> : null}
                </div>
                <div className="mt-2 grid gap-1.5">
                  {dayEvents.slice(0, 3).map((event) => {
                    const client = clients.find((item) => item.id === event.clientId);
                    return (
                      <div className={`rounded-lg px-2 py-1.5 ${eventStyle(event.kind)}`} key={`${event.kind}-${event.id}`}>
                        <p className="truncate text-[11px] font-semibold">{formatCalendarTime(event.date)} {event.title}</p>
                        <p className="mt-0.5 truncate text-[10px] opacity-75">{event.kind} / {client?.name ?? "会社未設定"}</p>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 ? <p className="text-[10px] font-semibold text-neutral-400">+{dayEvents.length - 3}件</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-neutral-950">今月の予定</h3>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{monthEvents.length}件</span>
          </div>
          <div className="mt-4 grid gap-3">
            {monthEvents.map((event) => {
              const client = clients.find((item) => item.id === event.clientId);
              return (
                <div key={`${event.kind}-list-${event.id}`} className="rounded-[16px] border border-line bg-neutral-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-neutral-900">{event.title}</p>
                    <span className="text-xs text-neutral-500">{formatCalendarDateTime(event.date)}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{event.kind} / {client?.name ?? "会社未設定"}</p>
                </div>
              );
            })}
            {monthEvents.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">今月の予定はまだありません。</p> : null}
          </div>
        </div>

        <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(31,31,34,0.04)]">
          <h3 className="text-lg font-semibold text-neutral-950">日付未設定</h3>
          <div className="mt-4 grid gap-3">
            {undatedEvents.map((event) => (
              <div key={`${event.kind}-undated-${event.id}`} className="rounded-[16px] bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-900">{event.title}</p>
                <p className="mt-1 text-xs text-neutral-500">{event.kind}</p>
              </div>
            ))}
            {undatedEvents.length === 0 ? <p className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-500">日付未設定の予定はありません。</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function parseCalendarDate(value: string): Date | null {
  if (!value || value.includes("今日") || value.includes("明日") || value.includes("来週")) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function toCalendarKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCalendarTime(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) return "";
  if (date.getHours() === 0 && date.getMinutes() === 0) return "";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatCalendarDateTime(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) return value || "未設定";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function eventStyle(kind: string): string {
  if (kind === "商談・会議") return "bg-mogcia-icon text-mogcia-blush";
  if (kind === "営業タスク") return "bg-amber-50 text-amber-800";
  if (kind === "SNS投稿") return "bg-emerald-50 text-emerald-800";
  return "bg-neutral-100 text-neutral-700";
}

function QuickCapturePanel({
  onAnalyze,
  onSave
}: {
  onAnalyze: (rawText: string) => QuickCaptureAnalysis;
  onSave: (input: { rawText: string; analysis: QuickCaptureAnalysis }) => Promise<void>;
}) {
  const [rawText, setRawText] = useState("");
  const [analysis, setAnalysis] = useState<QuickCaptureAnalysis | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const analyze = () => {
    if (!rawText.trim()) return;
    setAnalysis(onAnalyze(rawText.trim()));
  };

  const save = async () => {
    if (!analysis || !rawText.trim()) return;
    setIsSaving(true);
    await onSave({ rawText: rawText.trim(), analysis });
    setRawText("");
    setAnalysis(null);
    setIsSaving(false);
  };

  return (
    <Panel title="営業クイックメモ" action="Quick Capture">
      <div className="grid gap-3">
        <textarea
          className="min-h-32 rounded-md border border-line bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-ink"
          onChange={(event) => setRawText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") analyze();
          }}
          placeholder="会社名や内容を自由に入力..."
          value={rawText}
        />
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50" disabled={!rawText.trim()} onClick={analyze} type="button">
            解析
          </button>
          <span className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">音声入力はMacの標準入力をそのまま使えます</span>
        </div>
        {analysis ? (
          <div className="rounded-lg border border-line bg-neutral-50 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-neutral-500">会社候補</p>
                <p className="mt-1 font-semibold">{analysis.companyName ?? "未設定"}</p>
                <p className="mt-1 text-xs text-neutral-500">信頼度 {Math.round(analysis.confidence * 100)}%</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">次のアクション</p>
                <p className="mt-1 font-semibold">{analysis.nextActions.length}件</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">重要情報</p>
                <p className="mt-1 font-semibold">{analysis.importantInfo.length}件</p>
              </div>
            </div>
            {analysis.companyCandidates.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {analysis.companyCandidates.map((candidate) => (
                  <span key={`${candidate.clientId ?? candidate.name}-${candidate.score}`} className="rounded-md bg-white px-2 py-1 text-xs text-neutral-600">
                    {candidate.name} / {Math.round(candidate.score * 100)}%
                  </span>
                ))}
              </div>
            ) : null}
            <RequirementList title="抽出された次回アクション" items={analysis.nextActions.map((action) => `${action.title} / 担当: ${action.assignee} / 期限: ${action.due || "未設定"}`)} compact />
            <RequirementList title="重要情報" items={analysis.importantInfo.length > 0 ? analysis.importantInfo : ["重要情報は未検出"]} compact />
            {analysis.unresolved.length > 0 ? <RequirementList title="未確定情報" items={analysis.unresolved} compact /> : null}
            <button className="mt-4 rounded-md bg-mogcia-primary px-3 py-2 text-sm font-medium text-ink hover:bg-mogcia-dark disabled:opacity-50" disabled={isSaving} onClick={save} type="button">
              {isSaving ? "保存中" : "確認して登録"}
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function SalesNextActionPanel({ tasks, onUpdate }: { tasks: SalesActionTask[]; onUpdate: (task: SalesActionTask) => Promise<void> }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">次にすること</p>
        <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{tasks.length}件</span>
      </div>
      <div className="mt-3 grid gap-2">
        {tasks.length > 0 ? (
          tasks.slice(0, 5).map((task) => (
            <div key={task.id} className="grid gap-2 rounded-md bg-neutral-50 px-3 py-2 md:grid-cols-[1fr_120px_100px] md:items-center">
              <div>
                <p className="text-sm font-medium">{task.title}</p>
                <p className="mt-1 text-xs text-neutral-500">担当: {task.assignee} / 期限: {task.due || "未設定"}</p>
              </div>
              <span className="rounded-md bg-white px-2 py-1 text-center text-xs text-neutral-600">{task.importance}</span>
              <button className="rounded-md bg-ink px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => onUpdate({ ...task, status: "done" })} type="button">
                完了
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">未完了の次回アクションはありません。</p>
        )}
      </div>
    </div>
  );
}

function CompanyTimelineEventsPanel({ events }: { events: CompanyTimelineEvent[] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">会社別タイムライン</p>
        <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{events.length}件</span>
      </div>
      <div className="mt-3 grid gap-3">
        {events.length > 0 ? (
          events.slice(0, 6).map((event) => (
            <div key={event.id} className="border-l border-line pl-4">
              <p className="text-xs text-neutral-500">{new Date(event.eventAt).toLocaleString("ja-JP")} / {event.kind}</p>
              <p className="mt-1 font-medium">{event.title}</p>
              <p className="mt-1 line-clamp-4 text-sm leading-6 text-neutral-600">{event.summary}</p>
              {event.importantInfo.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {event.importantInfo.slice(0, 3).map((item) => (
                    <span key={item} className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">営業クイックメモを登録すると、会社別に履歴が並びます。</p>
        )}
      </div>
    </div>
  );
}

function RequirementHistoryPanel({ drafts }: { drafts: RequirementDraft[] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">AI生成履歴</p>
        <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{drafts.length}件</span>
      </div>
      <div className="mt-3 grid gap-2">
        {drafts.length > 0 ? (
          drafts.slice(0, 5).map((draft) => (
            <div key={draft.id} className="rounded-md bg-neutral-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Version {draft.version ?? 1}</span>
                <span className="rounded-md bg-white px-2 py-1 text-xs text-neutral-600">{draft.generatedBy}</span>
                <span className="rounded-md bg-white px-2 py-1 text-xs text-neutral-600">{draft.sourceLabel ?? "AI生成"}</span>
                {draft.approvalStatus === "approved" ? <span className="rounded-md bg-mogcia-light px-2 py-1 text-xs text-ink">承認済み</span> : null}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{new Date(draft.updatedAt ?? draft.generatedAt).toLocaleString("ja-JP")}</p>
              {draft.changeNote ? <p className="mt-1 text-sm text-neutral-600">{draft.changeNote}</p> : null}
            </div>
          ))
        ) : (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">まだ要件定義履歴はありません。</p>
        )}
      </div>
    </div>
  );
}

function DemoSafetyPanel({ run }: { run?: LocalDemoRun }) {
  const checks = createDemoSafetyChecks(run);
  const passedCount = checks.filter((check) => check.passed).length;

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Demo安全チェック</p>
        <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{passedCount}/{checks.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {checks.map((check) => (
          <div key={check.id} className="flex items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${check.passed ? "bg-mogcia-light text-ink" : "bg-red-100 text-red-700"}`}>
              {check.passed ? "OK" : "!"}
            </span>
            <span className="text-neutral-700">{check.label}</span>
          </div>
        ))}
      </div>
      {!run ? <p className="mt-3 text-xs text-neutral-500">ローカルDemo生成後、このチェック結果がRunに保存されます。</p> : null}
    </div>
  );
}

const snsPlatformOptions: SnsPlatform[] = ["Instagram", "TikTok", "X", "Facebook", "YouTube", "LINE"];
const snsPostStatusOptions: SnsPostStatus[] = ["未着手", "企画中", "作成中", "確認待ち", "修正中", "予約済み", "投稿済み"];
const materialStatusOptions: MaterialStatus[] = ["未受領", "一部受領", "受領済み", "不要"];

function SnsDashboardOverview({
  clients,
  projects,
  plans,
  posts,
  activeProject,
  onSelectProject
}: {
  clients: Client[];
  projects: Project[];
  plans: SnsOperationPlan[];
  posts: SnsPostTask[];
  activeProject: Project;
  onSelectProject: (projectId: string) => void;
}) {
  const snsProjects = projects.filter((project) => (project.kind ?? "development") === "sns-operation" || project.services.includes("SNS運用"));
  const targetProjects = snsProjects.length > 0 ? snsProjects : projects;
  const waitingMaterials = posts.filter((post) => post.materialStatus === "未受領").length;
  const waitingReviews = posts.filter((post) => post.status === "確認待ち").length;
  const scheduledPosts = posts.filter((post) => post.status === "予約済み").length;
  const publishedPosts = posts.filter((post) => post.status === "投稿済み").length;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard label="運用プラン" value={`${plans.length}件`} note="月次管理" />
        <SalesMetricCard label="素材待ち" value={`${waitingMaterials}件`} note="未受領" tone={waitingMaterials > 0 ? "alert" : "default"} />
        <SalesMetricCard label="確認待ち" value={`${waitingReviews}件`} note="クライアント確認" tone={waitingReviews > 0 ? "alert" : "default"} />
        <SalesMetricCard label="投稿済み" value={`${publishedPosts}/${posts.length}`} note={`予約済み ${scheduledPosts}件`} />
      </section>

      <HomeCard className="min-h-0">
        <HomeCardHeader eyebrow="SNS projects" title="運用対象案件" badge={<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{targetProjects.length}件</span>} />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {targetProjects.slice(0, 6).map((project) => {
            const client = clients.find((item) => item.id === project.clientId);
            const selected = project.id === activeProject.id;
            const projectPosts = posts.filter((post) => post.projectId === project.id);
            return (
              <button
                key={project.id}
                className={`rounded-[18px] border px-4 py-4 text-left transition ${selected ? "border-mogcia-primary-dark bg-neutral-900 text-white" : "border-line bg-white hover:border-mogcia-primary hover:bg-mogcia-icon"}`}
                onClick={() => onSelectProject(project.id)}
                type="button"
              >
                <p className={`text-xs ${selected ? "text-white/60" : "text-neutral-500"}`}>{client?.name ?? project.clientId}</p>
                <p className="mt-1 text-sm font-semibold">{project.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${selected ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-500"}`}>{project.status}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${selected ? "bg-white/15 text-white" : "bg-mogcia-light text-mogcia-blush"}`}>{projectPosts.length}投稿</span>
                </div>
              </button>
            );
          })}
        </div>
      </HomeCard>
    </div>
  );
}

function OperationalReadinessPanel({
  analyses,
  assets,
  meetings,
  projects,
  source,
  workTasks
}: {
  analyses: MeetingAnalysis[];
  assets: MeetingAsset[];
  meetings: MeetingRecord[];
  projects: Project[];
  source: "sample" | "firestore";
  workTasks: WorkTask[];
}) {
  const checks = [
    {
      label: "Firebase永続化",
      ok: source === "firestore",
      note: source === "firestore" ? "Firestoreデータで表示中" : "サンプルデータ表示中"
    },
    {
      label: "案件登録",
      ok: projects.length > 0,
      note: `${projects.length}件`
    },
    {
      label: "Demo/本番化タスク",
      ok: workTasks.length > 0,
      note: `${workTasks.length}件`
    },
    {
      label: "商談登録",
      ok: meetings.length > 0,
      note: `${meetings.length}件`
    },
    {
      label: "MP4/会議ファイル添付",
      ok: assets.some((asset) => asset.kind === "video" || asset.kind === "audio"),
      note: `${assets.length}件`
    },
    {
      label: "商談AI分析",
      ok: analyses.length > 0,
      note: `${analyses.length}件`
    }
  ];
  const passed = checks.filter((check) => check.ok).length;

  return (
    <Panel title="実運用チェック" action={`${passed} / ${checks.length}`}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <div key={check.label} className={`rounded-[18px] border p-4 ${check.ok ? "border-emerald-200 bg-emerald-50" : "border-mogcia-light bg-mogcia-icon"}`}>
            <p className="text-sm font-semibold text-neutral-900">{check.ok ? "OK" : "要確認"} / {check.label}</p>
            <p className="mt-2 text-sm text-neutral-600">{check.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-neutral-600">
        実案件で、案件登録、議事録、承認、Demo、商談MP4、文字起こし、商談分析まで1回ずつ保存すると全項目がOKになります。
      </p>
    </Panel>
  );
}

function SnsOperationPanel({
  plans,
  posts,
  onCreatePlan,
  onUpdatePost
}: {
  plans: SnsOperationPlan[];
  posts: SnsPostTask[];
  onCreatePlan: (input: { month: string; contractPlan: string; platforms: SnsPlatform[]; monthlyPostCount: number; meetingMemo: string }) => Promise<void>;
  onUpdatePost: (post: SnsPostTask) => Promise<void>;
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [contractPlan, setContractPlan] = useState("月4投稿プラン");
  const [monthlyPostCount, setMonthlyPostCount] = useState(4);
  const [platforms, setPlatforms] = useState<SnsPlatform[]>(["Instagram"]);
  const [meetingMemo, setMeetingMemo] = useState("");
  const latestPlan = plans[0];
  const latestPosts = latestPlan ? posts.filter((post) => post.planId === latestPlan.id) : [];
  const alerts = summarizeSnsAlerts(latestPosts);
  const doneCount = latestPosts.filter((post) => post.status === "投稿済み").length;
  const progress = latestPosts.length > 0 ? Math.round((doneCount / latestPosts.length) * 100) : 0;

  const togglePlatform = (platform: SnsPlatform) => {
    setPlatforms((current) => (current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]));
  };

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="font-semibold">SNS運用</p>
          <p className="mt-1 text-sm text-neutral-500">投稿案作成や自動投稿ではなく、進行・確認・期限・成果物を管理します。</p>
        </div>
        {latestPlan ? <span className="rounded-md bg-mogcia-light px-2 py-1 text-xs text-ink">{latestPlan.month}</span> : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg bg-neutral-50 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="対象月" value={month} onChange={setMonth} placeholder="2026-07" />
          <Field label="契約プラン" value={contractPlan} onChange={setContractPlan} placeholder="月4投稿プラン" />
          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-700">月間投稿本数</span>
            <input
              className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
              min={1}
              max={60}
              onChange={(event) => setMonthlyPostCount(Number(event.target.value))}
              type="number"
              value={monthlyPostCount}
            />
          </label>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">対象SNS</p>
          <div className="flex flex-wrap gap-2">
            {snsPlatformOptions.map((platform) => (
              <button
                key={platform}
                className={`rounded-md border px-3 py-2 text-sm ${platforms.includes(platform) ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-700"}`}
                onClick={() => togglePlatform(platform)}
                type="button"
              >
                {platform}
              </button>
            ))}
          </div>
        </div>
        <DraftTextArea label="打ち合わせ内容・要望・修正履歴" value={meetingMemo} onChange={setMeetingMemo} rows={3} />
        <button
          className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          disabled={!month.trim() || !contractPlan.trim() || platforms.length === 0 || monthlyPostCount < 1}
          onClick={() => onCreatePlan({ month, contractPlan, platforms, monthlyPostCount, meetingMemo })}
          type="button"
        >
          月次投稿タスク作成
        </button>
      </div>

      {latestPlan ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-lg border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="font-medium">{latestPlan.month} 運用状況</span>
              <span className="text-neutral-500">{doneCount} / {latestPosts.length} 投稿済み</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-mogcia-primary-dark transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-neutral-100 px-2 py-1">{latestPlan.contractPlan}</span>
              <span className="rounded-md bg-neutral-100 px-2 py-1">素材: {latestPlan.materialStatus}</span>
              <span className="rounded-md bg-neutral-100 px-2 py-1">月次レポート: {latestPlan.reportStatus}</span>
            </div>
          </div>

          {alerts.length > 0 ? (
            <div className="rounded-lg border border-mogcia-primary bg-mogcia-light/35 p-4">
              <p className="text-sm font-semibold">Agent確認項目</p>
              <div className="mt-2 grid gap-2">
                {alerts.slice(0, 6).map((alert) => (
                  <p key={alert} className="rounded-md bg-white px-3 py-2 text-sm text-neutral-700">{alert}</p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3">
            {latestPosts.map((post) => (
              <SnsPostTaskCard key={post.id} post={post} onSave={onUpdatePost} />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">月次投稿タスクを作ると、投稿ごとの進行状況を管理できます。</p>
      )}
    </div>
  );
}

function SnsPostTaskCard({ post, onSave }: { post: SnsPostTask; onSave: (post: SnsPostTask) => Promise<void> }) {
  const [draft, setDraft] = useState(post);

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[1.1fr_140px_140px_140px]">
        <Field label="投稿名" value={draft.title} onChange={(value) => setDraft((current) => ({ ...current, title: value }))} placeholder="7月 投稿1" />
        <SelectField
          label="SNS"
          value={draft.platform}
          onChange={(value) => setDraft((current) => ({ ...current, platform: value as SnsPlatform }))}
          options={snsPlatformOptions.map((platform) => [platform, platform])}
        />
        <SelectField
          label="進行"
          value={draft.status}
          onChange={(value) => setDraft((current) => ({ ...current, status: value as SnsPostStatus }))}
          options={snsPostStatusOptions.map((status) => [status, status])}
        />
        <SelectField
          label="素材"
          value={draft.materialStatus}
          onChange={(value) => setDraft((current) => ({ ...current, materialStatus: value as MaterialStatus }))}
          options={materialStatusOptions.map((status) => [status, status])}
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="確認期限" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} placeholder="2026-07-27" />
        <Field label="投稿日" value={draft.publishDate} onChange={(value) => setDraft((current) => ({ ...current, publishDate: value }))} placeholder="2026-07-30" />
        <Field label="担当者" value={draft.owner} onChange={(value) => setDraft((current) => ({ ...current, owner: value }))} placeholder="担当者" />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_130px]">
        <Field label="投稿URL" value={draft.postUrl ?? ""} onChange={(value) => setDraft((current) => ({ ...current, postUrl: value }))} placeholder="https://..." />
        <button className="self-end rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800" onClick={() => onSave(draft)} type="button">
          保存
        </button>
      </div>
      <DraftTextArea
        label="メモ・修正履歴"
        value={[draft.notes ?? "", ...draft.revisionHistory].filter(Boolean).join("\n")}
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            notes: value.split("\n")[0] ?? "",
            revisionHistory: splitLines(value).slice(1)
          }))
        }
        rows={3}
      />
    </div>
  );
}

function TaskSummary({ title, tasks, progress }: { title: string; tasks: WorkTask[]; progress: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{title}</p>
        <span className="text-sm text-neutral-500">{progress}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-mogcia-primary-dark" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 grid gap-2">
        {tasks.slice(0, 5).map((task) => (
          <div key={task.id} className="flex items-center justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2">
            <span className="text-sm text-neutral-700">{task.title}</span>
            <TaskStatusBadge status={task.status ?? "todo"} />
          </div>
        ))}
        {tasks.length === 0 ? <p className="text-sm text-neutral-500">まだタスクはありません。</p> : null}
      </div>
    </div>
  );
}

function WorkTaskCard({
  task,
  projectName,
  canManage,
  busy,
  onStatusChange
}: {
  task: WorkTask;
  projectName: string;
  canManage: boolean;
  busy: boolean;
  onStatusChange: (task: WorkTask, status: NonNullable<WorkTask["status"]>) => Promise<void>;
}) {
  const currentStatus = task.status ?? "todo";

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[48px_1fr_140px_140px] md:items-start">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-mogcia-light text-sm font-semibold text-ink">{task.order ?? "-"}</div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{task.title}</p>
            <TaskStatusBadge status={currentStatus} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">{projectName}</p>
          {task.description ? <p className="mt-2 text-sm leading-5 text-neutral-600">{task.description}</p> : null}
        </div>
        <span className="rounded-md bg-neutral-100 px-3 py-2 text-center text-sm">{task.assignee}</span>
        <SafetyBadge safety={task.safety} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!canManage || busy || currentStatus === "todo"}
          onClick={() => onStatusChange(task, "todo")}
          type="button"
        >
          未着手に戻す
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!canManage || busy || currentStatus === "doing"}
          onClick={() => onStatusChange(task, "doing")}
          type="button"
        >
          {busy ? "更新中" : "開始"}
        </button>
        <button
          className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          disabled={!canManage || busy || currentStatus === "done"}
          onClick={() => onStatusChange(task, "done")}
          type="button"
        >
          {busy ? "更新中" : "完了"}
        </button>
      </div>
    </div>
  );
}

function DemoTaskCard({
  task,
  projectName,
  guideDraft,
  canManage,
  busy,
  onStatusChange,
  onPreviewSave,
  onGuideGenerate
}: {
  task: WorkTask;
  projectName: string;
  guideDraft?: DemoGuideDraft;
  canManage: boolean;
  busy: boolean;
  onStatusChange: (task: WorkTask, status: NonNullable<WorkTask["status"]>) => Promise<void>;
  onPreviewSave: (task: WorkTask, previewUrl: string) => Promise<void>;
  onGuideGenerate: (task: WorkTask) => Promise<void>;
}) {
  const currentStatus = task.status ?? "todo";
  const isPreviewTask = task.title.includes("Preview URL");
  const isGuideTask = task.title.includes("デモ案内準備");
  const [previewUrl, setPreviewUrl] = useState(task.previewUrl ?? "");

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[48px_1fr_140px_140px] md:items-start">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-mogcia-light text-sm font-semibold text-ink">{task.order ?? "-"}</div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{task.title}</p>
            <TaskStatusBadge status={currentStatus} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">{projectName}</p>
          {task.description ? <p className="mt-2 text-sm leading-5 text-neutral-600">{task.description}</p> : null}
          {task.previewUrl ? (
            <a className="mt-3 inline-flex text-sm font-medium text-mogcia-blush underline-offset-4 hover:underline" href={task.previewUrl} rel="noreferrer" target="_blank">
              記録済みPreviewを開く
            </a>
          ) : null}
        </div>
        <span className="rounded-md bg-neutral-100 px-3 py-2 text-center text-sm">{task.assignee}</span>
        <SafetyBadge safety={task.safety} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!canManage || busy || currentStatus === "todo"}
          onClick={() => onStatusChange(task, "todo")}
          type="button"
        >
          未着手に戻す
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!canManage || busy || currentStatus === "doing"}
          onClick={() => onStatusChange(task, "doing")}
          type="button"
        >
          {busy ? "更新中" : "開始"}
        </button>
        <button
          className="rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          disabled={!canManage || busy || currentStatus === "done"}
          onClick={() => onStatusChange(task, "done")}
          type="button"
        >
          {busy ? "更新中" : "完了"}
        </button>
      </div>

      {isPreviewTask ? (
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_120px]">
          <input
            className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
            onChange={(event) => setPreviewUrl(event.target.value)}
            placeholder="http://localhost:3000"
            value={previewUrl}
          />
          <button
            className="rounded-md bg-mogcia-primary px-3 py-2 text-sm font-medium text-ink hover:bg-mogcia-dark disabled:opacity-50"
            disabled={!canManage || busy || !previewUrl.trim()}
            onClick={() => onPreviewSave(task, previewUrl)}
            type="button"
          >
            URL保存
          </button>
        </div>
      ) : null}

      {isGuideTask ? (
        <div className="mt-4 rounded-lg border border-line bg-neutral-50 p-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ink">デモ案内文</p>
              <p className="mt-1 text-sm text-neutral-500">送信はせず、営業確認用の下書きだけ作成します。</p>
            </div>
            <button
              className="rounded-md bg-mogcia-primary px-3 py-2 text-sm font-medium text-ink hover:bg-mogcia-dark disabled:opacity-50"
              disabled={!canManage || busy}
              onClick={() => onGuideGenerate(task)}
              type="button"
            >
              {busy ? "生成中" : guideDraft ? "再生成" : "案内文生成"}
            </button>
          </div>
          {guideDraft ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-md bg-white px-3 py-2">
                <p className="text-xs text-neutral-500">件名</p>
                <p className="mt-1 text-sm font-medium">{guideDraft.subject}</p>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-white px-3 py-3 text-sm leading-6 text-neutral-700">{guideDraft.body}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TaskStatusBadge({ status }: { status: NonNullable<WorkTask["status"]> }) {
  const label = {
    todo: "未着手",
    doing: "進行中",
    done: "完了"
  }[status];

  const style = {
    todo: "bg-neutral-100 text-neutral-700",
    doing: "bg-mogcia-light text-ink",
    done: "bg-mogcia-primary text-ink"
  }[status];

  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${style}`}>{label}</span>;
}

function isPreviewUrl(value: string): boolean {
  if (!value) return false;
  return /^https?:\/\/.+/i.test(value);
}

function ProjectRegistrationForm({
  firebaseReady,
  onSubmit
}: {
  firebaseReady: boolean;
  onSubmit: (input: ProjectRegistrationInput) => Promise<void>;
}) {
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("development");
  const [source, setSource] = useState<ProjectSource>("direct-client");
  const [mode, setMode] = useState<AgentMode>("demo");
  const [services, setServices] = useState<ServiceKind[]>(["HP制作"]);
  const [minutes, setMinutes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = clientName.trim() && industry.trim() && contactName.trim() && projectName.trim() && minutes.trim() && services.length > 0;

  const toggleService = (service: ServiceKind) => {
    setServices((current) => (current.includes(service) ? current.filter((item) => item !== service) : [...current, service]));
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setMessage("必須項目を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await onSubmit({
        clientName: clientName.trim(),
        industry: industry.trim(),
        contactName: contactName.trim(),
        projectName: projectName.trim(),
        kind,
        source,
        mode,
        services,
        minutes: minutes.trim()
      });
      setClientName("");
      setIndustry("");
      setContactName("");
      setProjectName("");
      setKind("development");
      setSource("direct-client");
      setMode("demo");
      setServices(["HP制作"]);
      setMinutes("");
      setMessage(firebaseReady ? "Firestoreへ保存しました。" : "ローカル表示に登録しました。ログイン後はFirestoreへ保存されます。");
    } catch {
      setMessage("登録に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Panel title="案件登録 + 議事録登録" action={firebaseReady ? "Firestore保存" : "ログイン待ち"}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="顧客名" value={clientName} onChange={setClientName} placeholder="株式会社〇〇" />
            <Field label="担当者" value={contactName} onChange={setContactName} placeholder="山田様" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="業種" value={industry} onChange={setIndustry} placeholder="ホテル / 美容 / 飲食" />
            <Field label="案件名" value={projectName} onChange={setProjectName} placeholder="予約導線改善Demo" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="案件タイプ"
              value={kind}
              onChange={(value) => setKind(value as ProjectKind)}
              options={[
                ["development", "開発 / Demo"],
                ["sns-operation", "SNS運用"]
              ]}
            />
            <SelectField
              label="案件種別"
              value={source}
              onChange={(value) => setSource(value as ProjectSource)}
              options={[
                ["direct-client", "クライアント直案件"],
                ["agency", "代理店"],
                ["internal", "社内案件"]
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
                label="モード"
                value={mode}
                onChange={(value) => setMode(value as AgentMode)}
                options={[
                  ["demo", "Demo"],
                  ["production", "本番"]
                ]}
              />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">契約サービス / 提案サービス</p>
            <div className="flex flex-wrap gap-2">
              {serviceOptions.map((service) => (
                <button
                  key={service}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    services.includes(service) ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                  onClick={() => toggleService(service)}
                  type="button"
                >
                  {service}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-700">議事録</span>
            <textarea
              className="min-h-56 rounded-md border border-line bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-ink"
              onChange={(event) => setMinutes(event.target.value)}
              placeholder="ヒアリング内容、課題、希望機能、予算感、納期、未確認事項など"
              value={minutes}
            />
          </label>
          <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
            登録後、直案件・代理店は石田承認キューへ入ります。社内案件は承認不要で要件整理中になります。
          </div>
          <button
            className="rounded-md bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? "登録中" : "案件と議事録を登録"}
          </button>
          {message ? <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{message}</p> : null}
        </div>
      </div>
    </Panel>
  );
}

function SystemOperationsPanel({
  authEmail,
  source,
  status,
  isSeeding,
  onSeed,
  onLogout
}: {
  authEmail?: string | null;
  source: "sample" | "firestore";
  status: string;
  isSeeding: boolean;
  onSeed: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  return (
    <HomeCard className="min-h-0">
      <HomeCardHeader eyebrow="System" title="手動操作" badge={<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{source}</span>} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="rounded-[18px] bg-mogcia-icon px-4 py-4">
          <p className="text-sm font-semibold text-neutral-900">{authEmail ?? "未ログイン"}</p>
          <p className="mt-1 text-sm text-neutral-600">{status}</p>
          <p className="mt-2 text-xs leading-5 text-neutral-500">初期データ投入やログアウトは、ヘッダーではなく設定画面から操作します。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50" disabled={isSeeding} onClick={() => void onSeed()} type="button">
            {isSeeding ? "投入中" : "初期データ投入"}
          </button>
          <button className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800" onClick={() => void onLogout()} type="button">
            ログアウト
          </button>
        </div>
      </div>
    </HomeCard>
  );
}

function TeamAccessPanel({ currentEmail, role, isIshida }: { currentEmail?: string | null; role: UserRole; isIshida: boolean }) {
  const roleLabels: Record<UserRole, string> = {
    admin: "管理者",
    internal: "社内",
    sales: "営業",
    agency: "代理店"
  };

  return (
    <div className="grid gap-5">
      <HomeCard className="min-h-0">
        <HomeCardHeader eyebrow="Access" title="ユーザー / 権限" badge={<span className="rounded-full bg-mogcia-light px-3 py-1 text-xs text-mogcia-blush">{roleLabels[role]}</span>} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-[18px] bg-mogcia-icon p-5">
            <p className="text-sm text-neutral-500">ログイン中</p>
            <h3 className="mt-2 text-xl font-semibold text-neutral-950">{currentEmail ?? "未ログイン"}</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              石田アカウントは承認、Rule編集、AI設定、CLI連携の管理ができます。社内・営業・代理店は案件登録、議事録登録、進捗確認を中心に使います。
            </p>
          </div>
          <div className="rounded-[18px] border border-line bg-white p-5">
            <p className="text-sm font-semibold text-neutral-900">管理者判定</p>
            <p className="mt-3 text-3xl font-semibold text-neutral-950">{isIshida ? "OK" : "閲覧中心"}</p>
            <p className="mt-2 text-sm text-neutral-500">{isIshida ? "石田承認キューを処理できます。" : "承認・Rule編集は石田アカウントのみです。"}</p>
          </div>
        </div>
      </HomeCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(rolePermissions) as UserRole[]).map((itemRole) => (
          <HomeCard key={itemRole} className="min-h-[220px]">
            <HomeCardHeader title={roleLabels[itemRole]} />
            <div className="mt-4 grid gap-2">
              {rolePermissions[itemRole].map((permission) => (
                <span key={permission} className="rounded-full bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">{permission}</span>
              ))}
            </div>
          </HomeCard>
        ))}
      </div>
    </div>
  );
}

function RequirementList({ title, items, compact = false }: { title: string; items: string[]; compact?: boolean }) {
  return (
    <div className={compact ? "" : "mt-4"}>
      <p className="mb-2 text-sm font-semibold text-neutral-800">{title}</p>
      <div className="grid gap-2">
        {items.map((item) => (
          <p key={item} className="rounded-md bg-neutral-50 px-3 py-2 text-sm leading-5 text-neutral-600">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthPanel({
  source,
  status,
  onSeed,
  isSeeding
}: {
  source: "sample" | "firestore";
  status: string;
  onSeed: () => Promise<void>;
  isSeeding: boolean;
}) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "create">("sign-in");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const submitEmailAuth = async () => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      if (authMode === "create") {
        await auth.createUserWithEmail(email, password);
      } else {
        await auth.signInWithEmail(email, password);
      }
    } catch (error) {
      setAuthError(toAuthMessage(error));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const submitGoogleAuth = async () => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      await auth.signInWithGoogle();
    } catch (error) {
      setAuthError(toAuthMessage(error));
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!auth.firebaseConfigured) {
    return (
      <div className="rounded-lg border border-line bg-white p-4 text-sm text-neutral-600 shadow-soft lg:w-96">
        <p className="font-semibold text-ink">Firebase未設定</p>
        <p className="mt-1">.env.local にFirebase Web Appの値を入れるとAuth / Firestoreに接続します。</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4 text-sm text-neutral-600 shadow-soft lg:w-96">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{auth.user ? auth.user.displayName ?? auth.user.email : "Firebase Auth"}</p>
          <p className="mt-1">{status}</p>
          <p className="mt-1 text-xs text-neutral-400">Data source: {source}</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs ${auth.user ? "bg-emerald-100 text-emerald-900" : "bg-neutral-100 text-neutral-700"}`}>
          {auth.loading ? "確認中" : auth.user ? "ログイン中" : "未ログイン"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {auth.user ? (
          <>
            <button className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50" onClick={onSeed} disabled={isSeeding}>
              {isSeeding ? "投入中" : "初期データ投入"}
            </button>
              <button className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50" onClick={auth.signOutUser}>
                ログアウト
              </button>
          </>
        ) : (
          <div className="w-full space-y-3">
            <div className="grid gap-2">
              <input
                className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
                placeholder="メールアドレス"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
                placeholder="パスワード"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-md px-3 py-2 text-sm ${authMode === "sign-in" ? "bg-ink text-white" : "border border-line bg-white hover:bg-neutral-50"}`}
                onClick={() => setAuthMode("sign-in")}
                type="button"
              >
                ログイン
              </button>
              <button
                className={`rounded-md px-3 py-2 text-sm ${authMode === "create" ? "bg-ink text-white" : "border border-line bg-white hover:bg-neutral-50"}`}
                onClick={() => setAuthMode("create")}
                type="button"
              >
                新規作成
              </button>
            </div>
            <button
              className="w-full rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              disabled={isAuthenticating || !email || password.length < 6}
              onClick={submitEmailAuth}
              type="button"
            >
              {isAuthenticating ? "処理中" : authMode === "create" ? "メールで作成" : "メールでログイン"}
            </button>
            <button
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              disabled={isAuthenticating}
              onClick={submitGoogleAuth}
              type="button"
            >
              Googleでログイン
            </button>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500">
              <button className="rounded-md border border-dashed border-line px-3 py-2 text-left" disabled type="button">
                Passkey準備中
              </button>
              <button className="rounded-md border border-dashed border-line px-3 py-2 text-left" disabled type="button">
                Apple後回し
              </button>
            </div>
            {authError ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{authError}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function toAuthMessage(error: unknown): string {
  if (!(error instanceof Error)) return "ログインに失敗しました。";

  if (error.message.includes("auth/invalid-credential")) return "メールアドレスまたはパスワードが違います。";
  if (error.message.includes("auth/email-already-in-use")) return "このメールアドレスはすでに登録されています。";
  if (error.message.includes("auth/weak-password")) return "パスワードは6文字以上にしてください。";
  if (error.message.includes("auth/popup-closed-by-user")) return "ログイン画面が閉じられました。";
  if (error.message.includes("auth/operation-not-allowed")) return "Firebase Consoleでこのログイン方法を有効にしてください。";

  return error.message;
}

function Panel({
  title,
  action,
  children
}: {
  title: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-mogcia-surface/90 p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button className="rounded-md border border-line bg-white/80 px-3 py-2 text-sm text-neutral-700 hover:bg-mogcia-light/35">{action}</button>
      </div>
      {children}
    </section>
  );
}

function SafetyBadge({ safety }: { safety: AutomationSafety }) {
  const label = {
    "draft-only": "下書き",
    "approval-required": "承認必須",
    "auto-allowed": "自動可"
  }[safety];

  const style = {
    "draft-only": "bg-neutral-100 text-neutral-700",
    "approval-required": "bg-mogcia-light text-ink",
    "auto-allowed": "bg-mogcia-primary text-ink"
  }[safety];

  return <span className={`rounded-md px-3 py-2 text-center text-xs font-medium ${style}`}>{label}</span>;
}
