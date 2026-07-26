import {
  collection,
  updateDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  doc,
  type CollectionReference,
  type DocumentData
} from "firebase/firestore";
import { emailTemplates } from "@/domain/automation";
import { defaultAgentConfigs } from "@/domain/agent-configs";
import { createProductionWorkTasks } from "@/domain/production-tasks";
import { generateRequirementDraft } from "@/domain/requirements";
import { clients, projectRules, projects, timeline } from "@/domain/sample-data";
import type {
  AgentConfig,
  AgentMode,
  Client,
  CodexResult,
  CodexRun,
  CodexCliRun,
  CompanyTimelineEvent,
  CompanyContact,
  DevelopmentProgressItem,
  EmailTemplate,
  MeetingAnalysis,
  MeetingAsset,
  MeetingRecord,
  MinutesRecord,
  MonthlyReport,
  NotificationItem,
  Project,
  Product,
  ProjectSource,
  QuickCapture,
  RequirementDraft,
  RuleLayer,
  ServiceKind,
  SnsOperationPlan,
  SnsPostTask,
  SalesActionTask,
  SalesActivity,
  StorageAsset,
  TimelineEvent,
  OpenAiReview,
  WebsiteAnalysis,
  WorkflowStage,
  WorkTask
} from "@/domain/types";
import { getFirebaseDb } from "./client";

export const collectionNames = {
  clients: "clients",
  projects: "projects",
  ruleLayers: "ruleLayers",
  timelineEvents: "timelineEvents",
  emailTemplates: "emailTemplates",
  agentConfigs: "agentConfigs",
  websiteAnalyses: "websiteAnalyses",
  monthlyReports: "monthlyReports",
  notifications: "notifications",
  storageAssets: "storageAssets",
  openAiReviews: "openAiReviews",
  codexCliRuns: "codexCliRuns",
  codexRuns: "codexRuns",
  codexResults: "codexResults",
  developmentProgressItems: "developmentProgressItems",
  snsOperationPlans: "snsOperationPlans",
  snsPostTasks: "snsPostTasks",
  quickCaptures: "quickCaptures",
  companyTimelineEvents: "companyTimelineEvents",
  salesActionTasks: "salesActionTasks",
  companyContacts: "companyContacts",
  salesActivities: "salesActivities",
  meetings: "meetings",
  meetingAssets: "meetingAssets",
  meetingAnalyses: "meetingAnalyses",
  minutes: "minutes",
  requirementDrafts: "requirementDrafts",
  workTasks: "workTasks",
  products: "products"
} as const;

type Persistable =
  | Client
  | Project
  | RuleLayer
  | TimelineEvent
  | EmailTemplate
  | AgentConfig
  | WebsiteAnalysis
  | MonthlyReport
  | NotificationItem
  | StorageAsset
  | OpenAiReview
  | CodexCliRun
  | CodexRun
  | CodexResult
  | DevelopmentProgressItem
  | SnsOperationPlan
  | SnsPostTask
  | QuickCapture
  | CompanyTimelineEvent
  | SalesActionTask
  | CompanyContact
  | SalesActivity
  | MeetingRecord
  | MeetingAsset
  | MeetingAnalysis
  | MinutesRecord
  | RequirementDraft
  | Product
  | WorkTask;

interface CreateProjectWithMinutesInput {
  clientName: string;
  industry: string;
  contactName: string;
  projectName: string;
  kind?: Project["kind"];
  source: ProjectSource;
  mode: AgentMode;
  services: ServiceKind[];
  minutes: string;
  createdBy: string;
}

function getTypedCollection<T extends Persistable>(name: string): CollectionReference<DocumentData, DocumentData> | null {
  const db = getFirebaseDb();
  return db ? collection(db, name) : null;
}

export async function getCollectionDocuments<T extends Persistable>(name: string): Promise<T[]> {
  const ref = getTypedCollection<T>(name);
  if (!ref) return [];

  const snapshot = await getDocs(ref);
  return snapshot.docs.map((item) => {
    const data = item.data();
    return { ...data, id: item.id } as T;
  });
}

async function saveCollection<T extends Persistable>(name: string, items: T[]): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all(
    items.map((item) =>
      setDoc(
        doc(db, name, item.id),
        {
          ...item,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    )
  );
}

export async function loadDashboardCollections() {
  const [
    remoteClients,
    remoteProjects,
    remoteRules,
    remoteTimeline,
    remoteTemplates,
    remoteAgentConfigs,
    remoteWebsiteAnalyses,
    remoteMonthlyReports,
    remoteNotifications,
    remoteStorageAssets,
    remoteOpenAiReviews,
    remoteCodexCliRuns,
    remoteCodexRuns,
    remoteCodexResults,
    remoteDevelopmentProgressItems,
    remoteSnsOperationPlans,
    remoteSnsPostTasks,
    remoteQuickCaptures,
    remoteCompanyTimelineEvents,
    remoteSalesActionTasks,
    remoteCompanyContacts,
    remoteSalesActivities,
    remoteMeetings,
    remoteMeetingAssets,
    remoteMeetingAnalyses,
    remoteMinutes,
    remoteRequirementDrafts,
    remoteWorkTasks,
    remoteProducts
  ] = await Promise.all([
    getCollectionDocuments<Client>(collectionNames.clients),
    getCollectionDocuments<Project>(collectionNames.projects),
    getCollectionDocuments<RuleLayer>(collectionNames.ruleLayers),
    getCollectionDocuments<TimelineEvent>(collectionNames.timelineEvents),
    getCollectionDocuments<EmailTemplate>(collectionNames.emailTemplates),
    getCollectionDocuments<AgentConfig>(collectionNames.agentConfigs),
    getCollectionDocuments<WebsiteAnalysis>(collectionNames.websiteAnalyses),
    getCollectionDocuments<MonthlyReport>(collectionNames.monthlyReports),
    getCollectionDocuments<NotificationItem>(collectionNames.notifications),
    getCollectionDocuments<StorageAsset>(collectionNames.storageAssets),
    getCollectionDocuments<OpenAiReview>(collectionNames.openAiReviews),
    getCollectionDocuments<CodexCliRun>(collectionNames.codexCliRuns),
    getCollectionDocuments<CodexRun>(collectionNames.codexRuns),
    getCollectionDocuments<CodexResult>(collectionNames.codexResults),
    getCollectionDocuments<DevelopmentProgressItem>(collectionNames.developmentProgressItems),
    getCollectionDocuments<SnsOperationPlan>(collectionNames.snsOperationPlans),
    getCollectionDocuments<SnsPostTask>(collectionNames.snsPostTasks),
    getCollectionDocuments<QuickCapture>(collectionNames.quickCaptures),
    getCollectionDocuments<CompanyTimelineEvent>(collectionNames.companyTimelineEvents),
    getCollectionDocuments<SalesActionTask>(collectionNames.salesActionTasks),
    getCollectionDocuments<CompanyContact>(collectionNames.companyContacts),
    getCollectionDocuments<SalesActivity>(collectionNames.salesActivities),
    getCollectionDocuments<MeetingRecord>(collectionNames.meetings),
    getCollectionDocuments<MeetingAsset>(collectionNames.meetingAssets),
    getCollectionDocuments<MeetingAnalysis>(collectionNames.meetingAnalyses),
    getCollectionDocuments<MinutesRecord>(collectionNames.minutes),
    getCollectionDocuments<RequirementDraft>(collectionNames.requirementDrafts),
    getCollectionDocuments<WorkTask>(collectionNames.workTasks),
    getCollectionDocuments<Product>(collectionNames.products)
  ]);

  return {
    clients: remoteClients,
    projects: remoteProjects,
    ruleLayers: remoteRules,
    timelineEvents: remoteTimeline,
    emailTemplates: remoteTemplates,
    agentConfigs: remoteAgentConfigs,
    websiteAnalyses: remoteWebsiteAnalyses,
    monthlyReports: remoteMonthlyReports,
    notifications: remoteNotifications,
    storageAssets: remoteStorageAssets,
    openAiReviews: remoteOpenAiReviews,
    codexCliRuns: remoteCodexCliRuns,
    codexRuns: remoteCodexRuns,
    codexResults: remoteCodexResults,
    developmentProgressItems: remoteDevelopmentProgressItems,
    snsOperationPlans: remoteSnsOperationPlans,
    snsPostTasks: remoteSnsPostTasks,
    quickCaptures: remoteQuickCaptures,
    companyTimelineEvents: remoteCompanyTimelineEvents,
    salesActionTasks: remoteSalesActionTasks,
    companyContacts: remoteCompanyContacts,
    salesActivities: remoteSalesActivities,
    meetings: remoteMeetings,
    meetingAssets: remoteMeetingAssets,
    meetingAnalyses: remoteMeetingAnalyses,
    minutes: remoteMinutes,
    requirementDrafts: remoteRequirementDrafts,
    workTasks: remoteWorkTasks,
    products: remoteProducts
  };
}

export async function seedInitialFirestoreData(): Promise<void> {
  await Promise.all([
    saveCollection(collectionNames.clients, clients),
    saveCollection(collectionNames.projects, projects),
    saveCollection(collectionNames.ruleLayers, projectRules),
    saveCollection(collectionNames.timelineEvents, timeline),
    saveCollection(collectionNames.emailTemplates, emailTemplates),
    saveCollection(collectionNames.agentConfigs, defaultAgentConfigs)
  ]);
}

export async function saveClient(client: Client): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.clients, client.id),
    {
      ...client,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveProduct(product: Product): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.products, product.id),
    {
      ...product,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function approveProject(projectId: string, approverEmail: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.projects, projectId), {
    approvalStatus: "approved",
    approvedBy: approverEmail,
    approvedAt: serverTimestamp(),
    status: "承認済み",
    nextAction: "石田承認済み。Codex進捗と開発タスクを確認"
  });
}

export async function rejectProject(projectId: string, approverEmail: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.projects, projectId), {
    approvalStatus: "rejected",
    rejectedBy: approverEmail,
    rejectedAt: serverTimestamp(),
    status: "保留",
    nextAction: "石田差し戻し。要件・不足確認を更新"
  });
}

export async function createProjectWithMinutes(input: CreateProjectWithMinutesInput): Promise<{
  client: Client;
  project: Project;
  minutes: MinutesRecord;
  timelineEvent: TimelineEvent;
}> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  const clientId = `client-${crypto.randomUUID()}`;
  const projectId = `project-${crypto.randomUUID()}`;
  const minutesId = `minutes-${crypto.randomUUID()}`;
  const timelineId = `timeline-${crypto.randomUUID()}`;
  const now = new Date();
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
    kind: input.kind ?? "development",
    source: input.source,
    mode: input.mode,
    status: needsApproval ? "承認待ち" : "要件整理中",
    approvalStatus: needsApproval ? "pending" : "not-required",
    services: input.services,
    owner: input.createdBy,
    nextAction: needsApproval
      ? "議事録登録済み。AI要件定義後、石田承認へ進行"
      : "議事録登録済み。AI要件定義と開発タスク確認へ進行"
  };

  const minutes: MinutesRecord = {
    id: minutesId,
    clientId,
    projectId,
    content: input.minutes,
    registeredBy: input.createdBy,
    registeredAt: now.toISOString()
  };

  const timelineEvent: TimelineEvent = {
    id: timelineId,
    clientId,
    kind: "minutes",
    title: "議事録登録",
    date: now.toLocaleDateString("ja-JP", { month: "long", day: "numeric" }),
    summary: `${input.projectName} のヒアリング内容を登録`
  };

  await Promise.all([
    setDoc(doc(db, collectionNames.clients, clientId), { ...client, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    setDoc(doc(db, collectionNames.projects, projectId), { ...project, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    setDoc(doc(db, collectionNames.minutes, minutesId), { ...minutes, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    setDoc(doc(db, collectionNames.timelineEvents, timelineId), { ...timelineEvent, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  ]);

  return { client, project, minutes, timelineEvent };
}

export async function saveRequirementDraftForProject({ project, draft }: { project: Project; draft: RequirementDraft }): Promise<RequirementDraft> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    setDoc(doc(db, collectionNames.requirementDrafts, draft.id), {
      ...draft,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }),
    updateDoc(doc(db, collectionNames.projects, project.id), {
      nextAction:
        project.approvalStatus === "not-required"
          ? "要件定義ドラフト生成済み。開発タスク確認へ進行可能"
          : "要件定義ドラフト生成済み。石田承認後に開発タスク確認へ進行",
      requirementDraftId: draft.id,
      status: "要件確認中",
      updatedAt: serverTimestamp()
    })
  ]);

  return draft;
}

export async function createRequirementDraftFromMinutes({
  client,
  project,
  minutes
}: {
  client: Client;
  project: Project;
  minutes: MinutesRecord;
}): Promise<RequirementDraft> {
  const draft = generateRequirementDraft({ client, project, minutes });
  return saveRequirementDraftForProject({ project, draft });
}

export async function updateRequirementDraft(draft: RequirementDraft, editorEmail: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.requirementDrafts, draft.id), {
    summary: draft.summary,
    requirements: draft.requirements,
    missingQuestions: draft.missingQuestions,
    demoScope: draft.demoScope,
    screens: draft.screens,
    features: draft.features,
    productionTasks: draft.productionTasks,
    aiRoutes: draft.aiRoutes,
    sourceLabel: "石田修正",
    changeNote: draft.changeNote || "石田修正",
    updatedBy: editorEmail,
    updatedAt: serverTimestamp()
  });
}

export async function approveRequirementDraft({
  draft,
  project,
  approverEmail
}: {
  draft: RequirementDraft;
  project: Project;
  approverEmail: string;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    updateDoc(doc(db, collectionNames.requirementDrafts, draft.id), {
      approvalStatus: "approved",
      approvedBy: approverEmail,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }),
    updateDoc(doc(db, collectionNames.projects, project.id), {
      status: "承認済み",
      nextAction: "要件定義承認済み。Codex進捗と開発タスクを確認",
      requirementDraftId: draft.id,
      updatedAt: serverTimestamp()
    })
  ]);
}

export async function updateWorkTaskStatus({
  taskId,
  status,
  updatedBy
}: {
  taskId: string;
  status: NonNullable<WorkTask["status"]>;
  updatedBy: string;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.workTasks, taskId), {
    status,
    updatedBy,
    updatedAt: serverTimestamp()
  });
}

export async function createProductionTasksForProject({
  project,
  draft,
  createdBy
}: {
  project: Project;
  draft?: RequirementDraft;
  createdBy: string;
}): Promise<WorkTask[]> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  const tasks = createProductionWorkTasks({ project, draft, createdBy });

  await Promise.all([
    ...tasks.map((task) =>
      setDoc(
        doc(db, collectionNames.workTasks, task.id),
        {
          ...task,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    ),
    updateDoc(doc(db, collectionNames.projects, project.id), {
      status: "契約待ち",
      nextAction: "本番化タスク作成済み。契約後、石田承認で実行へ進行",
      updatedAt: serverTimestamp()
    })
  ]);

  return tasks;
}

export async function saveRuleLayer(ruleLayer: RuleLayer, updatedBy: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.ruleLayers, ruleLayer.id),
    {
      ...ruleLayer,
      updatedBy,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveAgentConfig(agentConfig: AgentConfig, updatedBy: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.agentConfigs, agentConfig.id),
    {
      ...agentConfig,
      updatedBy,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveWebsiteAnalysis(analysis: WebsiteAnalysis): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.websiteAnalyses, analysis.id),
    {
      ...analysis,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveMonthlyReport(report: MonthlyReport): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.monthlyReports, report.id),
    {
      ...report,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function updateProjectStatus({
  projectId,
  status,
  nextAction,
  updatedBy
}: {
  projectId: string;
  status: WorkflowStage;
  nextAction: string;
  updatedBy: string;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.projects, projectId), {
    status,
    nextAction,
    updatedBy,
    updatedAt: serverTimestamp()
  });
}

export async function saveEmailTemplate(template: EmailTemplate, updatedBy: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.emailTemplates, template.id),
    {
      ...template,
      updatedBy,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveNotification(notification: NotificationItem): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(
    doc(db, collectionNames.notifications, notification.id),
    {
      ...notification,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveStorageAsset(asset: StorageAsset): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(doc(db, collectionNames.storageAssets, asset.id), { ...asset, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveOpenAiReview(review: OpenAiReview): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(doc(db, collectionNames.openAiReviews, review.id), { ...review, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveCodexCliRun(run: CodexCliRun): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(doc(db, collectionNames.codexCliRuns, run.id), { ...run, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveCodexProgressImport({
  run,
  result,
  progressItems,
  timelineEvent,
  completedTaskIds
}: {
  run: CodexRun;
  result: CodexResult;
  progressItems: DevelopmentProgressItem[];
  timelineEvent: TimelineEvent;
  completedTaskIds: string[];
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    setDoc(doc(db, collectionNames.codexRuns, run.id), { ...run, updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, collectionNames.codexResults, result.id), { ...result, updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, collectionNames.timelineEvents, timelineEvent.id), { ...timelineEvent, updatedAt: serverTimestamp() }, { merge: true }),
    ...progressItems.map((item) => setDoc(doc(db, collectionNames.developmentProgressItems, item.id), { ...item, updatedAt: serverTimestamp() }, { merge: true })),
    ...completedTaskIds.map((taskId) =>
      updateDoc(doc(db, collectionNames.workTasks, taskId), {
        status: "done",
        updatedBy: result.importedBy,
        updatedAt: serverTimestamp()
      })
    )
  ]);
}

export async function saveSnsOperationPlanWithPosts({ plan, posts }: { plan: SnsOperationPlan; posts: SnsPostTask[] }): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    setDoc(doc(db, collectionNames.snsOperationPlans, plan.id), { ...plan, updatedAt: serverTimestamp() }, { merge: true }),
    ...posts.map((post) => setDoc(doc(db, collectionNames.snsPostTasks, post.id), { ...post, updatedAt: serverTimestamp() }, { merge: true }))
  ]);
}

export async function updateSnsPostTask(post: SnsPostTask, updatedBy: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.snsPostTasks, post.id), {
    title: post.title,
    platform: post.platform,
    status: post.status,
    materialStatus: post.materialStatus,
    dueDate: post.dueDate,
    publishDate: post.publishDate,
    owner: post.owner,
    postUrl: post.postUrl ?? "",
    notes: post.notes ?? "",
    revisionHistory: post.revisionHistory,
    updatedBy,
    updatedAt: serverTimestamp()
  });
}

export async function saveQuickCaptureBundle({
  capture,
  timelineEvent,
  tasks
}: {
  capture: QuickCapture;
  timelineEvent: CompanyTimelineEvent;
  tasks: SalesActionTask[];
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    setDoc(doc(db, collectionNames.quickCaptures, capture.id), { ...capture, updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, collectionNames.companyTimelineEvents, timelineEvent.id), { ...timelineEvent, updatedAt: serverTimestamp() }, { merge: true }),
    ...tasks.map((task) => setDoc(doc(db, collectionNames.salesActionTasks, task.id), { ...task, updatedAt: serverTimestamp() }, { merge: true }))
  ]);
}

export async function updateSalesActionTask(task: SalesActionTask, updatedBy: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await updateDoc(doc(db, collectionNames.salesActionTasks, task.id), {
    title: task.title,
    assignee: task.assignee,
    due: task.due,
    status: task.status,
    importance: task.importance,
    updatedBy,
    updatedAt: serverTimestamp()
  });
}

export async function saveCompanyContact(contact: CompanyContact): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(doc(db, collectionNames.companyContacts, contact.id), { ...contact, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveSalesActivity(activity: SalesActivity, timelineEvent: CompanyTimelineEvent): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    setDoc(doc(db, collectionNames.salesActivities, activity.id), { ...activity, updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, collectionNames.companyTimelineEvents, timelineEvent.id), { ...timelineEvent, updatedAt: serverTimestamp() }, { merge: true })
  ]);
}

export async function saveMeetingRecord(meeting: MeetingRecord, timelineEvent: CompanyTimelineEvent): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await Promise.all([
    setDoc(doc(db, collectionNames.meetings, meeting.id), { ...meeting, updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, collectionNames.companyTimelineEvents, timelineEvent.id), { ...timelineEvent, updatedAt: serverTimestamp() }, { merge: true })
  ]);
}

export async function saveMeetingAsset(asset: MeetingAsset): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(doc(db, collectionNames.meetingAssets, asset.id), { ...asset, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveMeetingAnalysis(analysis: MeetingAnalysis): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured.");

  await setDoc(doc(db, collectionNames.meetingAnalyses, analysis.id), { ...analysis, updatedAt: serverTimestamp() }, { merge: true });
}
