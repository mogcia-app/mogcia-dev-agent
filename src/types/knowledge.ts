import type { Timestamp } from "firebase/firestore";

export type KnowledgeType = "meeting_note" | "sales_talk" | "objection" | "success_case" | "loss_reason" | "faq" | "industry" | "competitor" | "operation" | "customer_voice" | "internal" | "other";
export type KnowledgeSource = "manual" | "meeting" | "call" | "memo" | "document" | "email" | "ai";
export type KnowledgeVisibility = "team" | "sales" | "admin" | "private";
export type KnowledgeStatus = "active" | "archived";
export type KnowledgeSort = "newest" | "oldest" | "updated" | "views" | "favorite";

export interface Knowledge {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  type: KnowledgeType;
  customerQuote?: string;
  possibleBackground?: string[];
  learnings?: string[];
  effectiveResponses?: string[];
  avoidResponses?: string[];
  nextActions?: string[];
  objectionData?: {
    objection?: string;
    background?: string[];
    responseExample?: string;
    followUpQuestions?: string[];
    avoidPhrases?: string[];
  };
  successCaseData?: {
    beforeProblems?: string[];
    actions?: string[];
    results?: string[];
    successFactors?: string[];
    reusablePoints?: string[];
  };
  lossData?: {
    lossReason?: string;
    customerComment?: string;
    factors?: string[];
    improvements?: string[];
    futureWarnings?: string[];
  };
  productIds: string[];
  productNames?: string[];
  companyId?: string | null;
  companyName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  meetingId?: string | null;
  meetingTitle?: string | null;
  dealId?: string | null;
  dealName?: string | null;
  tags: string[];
  source: KnowledgeSource;
  sourceId?: string | null;
  sourceType?: string | null;
  aiGenerated: boolean;
  aiReason?: string | null;
  visibility: KnowledgeVisibility;
  viewCount: number;
  favoriteUserIds: string[];
  searchKeywords: string[];
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  status: KnowledgeStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
}

export interface KnowledgeDraft {
  title: string;
  type: KnowledgeType;
  summary: string;
  content: string;
  customerQuote: string;
  possibleBackground: string;
  learnings: string;
  effectiveResponses: string;
  avoidResponses: string;
  nextActions: string;
  objection: string;
  objectionBackground: string;
  responseExample: string;
  followUpQuestions: string;
  avoidPhrases: string;
  lossReason: string;
  lossFactors: string;
  improvements: string;
  futureWarnings: string;
  beforeProblems: string;
  successActions: string;
  results: string;
  successFactors: string;
  reusablePoints: string;
  productIds: string[];
  productNames: string[];
  companyId: string;
  companyName: string;
  projectId: string;
  projectName: string;
  meetingId: string;
  meetingTitle: string;
  tags: string;
  visibility: KnowledgeVisibility;
}
