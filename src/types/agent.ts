import type { Timestamp } from "firebase/firestore";

export type AgentSource = "web" | "desktop" | "cli";
export type AgentIntent =
  | "search_leads"
  | "search_companies"
  | "get_company_summary"
  | "get_lead_summary"
  | "get_today_tasks"
  | "get_upcoming_tasks"
  | "get_calendar"
  | "create_task"
  | "update_task"
  | "get_analysis"
  | "get_meeting_history"
  | "create_activity"
  | "search_products"
  | "development_request"
  | "general";
export type AgentTargetType = "lead" | "company" | "task" | "product" | "analysis" | "project" | "calendar" | "activity" | "none";
export type AgentRequestStatus = "queued" | "running" | "requires_approval" | "completed" | "error" | "cancelled";
export type AgentRunStatus = "queued" | "running" | "requires_approval" | "completed" | "error" | "cancelled";
export type AgentStepType = "plan" | "execute" | "codex" | "review" | "build" | "preview" | "complete";
export type AgentStepStatus = "waiting" | "running" | "success" | "error";
export type AgentNotificationType = "info" | "success" | "warning" | "error" | "approval";

export interface AgentRequest {
  id: string;
  userId: string;
  rawMessage: string;
  status: AgentRequestStatus;
  source: AgentSource;
  intent?: AgentIntent | null;
  targetType?: AgentTargetType | null;
  targetId?: string | null;
  projectId?: string | null;
  createdAt: Timestamp;
}

export interface AgentRunStep {
  type: AgentStepType;
  status: AgentStepStatus;
  message?: string;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
}

export interface AgentResultCard {
  id?: string;
  type?: "lead" | "company" | "task" | "activity" | "calendar" | "product" | "analysis" | "candidate" | "summary";
  title: string;
  subtitle?: string | null;
  body?: string | null;
  href?: string | null;
  tone?: "default" | "success" | "warning" | "error";
  meta?: Array<{ label: string; value: string }>;
}

export interface AgentToolLog {
  toolName: string;
  status: "success" | "error";
  summary: string;
  targetType?: AgentTargetType | null;
  targetId?: string | null;
  executedAt: Timestamp;
  errorMessage?: string | null;
}

export type AgentPendingActionType = "create_task" | "update_task" | "create_activity";

export interface AgentPendingAction {
  type: AgentPendingActionType;
  title: string;
  description?: string | null;
  payload: Record<string, unknown>;
  preview: AgentResultCard[];
}

export interface AgentPendingSelection {
  title: string;
  description?: string | null;
  targetType: "lead" | "company" | "task" | "product" | "project";
  intent: AgentIntent;
  entities?: Record<string, string>;
  candidates: AgentResultCard[];
}

export interface AgentRun {
  id: string;
  userId: string;
  requestId: string;
  title: string;
  status: AgentRunStatus;
  source: AgentSource;
  intent?: AgentIntent | null;
  projectId?: string | null;
  leadId?: string | null;
  companyId?: string | null;
  taskId?: string | null;
  productId?: string | null;
  analysisId?: string | null;
  currentStep?: AgentStepType | null;
  progress?: number | null;
  requiresApproval: boolean;
  createdAt: Timestamp;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  errorMessage?: string | null;
  steps: AgentRunStep[];
  logs?: string[];
  answer?: string | null;
  cards?: AgentResultCard[];
  pendingAction?: AgentPendingAction | null;
  pendingSelection?: AgentPendingSelection | null;
  toolLogs?: AgentToolLog[];
  entities?: Record<string, unknown> | null;
  changeSummary?: string | null;
  reviewSummary?: string | null;
  buildSummary?: string | null;
  previewUrl?: string | null;
}

export interface DevelopmentProject {
  id: string;
  name: string;
  slug: string;
  description?: string;
  repositoryUrl?: string;
  repositoryOwner?: string;
  repositoryName?: string;
  defaultBranch?: string;
  projectKey?: string;
  requiredCapabilities?: string[];
  validationCommands?: string[];
  framework?: string;
  packageManager?: string;
  productionUrl?: string;
  previewUrl?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DevelopmentWorkerStatus = "online" | "offline" | "busy" | "disabled";

export interface DevelopmentWorker {
  id: string;
  name: string;
  deviceId?: string | null;
  userId: string;
  status: DevelopmentWorkerStatus;
  hostname?: string | null;
  os?: string | null;
  architecture?: string | null;
  capabilities: string[];
  lastSeenAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DevelopmentJobStatus = "queued" | "assigned" | "running" | "reviewing" | "completed" | "failed" | "cancelled";

export interface DevelopmentJobResult {
  summary?: string;
  changedFiles?: string[];
  diff?: string;
  insertions?: number;
  deletions?: number;
  branchName?: string;
  commitSha?: string | null;
  codexOutput?: string;
  validationResults?: Array<{ command: string; status: "success" | "error"; output?: string }>;
  requiresUserAction?: boolean;
}

export interface DevelopmentJob {
  id: string;
  runId: string;
  requestId: string;
  projectId: string;
  userId: string;
  title: string;
  instruction: string;
  status: DevelopmentJobStatus;
  requiredCapabilities: string[];
  assignedWorkerId?: string | null;
  branchName?: string | null;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  result?: DevelopmentJobResult | null;
  errorMessage?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProjectMemory {
  projectId: string;
  productOverview?: string;
  architecture?: string;
  designRules?: string;
  codingRules?: string;
  decisions?: string;
  notes?: string;
  updatedAt: Timestamp;
}

export interface AgentNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: AgentNotificationType;
  runId?: string | null;
  projectId?: string | null;
  targetUrl?: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface CreateAgentRequestInput {
  rawMessage: string;
  projectId?: string | null;
  targetType?: AgentTargetType | null;
  targetId?: string | null;
  intent?: AgentIntent | null;
}

export interface CreateDevelopmentProjectInput {
  name: string;
  slug: string;
  description?: string;
  repositoryUrl?: string;
  repositoryOwner?: string;
  repositoryName?: string;
  defaultBranch?: string;
  framework?: string;
  packageManager?: string;
  productionUrl?: string;
  previewUrl?: string;
  isActive?: boolean;
  projectKey?: string;
  requiredCapabilities?: string[];
  validationCommands?: string[];
}
