import type { ActivityType, LeadDraft, LeadStatus } from "@/types/lead";

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "新規",
  contacting: "追っかけ",
  document_sent: "資料請求",
  sent: "送付済",
  appointment: "アポ獲得",
  meeting: "打ち合わせ中",
  considering: "検討中",
  hold: "連絡待ち",
  won: "契約",
  lost: "失注"
};

export const leadActivityStatusOptions: Array<[LeadStatus | "", string]> = [
  ["won", "契約"],
  ["lost", "失注"],
  ["contacting", "追っかけ"],
  ["hold", "連絡待ち"],
  ["", "その他"]
];

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
  ["document_sent", leadStatusLabels.document_sent],
  ["sent", leadStatusLabels.sent]
];
export const activityTypeOptions = Object.entries(activityTypeLabels) as Array<[ActivityType, string]>;

export function createEmptyLeadDraft(): LeadDraft {
  return {
    companyName: "",
    contactName: "",
    contactRole: "",
    phone: "",
    email: "",
    website: "",
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
    lostReason: "",
    companyId: ""
  };
}

export function leadStatusTone(status: LeadStatus): string {
  if (status === "appointment" || status === "meeting") return "bg-[#EC2F7A] text-white";
  if (status === "document_sent" || status === "sent") return "bg-[#FF8A3D] text-white";
  if (status === "contacting") return "bg-[#6E3F4D] text-white";
  if (status === "hold") return "bg-[#FFE45C] text-[#6B5200] ring-1 ring-[#E8C72D]";
  if (status === "considering") return "bg-[#2F80ED] text-white";
  if (status === "won") return "bg-[#22A06B] text-white";
  if (status === "lost") return "bg-[#242424] text-white";
  return "bg-[#F7F7F7] text-[#555] ring-1 ring-[#D9D9D9]";
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
