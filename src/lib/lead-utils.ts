import type { ActivityType, LeadDraft, LeadStatus } from "@/types/lead";

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "新規",
  contacting: "対応中",
  document_sent: "資料請求",
  appointment: "アポ獲得",
  meeting: "商談中",
  considering: "検討中",
  hold: "保留",
  won: "成約",
  lost: "失注"
};

export const activityTypeLabels: Record<ActivityType, string> = {
  call: "電話",
  email: "メール",
  document: "資料送付",
  meeting: "打ち合わせ",
  telemarketing: "テレアポ",
  note: "メモ",
  status_change: "ステータス変更",
  other: "その他"
};

export const leadStatusOptions = Object.entries(leadStatusLabels) as Array<[LeadStatus, string]>;
export const leadCreateStatusOptions: Array<[LeadStatus, string]> = [
  ["appointment", leadStatusLabels.appointment],
  ["document_sent", leadStatusLabels.document_sent]
];
export const activityTypeOptions = Object.entries(activityTypeLabels) as Array<[ActivityType, string]>;

export function createEmptyLeadDraft(): LeadDraft {
  return {
    companyName: "",
    contactName: "",
    contactRole: "",
    phone: "",
    email: "",
    industry: "",
    source: "",
    productId: "",
    productName: "",
    status: "appointment",
    prospectRank: "",
    appointmentAt: "",
    nextActionAt: "",
    nextActionTitle: "",
    assignedUserId: "",
    assignedUserName: "",
    notes: "",
    companyId: ""
  };
}

export function leadStatusTone(status: LeadStatus): string {
  if (status === "won") return "bg-[#F3FAF0] text-[#5E9B61]";
  if (status === "lost") return "bg-[#F5ECEE] text-[#888]";
  if (status === "appointment" || status === "meeting") return "bg-[#FFF0F3] text-[#EC6F8B]";
  if (status === "hold" || status === "considering") return "bg-[#FFF8E8] text-[#9B7332]";
  return "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]";
}

export function toDatetimeLocalInput(date?: Date | null): string {
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function formatMaybeDate(date?: Date | null): string {
  if (!date) return "未設定";
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}
