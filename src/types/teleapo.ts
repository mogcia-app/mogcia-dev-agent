import type { Timestamp } from "firebase/firestore";

export type SalesDomain = "teleapo" | "meeting";
export type TeleapoSpeaker = "sales" | "customer" | "participant" | "unknown";
export type CallPurpose = "first_appointment" | "document_followup" | "inquiry" | "referral_call";
export type CallResult = "appointment" | "considering" | "document_sent" | "no_answer" | "rejected" | "reception_blocked";
export type NextContactType = "none" | "followup_call" | "email" | "meeting_scheduled";
export type TranscriptionStatus = "draft" | "uploaded" | "extracting" | "transcribing" | "diarizing" | "completed" | "failed";
export type AiAdviceStatus = "idle" | "running" | "completed" | "failed";
export type ProspectTemperature = "high" | "middle" | "low";
export type ProspectRank = "A" | "B+" | "B" | "B-" | "C";
export type NextActionUrgency = "today" | "next_business_day" | "within_3_days" | "next_week" | "long_term" | "none";
export type FollowUpMethod = "phone" | "email" | "chat" | "meeting" | "none";

export interface ConversationLog {
  id: string;
  speaker: TeleapoSpeaker;
  text: string;
  startSec?: number | null;
  endSec?: number | null;
}

export interface TeleapoAdvice {
  summary: string;
  temperature: ProspectTemperature;
  prospectRank: ProspectRank;
  prospectScore: number;
  rankReason: string;
  scoreReason: string;
  nextActionUrgency: NextActionUrgency;
  customerIssues: string[];
  concerns: string[];
  meetingWarnings: string[];
  meetingQuestions: string[];
  scheduleCallScript: {
    candidates: Array<{ label: string; datetime: string; reason: string }>;
    script: string;
  };
  meetingScript: {
    greeting: string[];
    hearing: string[];
    issue整理: string[];
    proposal: string[];
    qa: string[];
    nextAction: string[];
  };
  materials: string[];
  nextActions: string[];
  positives?: string[];
  negatives?: string[];
  positiveCustomerSignals?: string[];
  hesitationSignals?: string[];
  closingRequirements?: string[];
  missingInformation?: string[];
  requiredMaterials?: string[];
  gapFromTeleapo?: string[];
  closeReasons?: string[];
  lostRisks?: string[];
  shouldFollowUp?: boolean;
  followUpReason?: string;
  followUpMethod?: FollowUpMethod;
  shouldFollowupCall?: boolean;
  shouldFollowupEmail?: boolean;
  followupTiming?: string;
  followupTimingReason?: string;
  followupCallScript?: string;
  followupEmail?: string;
  nextMeetingQuestions?: string[];
  additionalMaterials?: string[];
}

export interface TeleapoRecord {
  id: string;
  companyId?: string | null;
  userId: string;
  userName?: string;
  salesDomain: SalesDomain;
  sourceTeleapoId?: string | null;
  customerName: string;
  contactName: string;
  productId?: string | null;
  productName: string;
  customerType: "new";
  callPurpose?: CallPurpose;
  callResult?: CallResult;
  nextContactType?: NextContactType;
  recordedAt: Timestamp;
  calendarEventId?: string | null;
  attendeeUserIds?: string[];
  attendeeNames?: string[];
  industry?: string;
  role?: string;
  phone?: string;
  leadSource?: string;
  memo?: string;
  expectedIssue?: string;
  reactionMemo?: string;
  location?: string;
  meetingTitle?: string;
  meetingMemo?: string;
  diagnosisSheet?: {
    temperature?: "S" | "A" | "B" | "C" | "";
    biggestIssue?: string;
    resonatedPoint?: string;
    concerns?: string;
    nextProposal?: string;
    closeProbability?: string;
    nextAction?: string;
  };
  audioFilePath?: string | null;
  audioDownloadUrl?: string | null;
  audioDurationSec?: number | null;
  transcriptionStatus: TranscriptionStatus;
  transcriptionModel: string;
  transcriptText?: string;
  conversationLogs: ConversationLog[];
  aiAdviceStatus: AiAdviceStatus;
  aiAdviceModel?: string | null;
  aiAdvice?: TeleapoAdvice | null;
  aiAdviceError?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductKnowledge {
  id: string;
  name: string;
  overview?: string;
  targetCustomer?: string;
  issues?: string;
  valueProposition?: string;
  pricing?: string;
  objections?: string;
  faq?: string;
  successTalk?: string;
  ngTalk?: string;
  proposalMaterials?: string;
  caseMaterials?: string;
}
