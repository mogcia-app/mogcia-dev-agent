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
export type AnalysisPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";

export interface ConversationLog {
  id: string;
  speaker: TeleapoSpeaker;
  text: string;
  startSec?: number | null;
  endSec?: number | null;
}

export interface EvidenceItem {
  text: string;
  sourceQuote: string;
  confidence: number;
}

export interface IssueItem {
  title: string;
  detail: string;
  priority: AnalysisPriority;
  evidence: string;
  confirmationQuestion: string;
  proposalConnection: string;
}

export interface ProposalItem {
  title: string;
  score: number;
  reason: string;
  talkPoint: string;
}

export interface MaterialItem {
  name: string;
  priority: AnalysisPriority;
  purpose: string;
  timing: string;
  pages: string[];
}

export interface QuestionItem {
  question: string;
  purpose: string;
  expectedAnswers: string[];
  followUps: string[];
}

export interface ScriptBranch {
  condition: string;
  response: string;
  nextAction: string;
}

export interface ScriptSection {
  minutes: string;
  objective: string;
  script: string[];
  questions: string[];
  materials: string[];
  branches: ScriptBranch[];
  cautions: string[];
}

export interface ObjectionItem {
  objection: string;
  probability: number;
  background: string;
  badResponse: string;
  recommendedResponse: string;
  followUpQuestion: string;
}

export interface AnalysisTaskItem {
  title: string;
  owner: string;
  dueDate: string;
  priority: AnalysisPriority;
  status: TaskStatus;
  relatedMaterials: string[];
  completionCondition: string;
  aiCanGenerate: boolean;
  manualRequired: string[];
}

export interface MeetingPreparationAnalysis {
  overview: {
    companyName: string;
    contactName: string;
    contactRole: string;
    industry: string;
    productName: string;
    callDate: string;
    audioDuration: string;
    nextMeetingDate: string;
    meetingStatus: string;
    salesRep: string;
    companyLink: string;
  };
  prospectScore: {
    rank: ProspectRank;
    score: number;
    estimatedCloseProbability: number;
    temperature: ProspectTemperature;
    temperatureLabel: string;
    meetingConversionStrength: string;
    followUpTiming: string;
    nextMeetingTiming: string;
    reason: string;
    positiveSignals: EvidenceItem[];
    negativeSignals: EvidenceItem[];
    missingInformation: string[];
  };
  contactAnalysis: {
    type: string[];
    decisionStyle: string;
    salesResistance: string;
    numericalInterest: string;
    comprehensionLevel: string;
    conversationControl: string;
    interestedTopics: string[];
    weakReactionTopics: string[];
    communicationRecommendations: string[];
    avoid: string[];
    evidence: EvidenceItem[];
    confidence: number;
  };
  issues: {
    explicit: IssueItem[];
    essential: IssueItem[];
    latent: IssueItem[];
  };
  proposalStrategy: {
    mainTheme: string;
    winningApproach: string[];
    proposalPriority: ProposalItem[];
    avoidProposals: string[];
    recommendedCaseStudies: string[];
    recommendedMaterials: MaterialItem[];
    firstFeature: string;
    firstMaterial: string;
    metricsToShow: string[];
    cautions: string[];
  };
  schedulingCall: {
    opening: string;
    previousCallReference: string;
    purposeConfirmation: string;
    dateProposalScript: string;
    durationGuide: string;
    participantConfirmation: string;
    meetingFormatConfirmation: string;
    questionResponses: ScriptBranch[];
    voicemail: string;
    retryCall: string;
    closing: string;
  };
  preparation: {
    objectives: string[];
    requiredResearch: AnalysisTaskItem[];
    requiredMaterials: MaterialItem[];
    optionalMaterials: MaterialItem[];
    avoidMaterials: MaterialItem[];
    requiredNumbers: string[];
    requiredDemos: string[];
    internalChecks: string[];
    meetingGoal: string;
    mustDecideByEnd: string[];
  };
  questions: {
    required: QuestionItem[];
    deepDive: QuestionItem[];
    numerical: QuestionItem[];
    decision: QuestionItem[];
    closing: QuestionItem[];
  };
  meetingScript: {
    opening: ScriptSection;
    hearing: ScriptSection;
    issueSummary: ScriptSection;
    proposal: ScriptSection;
    demo: ScriptSection;
    pricing: ScriptSection;
    closing: ScriptSection;
  };
  openingTalk: string;
  proposalTalk: string;
  objections: ObjectionItem[];
  closingTalk: {
    high: string;
    middle: string;
    low: string;
  };
  riskPoints: Array<{
    title: string;
    reason: string;
    prevention: string;
  }>;
  winningPoints: string[];
  nextActions: AnalysisTaskItem[];
  generatedAt: string;
  sources: string[];
}

export interface TeleapoAdvice {
  summary: string;
  temperature: ProspectTemperature;
  temperatureReason?: string;
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
  meetingPreparation?: MeetingPreparationAnalysis;
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
  companyAddress?: string;
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
    meetingPhase?: "first" | "second" | "pre_contract" | "continued" | "";
    temperature?: "S" | "A" | "B" | "C" | "";
    biggestIssue?: string;
    resonatedPoint?: string;
    concerns?: string;
    nextProposal?: string;
    closeProbability?: string;
    nextAction?: string;
    finalResult?: "none" | "contracted" | "considering" | "lost" | "not_target";
    lossReason?: string;
    contractReason?: string;
    noPotentialReason?: string;
    effectiveProposal?: string;
    ineffectiveProposal?: string;
    trueCustomerIssue?: string;
    salesFeeling?: string;
    aiEvaluation?: string;
    adoptedSalesRule?: string;
  };
  audioFilePath?: string | null;
  audioDownloadUrl?: string | null;
  audioDurationSec?: number | null;
  transcriptionStatus: TranscriptionStatus;
  transcriptionModel: string;
  transcriptText?: string;
  conversationLogs: ConversationLog[];
  conversationLogsLocked?: boolean;
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
