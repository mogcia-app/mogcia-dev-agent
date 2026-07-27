import type { Timestamp } from "firebase-admin/firestore";
import type { DesktopCompanyResult, DesktopTask } from "@/types/desktop";

export function timestampToIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value as Timestamp).toDate().toISOString();
  }
  return null;
}

export function toDesktopTask(id: string, data: FirebaseFirestore.DocumentData): DesktopTask {
  return {
    id,
    title: String(data.title ?? ""),
    description: typeof data.description === "string" ? data.description : "",
    status: String(data.status ?? "todo"),
    priority: String(data.priority ?? "medium"),
    source: String(data.source ?? "manual"),
    companyId: data.companyId ?? null,
    companyName: data.companyName ?? null,
    dueDate: timestampToIso(data.dueDate)
  };
}

export function toDesktopCompany(id: string, data: FirebaseFirestore.DocumentData): DesktopCompanyResult {
  return {
    id,
    name: String(data.name ?? ""),
    industry: data.industry ?? "",
    primaryContactName: data.primaryContactName ?? "",
    internalOwnerName: data.internalOwnerName ?? "",
    lastContactAt: timestampToIso(data.lastContactAt)
  };
}

export function startOfTokyoToday(): Date {
  const formatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+09:00`);
}

export function endOfTokyoToday(): Date {
  const end = startOfTokyoToday();
  end.setHours(23, 59, 59, 999);
  return end;
}

export function priorityWeight(priority: string): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
