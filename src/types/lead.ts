import type { Timestamp } from "firebase/firestore";

export type LeadStatus = "new" | "contacting" | "document_sent" | "appointment" | "meeting" | "considering" | "hold" | "won" | "lost";
export type LeadSort = "updated" | "nextAction" | "lastActivity" | "companyName" | "rank";

export type ActivityType = "call" | "email" | "document" | "meeting" | "telemarketing" | "note" | "status_change" | "other";

export interface Lead {
  id: string;
  companyName: string;
  contactName?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
  industry?: string;
  source?: string;
  productId?: string | null;
  productName?: string | null;
  status: LeadStatus;
  prospectRank?: string;
  appointmentAt?: Timestamp | null;
  nextActionAt?: Timestamp | null;
  nextActionTitle?: string | null;
  lastActivityAt?: Timestamp | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  notes?: string;
  companyId?: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LeadDraft {
  companyName: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  industry: string;
  source: string;
  productId: string;
  productName: string;
  status: LeadStatus;
  prospectRank: string;
  appointmentAt: string;
  nextActionAt: string;
  nextActionTitle: string;
  assignedUserId: string;
  assignedUserName: string;
  notes: string;
  companyId: string;
}

export interface Activity {
  id: string;
  leadId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  type: ActivityType;
  title?: string;
  content?: string;
  productId?: string | null;
  productName?: string | null;
  audioId?: string | null;
  transcriptId?: string | null;
  analysisId?: string | null;
  legacyCompanyActivityLogId?: string | null;
  nextActionAt?: Timestamp | null;
  nextActionTitle?: string | null;
  createdBy: string;
  createdByName?: string;
  occurredAt: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp | null;
}

export interface ActivityDraft {
  type: ActivityType;
  title: string;
  content: string;
  productId: string;
  productName: string;
  occurredAt: string;
  nextActionAt: string;
  nextActionTitle: string;
}
