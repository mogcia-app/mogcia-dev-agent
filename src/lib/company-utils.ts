import { Timestamp } from "firebase/firestore";
import type { ActivityLogType, Company, CompanyStatus, CustomerRank } from "@/types/company";

export const companyStatusLabels: Record<CompanyStatus, string> = {
  lead: "見込み",
  prospect: "商談中",
  customer: "取引先",
  inactive: "休眠",
  archived: "アーカイブ"
};

export const customerRankLabels: Record<CustomerRank, string> = {
  A: "A（重要顧客）",
  B: "B（見込み高）",
  C: "C（通常）",
  D: "D（低見込み）",
  dormant: "休眠"
};

export const activityTypeLabels: Record<ActivityLogType, string> = {
  phone: "電話",
  email: "メール",
  visit: "訪問",
  meeting: "打ち合わせ",
  deal: "商談",
  memo: "メモ",
  task_created: "タスク作成",
  task_completed: "タスク完了",
  file: "ファイル",
  status_change: "ステータス変更",
  ai_task: "AIタスク",
  other: "その他"
};

export function activityTone(type: ActivityLogType): string {
  if (type === "meeting" || type === "deal") return "bg-[#F7F1FF] text-[#8C61CF]";
  if (type === "phone" || type === "visit") return "bg-[#F3FAF0] text-[#5E9B61]";
  if (type === "email") return "bg-[#EEF5FF] text-[#4F78B4]";
  if (type === "memo") return "bg-[#FFF6EA] text-[#D7791F]";
  if (type === "task_created" || type === "task_completed" || type === "ai_task") return "bg-[#FFF0F3] text-[#EC6F8B]";
  return "bg-[#F5F5F5] text-[#6E6E6E]";
}

export function createEmptyCompany(user: { id: string; name: string }): Omit<Company, "id"> {
  const now = Timestamp.now();
  return {
    name: "",
    nameKana: "",
    logoUrl: null,
    industry: "",
    companyType: "",
    postalCode: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    employeeCount: "",
    foundedAt: "",
    revenueRange: "",
    status: "lead",
    customerRank: "C",
    internalOwnerId: user.id,
    internalOwnerName: user.name,
    primaryContactId: null,
    primaryContactName: "",
    tags: [],
    favoriteUserIds: [],
    lastContactAt: null,
    nextActionAt: null,
    nextActionTitle: "",
    notes: "",
    createdBy: user.id,
    createdByName: user.name,
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}
