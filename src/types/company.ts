import type { Timestamp } from "firebase/firestore";

export type CompanyStatus = "lead" | "prospect" | "customer" | "inactive" | "archived";
export type CustomerRank = "A" | "B" | "C" | "D" | "dormant";
export type CompanyTab = "overview" | "timeline" | "deals" | "meetings" | "tasks" | "files" | "notes";
export type ActivityLogType = "phone" | "email" | "chat" | "visit" | "meeting" | "deal" | "memo" | "task_created" | "task_completed" | "file" | "status_change" | "ai_task" | "other";
export type ActivityDirection = "outbound" | "inbound" | "internal" | "unknown";
export type ContactMethod = "phone" | "email" | "chat";

export interface Company {
  id: string;
  name: string;
  nameKana?: string;
  logoUrl?: string | null;
  industry?: string;
  companyType?: string;
  postalCode?: string;
  address?: string;
  prefecture?: string;
  city?: string;
  region?: string;
  phone?: string;
  email?: string;
  website?: string;
  employeeCount?: string;
  foundedAt?: string;
  revenueRange?: string;
  status: CompanyStatus;
  customerRank?: CustomerRank;
  internalOwnerId?: string;
  internalOwnerName?: string;
  companionUserIds?: string[];
  companionNames?: string[];
  productIds?: string[];
  productNames?: string[];
  productSalesContext?: CompanyProductSalesContext;
  decisionInfo?: CompanyDecisionInfo;
  contacts?: CompanyContactPerson[];
  primaryContactId?: string | null;
  primaryContactName?: string | null;
  tags: string[];
  favoriteUserIds: string[];
  lastContactAt?: Timestamp | null;
  nextActionAt?: Timestamp | null;
  nextActionTitle?: string | null;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
}

export type DealFinalResult = "none" | "contracted" | "considering" | "lost" | "not_target";

export interface CompanyDecisionInfo {
  decisionMakerName?: string;
  decisionMakerRole?: string;
  decisionMakerContacted?: boolean;
  budgetRange?: string;
  budgetYear?: string;
  implementationTiming?: string;
  competitors?: string[];
  approvalConditions?: string[];
}

export interface CompanyProductSalesContext {
  commo?: CommoCompanyContext;
}

export interface CommoCompanyContext {
  facilityScale?: string;
  currentLineUsage?: string;
  otaDependency?: string;
  existingCrm?: string;
  reservationManagement?: string;
  repeatCustomerStatus?: string;
  dormantCustomerStatus?: string;
  operationOwner?: string;
}

export interface CompanyContactPerson {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  contactMethods?: ContactMethod[];
}

export interface CompanyActivityLog {
  id: string;
  companyId: string;
  type: ActivityLogType;
  title: string;
  content?: string;
  occurredAt: Timestamp;
  userId: string;
  userName?: string;
  direction?: ActivityDirection;
  actorUserIds?: string[];
  actorNames?: string[];
  contactIds?: string[];
  contactNames?: string[];
  contactNote?: string;
  dealId?: string | null;
  meetingId?: string | null;
  taskId?: string | null;
  fileId?: string | null;
  attachments?: Array<{ id: string; name: string; url: string; storagePath?: string }>;
  nextAction?: { title: string; dueAt?: Timestamp | null; assigneeId?: string | null } | null;
  aiTaskRequested?: boolean;
  aiTaskGeneratedIds?: string[];
  source: "manual" | "meeting" | "task" | "email" | "calendar" | "system" | "ai";
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompanyMeeting {
  id: string;
  companyId: string;
  companyName?: string;
  title: string;
  startAt: Timestamp;
  endAt?: Timestamp | null;
  meetingType: "in_person" | "online" | "phone" | "visit" | "other";
  productIds?: string[];
  productNames?: string[];
  contactIds?: string[];
  contactNames?: string[];
  participants?: string[];
  summary?: string;
  customerQuotes?: string[];
  problems?: string[];
  proposals?: string[];
  objections?: string[];
  decisions?: string[];
  nextActions?: string[];
  source: "upload" | "manual" | "calendar";
  uploadedRecording: boolean;
  aiTaskRequested: boolean;
  generatedTaskIds?: string[];
  dealFinalResult?: DealFinalResult;
  manualEvaluation?: CompanyManualEvaluation;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompanyManualEvaluation {
  lossReason?: string;
  contractReason?: string;
  noPotentialReason?: string;
  effectiveProposal?: string;
  ineffectiveProposal?: string;
  trueCustomerIssue?: string;
  salesFeeling?: string;
  aiEvaluation?: string;
  adoptedSalesRule?: string;
  source?: "manual" | "ai" | "confirmed";
}

export interface CompanyFile {
  id: string;
  name: string;
  type: "proposal" | "estimate" | "contract" | "minutes" | "recording" | "image" | "invoice" | "other";
  url: string;
  storagePath?: string;
  size?: number;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
}

export interface CompanyMemo {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
