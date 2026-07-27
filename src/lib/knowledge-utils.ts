import { Timestamp } from "firebase/firestore";
import type { Knowledge, KnowledgeDraft, KnowledgeSource, KnowledgeType, KnowledgeVisibility } from "@/types/knowledge";

export const knowledgeTypeLabels: Record<KnowledgeType, string> = {
  meeting_note: "商談メモ",
  sales_talk: "営業トーク",
  objection: "反論対応",
  success_case: "成功事例",
  loss_reason: "失注理由",
  faq: "FAQ",
  industry: "業界知識",
  competitor: "競合情報",
  operation: "運用ノウハウ",
  customer_voice: "顧客発言",
  internal: "社内ナレッジ",
  other: "その他"
};

export const sourceLabels: Record<KnowledgeSource, string> = {
  manual: "手動作成",
  meeting: "会議",
  call: "通話",
  memo: "メモ",
  document: "資料",
  email: "メール",
  ai: "AI作成"
};

export const visibilityLabels: Record<KnowledgeVisibility, string> = {
  team: "社内全体",
  sales: "営業担当のみ",
  admin: "管理者のみ",
  private: "自分のみ"
};

export function typeTone(type: KnowledgeType) {
  if (type === "meeting_note" || type === "customer_voice") return "bg-[#FFF0F3] text-[#EC6F8B]";
  if (type === "sales_talk") return "bg-[#EEF5FF] text-[#4F78B4]";
  if (type === "objection") return "bg-[#F7F1FF] text-[#8C61CF]";
  if (type === "success_case") return "bg-[#F3FAF0] text-[#5E9B61]";
  if (type === "loss_reason") return "bg-[#FFF0F0] text-[#D94F6E]";
  if (type === "faq") return "bg-[#FFF6EA] text-[#D7791F]";
  if (type === "operation") return "bg-[#ECFBF6] text-[#3D9D88]";
  return "bg-[#F5F5F5] text-[#6E6E6E]";
}

export function emptyKnowledgeDraft(): KnowledgeDraft {
  return {
    title: "",
    type: "meeting_note",
    summary: "",
    content: "",
    customerQuote: "",
    possibleBackground: "",
    learnings: "",
    effectiveResponses: "",
    avoidResponses: "",
    nextActions: "",
    objection: "",
    objectionBackground: "",
    responseExample: "",
    followUpQuestions: "",
    avoidPhrases: "",
    lossReason: "",
    lossFactors: "",
    improvements: "",
    futureWarnings: "",
    beforeProblems: "",
    successActions: "",
    results: "",
    successFactors: "",
    reusablePoints: "",
    productIds: [],
    productNames: [],
    companyId: "",
    companyName: "",
    projectId: "",
    projectName: "",
    meetingId: "",
    meetingTitle: "",
    tags: "",
    visibility: "team"
  };
}

export function knowledgeToDraft(knowledge: Knowledge): KnowledgeDraft {
  return {
    title: knowledge.title,
    type: knowledge.type,
    summary: knowledge.summary ?? "",
    content: knowledge.content ?? "",
    customerQuote: knowledge.customerQuote ?? "",
    possibleBackground: toLines(knowledge.possibleBackground),
    learnings: toLines(knowledge.learnings),
    effectiveResponses: toLines(knowledge.effectiveResponses),
    avoidResponses: toLines(knowledge.avoidResponses),
    nextActions: toLines(knowledge.nextActions),
    objection: knowledge.objectionData?.objection ?? "",
    objectionBackground: toLines(knowledge.objectionData?.background),
    responseExample: knowledge.objectionData?.responseExample ?? "",
    followUpQuestions: toLines(knowledge.objectionData?.followUpQuestions),
    avoidPhrases: toLines(knowledge.objectionData?.avoidPhrases),
    lossReason: knowledge.lossData?.lossReason ?? "",
    lossFactors: toLines(knowledge.lossData?.factors),
    improvements: toLines(knowledge.lossData?.improvements),
    futureWarnings: toLines(knowledge.lossData?.futureWarnings),
    beforeProblems: toLines(knowledge.successCaseData?.beforeProblems),
    successActions: toLines(knowledge.successCaseData?.actions),
    results: toLines(knowledge.successCaseData?.results),
    successFactors: toLines(knowledge.successCaseData?.successFactors),
    reusablePoints: toLines(knowledge.successCaseData?.reusablePoints),
    productIds: knowledge.productIds,
    productNames: knowledge.productNames ?? [],
    companyId: knowledge.companyId ?? "",
    companyName: knowledge.companyName ?? "",
    projectId: knowledge.projectId ?? "",
    projectName: knowledge.projectName ?? "",
    meetingId: knowledge.meetingId ?? "",
    meetingTitle: knowledge.meetingTitle ?? "",
    tags: knowledge.tags.join(", "),
    visibility: knowledge.visibility
  };
}

export function draftToKnowledgePayload(draft: KnowledgeDraft, user: { id: string; name: string }) {
  const tags = draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const searchKeywords = buildSearchKeywords({ ...draft, tags: tags.join(" "), createdByName: user.name });
  return {
    title: draft.title.trim(),
    type: draft.type,
    summary: draft.summary.trim(),
    content: draft.content.trim(),
    customerQuote: draft.customerQuote.trim(),
    possibleBackground: fromLines(draft.possibleBackground),
    learnings: fromLines(draft.learnings),
    effectiveResponses: fromLines(draft.effectiveResponses),
    avoidResponses: fromLines(draft.avoidResponses),
    nextActions: fromLines(draft.nextActions),
    objectionData: {
      objection: draft.objection.trim(),
      background: fromLines(draft.objectionBackground),
      responseExample: draft.responseExample.trim(),
      followUpQuestions: fromLines(draft.followUpQuestions),
      avoidPhrases: fromLines(draft.avoidPhrases)
    },
    successCaseData: {
      beforeProblems: fromLines(draft.beforeProblems),
      actions: fromLines(draft.successActions),
      results: fromLines(draft.results),
      successFactors: fromLines(draft.successFactors),
      reusablePoints: fromLines(draft.reusablePoints)
    },
    lossData: {
      lossReason: draft.lossReason.trim(),
      factors: fromLines(draft.lossFactors),
      improvements: fromLines(draft.improvements),
      futureWarnings: fromLines(draft.futureWarnings)
    },
    productIds: draft.productIds,
    productNames: draft.productNames,
    companyId: draft.companyId || null,
    companyName: draft.companyName || null,
    projectId: draft.projectId || null,
    projectName: draft.projectName || null,
    meetingId: draft.meetingId || null,
    meetingTitle: draft.meetingTitle || null,
    tags,
    source: "manual" as const,
    aiGenerated: false,
    aiReason: null,
    visibility: draft.visibility,
    searchKeywords,
    updatedBy: user.id,
    updatedByName: user.name
  };
}

export function createKnowledgePayload(draft: KnowledgeDraft, user: { id: string; name: string }) {
  return {
    ...draftToKnowledgePayload(draft, user),
    viewCount: 0,
    favoriteUserIds: [],
    status: "active" as const,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    archivedAt: null
  };
}

export function toLines(value?: string[]): string {
  return (value ?? []).join("\n");
}

export function fromLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function buildSearchKeywords(input: { title: string; summary: string; content: string; tags: string; productNames: string[]; companyName: string; projectName: string; meetingTitle: string; createdByName: string }) {
  return [input.title, input.summary, input.content, input.tags, input.productNames.join(" "), input.companyName, input.projectName, input.meetingTitle, input.createdByName]
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 80);
}
