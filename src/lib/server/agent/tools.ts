import "server-only";

import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { timestampToIso } from "@/lib/desktop/format";
import { getAdminDb } from "@/lib/firebase/admin";
import { createActivity as createBusinessActivity, listActivitiesByCompanyId, listActivitiesByLeadId } from "@/lib/server/business/activity-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { getCompanyById, listCompanies, searchCompanies as searchBusinessCompanies } from "@/lib/server/business/company-service";
import { getLeadById, listLeads, searchLeads as searchBusinessLeads } from "@/lib/server/business/lead-service";
import { getProductById, listProducts, searchProducts as searchBusinessProducts } from "@/lib/server/business/product-service";
import { createTask as createBusinessTask, listTasks, updateTask as updateBusinessTask } from "@/lib/server/business/task-service";
import type { AgentPendingAction, AgentResultCard, AgentTargetType, AgentToolLog } from "@/types/agent";

type ToolUser = { uid: string; name?: string };
export type EntityCandidate = { id: string; name: string; subtitle?: string; href: string; data?: DocumentData };
type ToolResult<T> = { data: T; log: Omit<AgentToolLog, "executedAt"> };

const OPEN_TASK_STATUSES = new Set(["todo", "in_progress", "waiting"]);

export async function searchLeads(input: { query?: string; productName?: string; status?: string; limit?: number }): Promise<ToolResult<EntityCandidate[]>> {
  const auth = toolAuth({ uid: "agent" });
  const product = normalize(input.productName ?? "");
  const leads = input.query ? await searchBusinessLeads(auth, input.query, { limit: 240 }) : await listLeads(auth, { limit: 240 });
  const results = leads
    .filter((lead) => !product || normalize(String(lead.productName ?? "")).includes(product))
    .filter((lead) => !input.status || lead.status === input.status)
    .slice(0, input.limit ?? 20)
    .map((lead) => ({
      id: String(lead.id),
      name: String(lead.companyName ?? "名称未設定"),
      subtitle: [lead.productName, lead.status, lead.prospectRank].filter(Boolean).join(" / "),
      href: `/leads?leadId=${lead.id}`,
      data: lead
    }));
  return success("searchLeads", `${results.length}件の見込み客候補を取得しました。`, results, "lead");
}

export async function getLead(leadId: string): Promise<ToolResult<DocumentData | null>> {
  const lead = await getLeadById(toolAuth({ uid: "agent" }), leadId).catch(() => null);
  return success("getLead", lead ? "見込み客を取得しました。" : "見込み客が見つかりませんでした。", lead, "lead", leadId);
}

export async function searchCompanies(input: { query?: string; productName?: string; limit?: number }): Promise<ToolResult<EntityCandidate[]>> {
  const auth = toolAuth({ uid: "agent" });
  const product = normalize(input.productName ?? "");
  const companies = input.query ? await searchBusinessCompanies(auth, input.query, { limit: 240 }) : await listCompanies(auth, { limit: 240 });
  const results = companies
    .filter((company) => !product || normalize(Array.isArray(company.productNames) ? company.productNames.join(" ") : "").includes(product))
    .slice(0, input.limit ?? 20)
    .map((company) => ({
      id: String(company.id),
      name: String(company.name ?? "名称未設定"),
      subtitle: [company.status, company.customerRank, Array.isArray(company.productNames) ? company.productNames.join(" / ") : ""].filter(Boolean).join(" / "),
      href: `/companies?companyId=${company.id}`,
      data: company
    }));
  return success("searchCompanies", `${results.length}件の会社候補を取得しました。`, results, "company");
}

export async function getCompany(companyId: string): Promise<ToolResult<DocumentData | null>> {
  const company = await getCompanyById(toolAuth({ uid: "agent" }), companyId).catch(() => null);
  return success("getCompany", company ? "会社を取得しました。" : "会社が見つかりませんでした。", company, "company", companyId);
}

export async function getCompanyActivities(companyId: string, count = 20): Promise<ToolResult<DocumentData[]>> {
  const rows = await listActivitiesByCompanyId(toolAuth({ uid: "agent" }), companyId, { limit: count, includeLegacy: true });
  return success("getCompanyActivities", `${rows.length}件の活動履歴を取得しました。`, rows, "company", companyId);
}

export async function getLeadActivities(leadId: string, count = 20): Promise<ToolResult<DocumentData[]>> {
  const rows = await listActivitiesByLeadId(toolAuth({ uid: "agent" }), leadId, { limit: count });
  return success("getLeadActivities", `${rows.length}件の見込み客活動履歴を取得しました。`, rows, "lead", leadId);
}

export async function getTasks(input: { userId: string; leadId?: string | null; companyId?: string | null; from?: Date; to?: Date; includeCompleted?: boolean; limit?: number }): Promise<ToolResult<DocumentData[]>> {
  const rows = (await listTasks(toolAuth({ uid: input.userId }), { includeCompleted: input.includeCompleted ?? false, limit: Math.max(input.limit ?? 40, 260), from: input.from, to: input.to }))
    .filter((task) => input.includeCompleted || OPEN_TASK_STATUSES.has(String(task.status ?? "")))
    .filter((task) => !input.leadId || task.leadId === input.leadId)
    .filter((task) => !input.companyId || task.companyId === input.companyId)
    .filter((task) => !input.from || dateMillis(task.dueDate) >= input.from.getTime())
    .filter((task) => !input.to || dateMillis(task.dueDate) <= input.to.getTime())
    .slice(0, input.limit ?? 40);
  return success("getTasks", `${rows.length}件のタスクを取得しました。`, rows, "task");
}

export async function createTask(input: DocumentData, user: ToolUser): Promise<ToolResult<{ id: string }>> {
  const result = await createBusinessTask(toolAuth(user), {
    title: stringValue(input.title) || "フォロー対応",
    description: stringValue(input.description),
    status: "todo",
    priority: validPriority(input.priority),
    source: "ai",
    aiGenerated: true,
    aiReason: "Agent承認により作成",
    sourceType: "other",
    sourceId: null,
    assigneeId: user.uid,
    assigneeName: user.name ?? "",
    collaboratorIds: [],
    collaboratorNames: [],
    createdBy: user.uid,
    createdByName: user.name ?? "",
    companyId: nullableString(input.companyId),
    companyName: nullableString(input.companyName),
    leadId: nullableString(input.leadId),
    leadName: nullableString(input.leadName),
    productId: nullableString(input.productId),
    productName: nullableString(input.productName),
    projectId: null,
    projectName: null,
    meetingId: null,
    meetingTitle: null,
    dueDate: timestampToIso(dateOrNull(input.dueDate)),
    completedAt: null,
    checklist: [],
    comments: stringValue(input.comments),
    progressLogs: [{
      id: `log-${Date.now()}`,
      type: "created",
      title: "Agent承認によりタスクを作成しました",
      content: "",
      userId: user.uid,
      userName: user.name ?? "",
      createdAt: Timestamp.now()
    }],
    force: true
  });
  const taskId = String(result.taskId ?? result.id ?? "");
  return success("createTask", "承認されたタスクを作成しました。", { id: taskId }, "task", taskId);
}

export async function updateTask(input: DocumentData, user: ToolUser): Promise<ToolResult<{ id: string }>> {
  const taskId = stringValue(input.taskId);
  if (!taskId) throw new Error("更新対象のタスクが不明です。");
  const patch: DocumentData = { id: taskId };
  if (input.status === "completed" || input.status === "todo" || input.status === "in_progress" || input.status === "waiting" || input.status === "cancelled") {
    patch.status = input.status;
  }
  if (typeof input.title === "string" && input.title.trim()) patch.title = input.title.trim();
  if (typeof input.dueDate === "string" && input.dueDate.trim()) patch.dueDate = input.dueDate;
  await updateBusinessTask(toolAuth(user), patch);
  return success("updateTask", "承認されたタスク更新を実行しました。", { id: taskId }, "task", taskId);
}

export async function getCalendarEvents(input: { from: Date; to: Date; userId: string }): Promise<ToolResult<DocumentData[]>> {
  const rows = (await listCalendarEvents(toolAuth({ uid: input.userId }), { limit: 240, visibleOnly: false }))
    .filter((event) => dateMillis(event.startAt) >= input.from.getTime() && dateMillis(event.startAt) <= input.to.getTime());
  return success("getCalendarEvents", `${rows.length}件の予定を取得しました。`, rows, "calendar");
}

export async function getAnalysis(input: { leadId?: string | null; companyId?: string | null; limit?: number }): Promise<ToolResult<DocumentData[]>> {
  const snapshot = await getAdminDb().collection("teleapoRecords").orderBy("createdAt", "desc").limit(160).get();
  const rows = snapshot.docs
    .map((entry): DocumentData => ({ id: entry.id, ...entry.data() }))
    .filter((record) => !input.leadId || record.leadId === input.leadId)
    .filter((record) => !input.companyId || record.companyId === input.companyId)
    .slice(0, input.limit ?? 10);
  return success("getAnalysis", `${rows.length}件の分析・音声情報を取得しました。`, rows, "analysis");
}

export async function getMeetingHistory(input: { leadId?: string | null; companyId?: string | null; limit?: number }): Promise<ToolResult<DocumentData[]>> {
  const analysis = await getAnalysis(input);
  const activities = input.leadId ? await getLeadActivities(input.leadId, 20) : input.companyId ? await getCompanyActivities(input.companyId, 20) : success("getMeetingHistory", "", [], "analysis");
  const rows = [...analysis.data, ...activities.data.filter((entry) => String(entry.type ?? "").includes("meeting") || String(entry.title ?? "").includes("商談"))].slice(0, input.limit ?? 12);
  return success("getMeetingHistory", `${rows.length}件の商談・テレアポ情報を取得しました。`, rows, "analysis");
}

export async function summarizeMeetingAndTeleapo(input: { leadId?: string | null; companyId?: string | null; limit?: number }): Promise<ToolResult<DocumentData[]>> {
  const snapshot = await getAdminDb().collection("teleapoRecords").orderBy("recordedAt", "desc").limit(180).get();
  const rows = snapshot.docs
    .map((entry): DocumentData => ({ id: entry.id, ...entry.data() }))
    .filter((record) => !input.leadId || record.leadId === input.leadId)
    .filter((record) => !input.companyId || record.companyId === input.companyId)
    .slice(0, input.limit ?? 8)
    .map((record) => {
      const advice = record.aiAdvice && typeof record.aiAdvice === "object" ? record.aiAdvice as DocumentData : {};
      const diagnosis = record.diagnosisSheet && typeof record.diagnosisSheet === "object" ? record.diagnosisSheet as DocumentData : {};
      return {
        id: record.id,
        salesDomain: record.salesDomain ?? "teleapo",
        customerName: record.customerName ?? "",
        contactName: record.contactName ?? "",
        productName: record.productName ?? "",
        callResult: record.callResult ?? "",
        nextContactType: record.nextContactType ?? "",
        recordedAt: record.recordedAt ?? record.createdAt ?? null,
        summary: stringValue(advice.summary) || stringValue(record.meetingMemo) || stringValue(record.reactionMemo) || shortText(record.transcriptText),
        customerIssues: stringArray(advice.customerIssues ?? advice.problems ?? diagnosis.biggestIssue),
        positives: stringArray(advice.positives ?? advice.positiveCustomerSignals ?? diagnosis.resonatedPoint),
        concerns: stringArray(advice.negatives ?? advice.hesitationSignals ?? diagnosis.concerns),
        nextActions: stringArray(advice.nextActions ?? diagnosis.nextAction),
        temperature: diagnosis.temperature ?? "",
        finalResult: diagnosis.finalResult ?? "",
        closeProbability: diagnosis.closeProbability ?? "",
        followUpReason: advice.followUpReason ?? "",
        followupTiming: advice.followupTiming ?? ""
      };
    });
  return success("summarizeMeetingAndTeleapo", `${rows.length}件の商談・テレアポ要約を取得しました。`, rows, "analysis");
}

export async function createActivity(input: DocumentData, user: ToolUser): Promise<ToolResult<{ id: string; legacyCompanyActivityLogId?: string | null }>> {
  const result = await createBusinessActivity(toolAuth(user), {
    leadId: nullableString(input.leadId),
    companyId: nullableString(input.companyId),
    dealId: null,
    type: input.type,
    title: stringValue(input.title) || "Agent活動ログ",
    content: stringValue(input.content),
    productId: nullableString(input.productId),
    productName: nullableString(input.productName),
    audioId: null,
    transcriptId: null,
    analysisId: null,
    nextActionAt: timestampToIso(dateOrNull(input.nextActionAt)),
    nextActionTitle: nullableString(input.nextActionTitle),
    occurredAt: timestampToIso(dateOrNull(input.occurredAt)) ?? new Date().toISOString(),
    force: true
  });
  const activityId = String(result.activityId ?? result.id ?? "");
  return success("createActivity", "承認された活動ログを作成しました。", { id: activityId, legacyCompanyActivityLogId: result.activityLogId ?? null }, "activity", activityId);
}

export async function searchProducts(input: { query?: string; limit?: number }): Promise<ToolResult<EntityCandidate[]>> {
  const auth = toolAuth({ uid: "agent" });
  const products = input.query ? await searchBusinessProducts(auth, input.query, { limit: 120 }) : await listProducts(auth, { limit: 120 });
  const results = products
    .slice(0, input.limit ?? 20)
    .map((product) => ({
      id: String(product.id),
      name: String(product.displayName ?? product.name ?? "名称未設定"),
      subtitle: [product.status, product.tagline].filter(Boolean).join(" / "),
      href: `/products?productId=${product.id}`,
      data: product
    }));
  return success("searchProducts", `${results.length}件の商材候補を取得しました。`, results, "product");
}

export async function getProduct(productId: string): Promise<ToolResult<DocumentData | null>> {
  const product = await getProductById(toolAuth({ uid: "agent" }), productId).catch(() => null);
  return success("getProduct", product ? "商材を取得しました。" : "商材が見つかりませんでした。", product, "product", productId);
}

export function createPendingAction(input: AgentPendingAction): AgentPendingAction {
  return input;
}

export function toCard(candidate: EntityCandidate, type: AgentResultCard["type"]): AgentResultCard {
  return {
    id: candidate.id,
    type,
    title: candidate.name,
    subtitle: candidate.subtitle ?? null,
    href: candidate.href,
    meta: []
  };
}

function success<T>(toolName: string, summary: string, data: T, targetType?: AgentTargetType, targetId?: string): ToolResult<T> {
  return { data, log: { toolName, status: "success", summary, targetType: targetType ?? null, targetId: targetId ?? null } };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[.。・]/g, "");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const next = stringValue(value);
  return next || null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function shortText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
}

function validPriority(value: unknown): string {
  return value === "high" || value === "low" ? value : "medium";
}

export function dateOrNull(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Timestamp.fromDate(value);
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

export function dateMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

function toolAuth(user: ToolUser): BusinessAuth {
  return {
    db: getAdminDb(),
    userId: user.uid,
    userName: user.name ?? "",
    source: "web",
    deviceId: null
  };
}
