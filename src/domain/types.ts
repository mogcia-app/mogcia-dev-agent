export type UserRole = "admin" | "internal" | "sales" | "agency";

export type ApprovalStatus = "not-required" | "pending" | "approved" | "rejected";

export type ProjectSource = "internal" | "agency" | "direct-client";

export type AgentMode = "demo" | "production";

export type AiProvider = "claude" | "codex" | "gemini" | "openai";

export type ProjectKind = "development" | "sns-operation";

export type SnsPlatform = "Instagram" | "TikTok" | "X" | "Facebook" | "YouTube" | "LINE";

export type SnsPostStatus = "未着手" | "企画中" | "作成中" | "確認待ち" | "修正中" | "予約済み" | "投稿済み";

export type MaterialStatus = "未受領" | "一部受領" | "受領済み" | "不要";

export type MonthlyReportStatus = "未作成" | "作成中" | "提出済み";

export type QuickCaptureSource = "web-quick-capture" | "pwa" | "desktop-memo";

export type SalesContactKind = "営業メモ" | "電話" | "商談" | "訪問" | "資料送付" | "メール" | "社内メモ";

export type SalesTaskStatus = "todo" | "doing" | "done";

export type CompanyType = "見込み客" | "商談中" | "既存顧客" | "代理店" | "協力会社" | "失注" | "保留";

export type ContractStatus = "未契約" | "提案中" | "契約待ち" | "契約中" | "終了";

export type SalesActivityKind =
  | "電話"
  | "メール"
  | "訪問"
  | "対面商談"
  | "Google Meet"
  | "Zoom"
  | "その他オンライン会議"
  | "資料送付"
  | "Demo送付"
  | "チャット"
  | "社内メモ"
  | "ステータス変更"
  | "タスク完了"
  | "契約"
  | "失注"
  | "保留";

export type MeetingKind = "Google Meet" | "Zoom" | "Microsoft Teams" | "電話" | "対面" | "その他";

export type MeetingStatus = "予定" | "完了" | "未整理" | "整理済み" | "キャンセル";

export type MeetingUploadType = "テレアポ" | "打ち合わせ";

export type CustomerSegment = "新規" | "既存";

export type MeetingPurpose = "新規提案" | "クロージング" | "関係構築";

export type MeetingOutcomeStatus = "未判定" | "成約" | "失注" | "継続提案" | "保留";

export type MeetingLocation = "先方オフィス" | "Zoom" | "自社会議室" | "電話" | "その他";

export type ConversationSpeaker = "sales" | "customer" | "participant" | "unknown";

export type ProductCategory = "HP" | "LP" | "SNS運用" | "公式LINE" | "システム" | "その他";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  description: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationLog {
  id: string;
  speaker: ConversationSpeaker;
  label: "営業" | "顧客" | "同席者" | "不明";
  text: string;
  startSec?: number;
  endSec?: number;
  sourceSegmentIndexes: number[];
  confidence: number;
}

export interface TranscriptionSegment {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  speaker?: string;
  confidence?: number;
}

export type CrmTaskStatus = "未着手" | "対応中" | "確認待ち" | "顧客待ち" | "保留" | "完了" | "不要";

export type WorkflowStage =
  | "議事録未登録"
  | "要件生成待ち"
  | "要件確認中"
  | "修正依頼"
  | "承認済み"
  | "新規問い合わせ"
  | "ヒアリング予定"
  | "ヒアリング完了"
  | "要件整理中"
  | "承認待ち"
  | "デモ作成中"
  | "デモ完成"
  | "Demo確認待ち"
  | "デモ案内待ち"
  | "デモ確認中"
  | "クライアント確認中"
  | "本番化判断待ち"
  | "見積提出"
  | "商談中"
  | "契約待ち"
  | "契約済み"
  | "制作中"
  | "確認待ち"
  | "納品済み"
  | "完了"
  | "運用中"
  | "保留"
  | "失注"
  | "解約";

export type ServiceKind =
  | "HP制作"
  | "LP制作"
  | "SNS運用"
  | "公式LINE運用"
  | "commo."
  | "tellmo."
  | "Signal."
  | "Roomly."
  | "MOGCIA";

export type AutomationSafety =
  | "draft-only"
  | "approval-required"
  | "auto-allowed";

export type TaskKind =
  | "manual"
  | "automatic"
  | "approval"
  | "email"
  | "demo"
  | "production"
  | "report";

export type TimelineKind =
  | "mail"
  | "task"
  | "meeting"
  | "minutes"
  | "document"
  | "demo"
  | "estimate"
  | "invoice"
  | "development"
  | "sns"
  | "line"
  | "report"
  | "proposal";

export interface Client {
  id: string;
  name: string;
  nameKana?: string;
  industry: string;
  companyType?: CompanyType;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  snsUrl?: string;
  salesOwner?: string;
  leadSource?: string;
  salesStatus?: string;
  contractStatus?: ContractStatus;
  contactName: string;
  services: ServiceKind[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  kind?: ProjectKind;
  source: ProjectSource;
  mode: AgentMode;
  status: WorkflowStage;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  services: ServiceKind[];
  owner: string;
  nextAction: string;
  demoUrl?: string;
  requirementDraftId?: string;
}

export interface SnsOperationPlan {
  id: string;
  projectId: string;
  clientId: string;
  month: string;
  contractPlan: string;
  platforms: SnsPlatform[];
  monthlyPostCount: number;
  materialStatus: MaterialStatus;
  reportStatus: MonthlyReportStatus;
  meetingMemo: string;
  owner: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SnsPostTask {
  id: string;
  planId: string;
  projectId: string;
  clientId: string;
  title: string;
  platform: SnsPlatform;
  status: SnsPostStatus;
  materialStatus: MaterialStatus;
  dueDate: string;
  publishDate: string;
  owner: string;
  postUrl?: string;
  notes?: string;
  revisionHistory: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface QuickCapture {
  id: string;
  rawText: string;
  source: QuickCaptureSource;
  inputBy: string;
  inputAt: string;
  clientId?: string;
  projectId?: string;
  analysis: QuickCaptureAnalysis;
  confirmed: boolean;
}

export interface QuickCaptureAnalysis {
  companyName?: string;
  companyCandidates: Array<{ clientId?: string; name: string; score: number }>;
  projectId?: string;
  contactKind: SalesContactKind;
  facts: string[];
  interests: string[];
  concerns: string[];
  requests: string[];
  promises: string[];
  nextActions: QuickActionDraft[];
  importantInfo: string[];
  salesState?: "見込み" | "保留" | "失注" | "提案中";
  confidence: number;
  unresolved: string[];
}

export interface QuickActionDraft {
  title: string;
  assignee: string;
  due: string;
  importance: "low" | "medium" | "high";
}

export interface SalesActionTask {
  id: string;
  clientId?: string;
  projectId?: string;
  sourceCaptureId: string;
  title: string;
  assignee: string;
  due: string;
  status: SalesTaskStatus;
  importance: "low" | "medium" | "high";
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CompanyTimelineEvent {
  id: string;
  clientId?: string;
  projectId?: string;
  sourceCaptureId?: string;
  kind: SalesContactKind | TimelineKind;
  title: string;
  summary: string;
  eventAt: string;
  createdBy: string;
  source: QuickCaptureSource | "system";
  importantInfo: string[];
}

export interface CompanyContact {
  id: string;
  clientId: string;
  name: string;
  kana?: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  isDecisionMaker: boolean;
  isPrimary: boolean;
  relationship?: string;
  cautions?: string;
  lastContactAt?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SalesActivity {
  id: string;
  clientId: string;
  projectId?: string;
  contactId?: string;
  kind: SalesActivityKind;
  occurredAt: string;
  title: string;
  body: string;
  participants: string[];
  owner: string;
  nextSchedule?: string;
  relatedTaskIds: string[];
  attachmentIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MeetingRecord {
  id: string;
  clientId: string;
  projectId?: string;
  title: string;
  kind: MeetingKind;
  uploadType?: MeetingUploadType;
  calendarEventId?: string;
  productId?: string;
  productName?: string;
  customerSegment?: CustomerSegment;
  meetingPurpose?: MeetingPurpose;
  outcomeStatus?: MeetingOutcomeStatus;
  location?: MeetingLocation;
  startedAt: string;
  endedAt?: string;
  meetingUrl?: string;
  participants: string[];
  mogciaParticipants: string[];
  clientParticipants: string[];
  transcription?: string;
  transcriptionModel?: string;
  conversationLogModel?: string;
  conversationLogs?: ConversationLog[];
  transcriptionLanguage?: string;
  transcriptionDurationSec?: number;
  transcriptionChunkCount?: number;
  transcriptionWasChunked?: boolean;
  manualMemo?: string;
  status: MeetingStatus;
  relatedTaskIds: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface MeetingAsset {
  id: string;
  clientId: string;
  projectId?: string;
  meetingId?: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedBy: string;
  uploadedAt: string;
  kind: "audio" | "video" | "transcription" | "memo" | "other";
}

export interface MeetingAnalysis {
  id: string;
  meetingId: string;
  clientId: string;
  projectId?: string;
  analysisMode?: "pre-meeting" | "post-meeting" | "combined";
  summary: string;
  customerStatements: string[];
  mogciaStatements: string[];
  issues: string[];
  requests: string[];
  concerns: string[];
  importantPoints: string[];
  proposals: string[];
  decisions: string[];
  undecided: string[];
  confirmations: string[];
  nextActions: QuickActionDraft[];
  dealStatusCandidate?: string;
  leadScore?: number;
  leadGrade?: "高" | "中" | "低";
  goodPoints?: string[];
  badPoints?: string[];
  talkFlow?: string[];
  talkScript?: string[];
  preparationItems?: string[];
  objectionHandling?: string[];
  projectCandidate: boolean;
  requirementInput: string[];
  salesNotes: string[];
  status: "ai-candidate" | "confirmed";
  generatedBy: "local-crm-ai" | "claude";
  generatedAt: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface RuleLayer {
  id: string;
  scope: "mogcia" | "service" | "industry" | "client" | "project" | "coding" | "ai";
  name: string;
  priority: number;
  rules: string[];
  prompts?: Partial<Record<AiProvider, string>>;
}

export interface AgentRoute {
  id: string;
  trigger: string;
  provider: AiProvider;
  agentName: string;
  reason: string;
  output: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  provider: AiProvider;
  role: string;
  prompt: string;
  enabled: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

export interface StorageAsset {
  id: string;
  projectId?: string;
  name: string;
  path: string;
  url: string;
  contentType: string;
  size: number;
  kind: "placeholder" | "attachment" | "report";
  uploadedAt: string;
  uploadedBy: string;
}

export interface OpenAiReview {
  id: string;
  projectId?: string;
  title: string;
  input: string;
  summary: string;
  findings: string[];
  improvements: string[];
  createdAt: string;
  createdBy: string;
  generatedBy: "openai" | "local-fallback";
}

export interface CodexCliRun {
  id: string;
  projectId?: string;
  taskTitle: string;
  command: string;
  status: "ready" | "unavailable" | "recorded";
  output: string;
  createdAt: string;
  createdBy: string;
}

export type CodexRunStatus = "queued" | "running" | "completed" | "failed";

export type CodexCheckStatus = "passed" | "failed" | "skipped";

export interface CodexRun {
  id: string;
  projectId: string;
  taskId?: string;
  title: string;
  status: CodexRunStatus;
  startedAt: string;
  finishedAt?: string;
  createdBy: string;
  executor: "codex-cli";
  resultPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodexResult {
  id: string;
  runId: string;
  projectId: string;
  status: "completed" | "failed";
  summary: string;
  completedItems: string[];
  remainingItems: string[];
  changedFiles: string[];
  warnings: string[];
  errors: string[];
  checks: {
    typecheck: CodexCheckStatus;
    lint: CodexCheckStatus;
    build: CodexCheckStatus;
  };
  duration: number;
  rawOutput?: string;
  importedBy: string;
  importedAt: string;
}

export interface DevelopmentProgressItem {
  id: string;
  projectId: string;
  title: string;
  status: "completed" | "remaining";
  source: "codex-result" | "manual";
  sourceRunId?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface WorkTask {
  id: string;
  projectId: string;
  title: string;
  kind: TaskKind;
  due: string;
  safety: AutomationSafety;
  assignee: string;
  description?: string;
  order?: number;
  group?: string;
  previewUrl?: string;
  status?: "todo" | "doing" | "done";
  createdBy?: string;
  createdAt?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  mode: AutomationSafety;
  variables: string[];
  subject: string;
  body?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  kind: "approval" | "demo" | "report" | "system";
  safety: AutomationSafety;
  targetProjectId?: string;
  read: boolean;
  createdAt: string;
  createdBy: string;
}

export interface DemoGuideDraft {
  id: string;
  projectId: string;
  clientId: string;
  taskId: string;
  subject: string;
  body: string;
  generatedBy: "local-sales-agent";
  generatedAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface LocalDemoRun {
  id: string;
  projectId: string;
  clientId: string;
  status: "generated" | "failed";
  demoUrl: string;
  outputPath: string;
  logs: string[];
  safetyChecks?: DemoSafetyCheck[];
  generatedAt: string;
  generatedBy: string;
}

export interface DemoSafetyCheck {
  id: string;
  label: string;
  passed: boolean;
}

export interface WebsiteAnalysis {
  id: string;
  url: string;
  score: number;
  findings: string[];
  improvements: string[];
  demoSuggestion: string;
  createdAt: string;
  createdBy: string;
}

export interface MonthlyReport {
  id: string;
  title: string;
  period: string;
  summary: string;
  nextActions: string[];
  improvements: string[];
  demoSuggestion: string;
  createdAt: string;
  createdBy: string;
}

export interface TimelineEvent {
  id: string;
  clientId: string;
  kind: TimelineKind;
  title: string;
  date: string;
  summary: string;
}

export interface MinutesRecord {
  id: string;
  clientId: string;
  projectId: string;
  content: string;
  registeredBy: string;
  registeredAt: string;
}

export interface RequirementDraft {
  id: string;
  clientId: string;
  projectId: string;
  minutesId: string;
  summary: string;
  requirements: string[];
  missingQuestions: string[];
  demoScope: string[];
  screens: string[];
  features: string[];
  productionTasks: string[];
  aiRoutes: string[];
  generatedBy: "local-rule-engine" | "claude";
  generatedAt: string;
  version?: number;
  sourceLabel?: "AI生成" | "石田修正" | "他メンバー追記";
  changeNote?: string;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}
