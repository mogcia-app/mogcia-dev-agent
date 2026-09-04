import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { DesktopApiError, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { timestampToIso } from "@/lib/desktop/format";
import { inferCalendarFieldsFromText, normalizeCalendarEventFields } from "@/lib/calendar-normalization";
import { createActivity as createBusinessActivity, deleteActivity, listActivitiesByCompanyId, listActivitiesByLeadId, searchActivities, toDesktopActivityPayload } from "@/lib/server/business/activity-service";
import { createCalendarEventFromDesktopDraft } from "@/lib/server/business/calendar-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { createCompany, deleteCompany, getCompanyDeletionImpact, searchCompanies, toDesktopCompanyPayload } from "@/lib/server/business/company-service";
import { changeLeadStatus, createLead as createBusinessLead, deleteLead, getLeadById, getLeadDeletionImpact, linkLeadToCompany as linkBusinessLeadToCompany, normalizeLeadStatus as normalizeBusinessLeadStatus, searchLeads, toDesktopLeadPayload, updateLead as updateBusinessLead, updateLeadWebsiteUrl } from "@/lib/server/business/lead-service";
import { createProduct as createBusinessProduct, deleteProduct, getProductById, getProductDeletionImpact, searchProducts, toDesktopProductPayload, updateProduct as updateBusinessProduct } from "@/lib/server/business/product-service";
import { changeTaskDueDate, changeTaskPriority, completeTask, createTask as createBusinessTask, reopenTask, searchTasks, toDesktopTaskPayload, updateTask as updateBusinessTask } from "@/lib/server/business/task-service";
import { normalizeComparableName } from "@/lib/server/duplicate-utils";
import { getUserDisplayNameById } from "@/lib/user-display";

type DesktopAuth = {
  db: FirebaseFirestore.Firestore;
  userId: string;
};

export type CommandKind = "calendar" | "task" | "company" | "lead" | "activity" | "product" | "notification" | "business_query";

export type CalendarDraft = {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  description: string;
  companyId: string;
  companyName: string;
  attendeeIds: string[];
  attendeeNames: string[];
  productName: string;
  contactName: string;
  leadId: string;
  eventType: string;
  meetingMethod: string;
};

type TaskCommandAction = "create" | "search" | "complete" | "reopen" | "dueDate" | "priority";
type LeadCommandAction = "create" | "search" | "detail" | "update" | "delete" | "status" | "website" | "linkCompany" | "activities" | "activity" | "calendar";
type ProductCommandAction = "create" | "search" | "detail" | "update" | "delete";
type ActivityCommandAction = "create" | "search" | "company" | "lead" | "delete";
export type DesktopCommandResult = {
  handled: boolean;
  kind: CommandKind;
  message: string;
  items: unknown[];
  draft: Record<string, unknown> | null;
  executedAction?: string | null;
  refreshRequired?: boolean;
  error?: Record<string, unknown> | null;
};
type ResolveLeadResult = { lead: DocumentData } | { response: DesktopCommandResult };
type ResolveProductResult = { product: DocumentData } | { response: DesktopCommandResult };

export async function handleDesktopCommand(auth: DesktopAuth, body: Record<string, unknown>): Promise<DesktopCommandResult> {
  const rawMessage = readMessage(body);
  const kind = detectKind(body, rawMessage);

  if (kind === "calendar") {
    const draft = await buildCalendarDraft(auth, body, rawMessage);
    return { handled: true, kind: "calendar" as const, message: "予定内容を確認しました", items: [], draft };
  }
  if (kind === "company") return handleCompanyCommand(auth, body, rawMessage);
  if (kind === "task") return createTaskFromCommand(auth, body, rawMessage);
  if (kind === "product") return handleProductCommand(auth, body, rawMessage);
  if (kind === "activity") return handleActivityCommand(auth, body, rawMessage);
  if (kind === "lead") return handleLeadCommand(auth, body, rawMessage);
  if (kind === "notification") return handleNotificationCommand(auth, body, rawMessage);
  return searchBusiness(auth, rawMessage || optionalString(body.q, "検索キーワード", 120));
}

export async function commitCalendarDraft(auth: DesktopAuth, body: Record<string, unknown>) {
  const draftSource = valueObject(body.draft) ?? body;
  requireString(draftSource.title, "予定タイトル", 200);
  const created = await createCalendarEventFromDesktopDraft(toBusinessAuth(auth), { draft: draftSource, force: body.force === true || draftSource.force === true });
  if (created.requiresConfirmation) {
    throw new DesktopApiError("DUPLICATE", "同じ予定が既に登録されている可能性があります", 409);
  }
  return { eventId: created.calendarEventId, message: "予定を登録しました", targetURL: "/calendar", executedAction: "calendar.create", refreshRequired: true };
}

export async function searchBusiness(auth: DesktopAuth, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return { handled: true, kind: "business_query" as const, message: "検索キーワードを入力してください", items: [], draft: null };
  const [companies, leads, products, tasks] = await Promise.all([
    searchCompanies(toBusinessAuth(auth), keyword, { limit: 20 }),
    searchLeads(toBusinessAuth(auth), keyword, { limit: 20 }),
    searchProducts(toBusinessAuth(auth), keyword, { limit: 20 }),
    searchTasks(toBusinessAuth(auth), keyword, { limit: 20, includeCompleted: true })
  ]);
  const items = [
    ...companies.map((company) => ({ type: "company", ...toDesktopCompanyPayload(company) })),
    ...leads.map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })),
    ...products.map((product) => ({ type: "product", ...toDesktopProductPayload(product) })),
    ...tasks.map((task) => ({ type: "task", ...toDesktopTaskPayload(task) }))
  ].slice(0, 20);
  return { handled: true, kind: "business_query" as const, message: items.length ? "検索結果を取得しました" : "該当する業務データは見つかりませんでした", items, draft: null };
}

function detectKind(body: Record<string, unknown>, rawMessage: string): CommandKind {
  const explicit = String(body.kind ?? body.intent ?? body.type ?? "").toLowerCase();
  if (isCommandKind(explicit)) return explicit;
  if (/(予定|カレンダー|スケジュール|訪問|打ち合わせ|商談|面談|会議|ミーティング)/.test(rawMessage)) return "calendar";
  if (/(タスク|TODO|やること|依頼|宿題)/i.test(rawMessage)) return "task";
  if (/(会社|企業|取引先|顧客)/.test(rawMessage) && /(登録|追加|作成|削除|消して|変更|更新)/.test(rawMessage)) return "company";
  if (/(見込み客|リード|営業リスト)/.test(rawMessage)) return "lead";
  if (/(営業ログ|活動ログ|対応履歴|履歴|メモ)/.test(rawMessage)) return "activity";
  if (/(商品|商材|プロダクト|サービス)/.test(rawMessage)) return "product";
  if (/(通知|既読|完了|削除)/.test(rawMessage)) return "notification";
  return "business_query";
}

async function buildCalendarDraft(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<CalendarDraft> {
  const explicit = valueObject(body.draft) ?? body;
  const companyName = optionalString(explicit.companyName, "会社名", 200) || extractCompanyName(rawMessage);
  const company = companyName ? await findCompanyByName(auth, companyName) : null;
  const startAt = parseIsoDate(explicit.startAt, "開始日時") ?? parseDateFromText(rawMessage) ?? new Date(Date.now() + 60 * 60 * 1000);
  const endAt = parseIsoDate(explicit.endAt, "終了日時") ?? new Date(startAt.getTime() + 60 * 60 * 1000);
  const inferredFields = inferCalendarFieldsFromText(rawMessage);
  const normalizedFields = normalizeCalendarEventFields({
    eventType: optionalString(explicit.eventType, "予定種別", 80) || inferredFields.eventType,
    meetingMethod: optionalString(explicit.meetingMethod, "実施方法", 80) || inferredFields.meetingMethod,
    meetingUrl: explicit.meetingUrl
  });
  const title = optionalString(explicit.title, "予定タイトル", 200) || buildCalendarTitle(rawMessage, company?.name ?? companyName, normalizedFields.eventType);
  return {
    title,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    allDay: Boolean(explicit.allDay),
    description: optionalString(explicit.description, "説明", 3000),
    companyId: company?.id ?? (optionalString(explicit.companyId, "会社ID", 160) || ""),
    companyName: company?.name ?? companyName,
    attendeeIds: [],
    attendeeNames: [],
    productName: optionalString(explicit.productName, "商品名", 200),
    contactName: optionalString(explicit.contactName, "担当者名", 120),
    leadId: optionalString(explicit.leadId, "見込み客ID", 160),
    eventType: normalizedFields.eventType,
    meetingMethod: normalizedFields.meetingMethod
  };
}

async function handleCompanyCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  if (/(削除|消して)/.test(rawMessage) || body.action === "delete") return handleCompanyDeleteCommand(auth, body, rawMessage);
  return createCompanyFromCommand(auth, body, rawMessage);
}

async function createCompanyFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const name = optionalString(body.name, "会社名", 200) || extractNameAfter(rawMessage, /(会社|企業|取引先|顧客)/) || rawMessage.replace(/(会社|企業|取引先|顧客|登録|追加|作成)/g, "").trim();
  if (!name) return { handled: true, kind: "company" as const, message: "会社名を入力してください", items: [], draft: null };
  const result = await createCompany(toBusinessAuth(auth), {
    ...body,
    name,
    nameKana: optionalString(body.nameKana, "フリガナ", 200),
    industry: optionalString(body.industry, "業種", 120),
    companyType: optionalString(body.companyType, "会社種別", 120),
    postalCode: optionalString(body.postalCode, "郵便番号", 40),
    prefecture: optionalString(body.prefecture, "都道府県", 120),
    city: optionalString(body.city, "市区町村", 120),
    region: optionalString(body.region, "地域", 120),
    address: optionalString(body.address, "住所", 500),
    phone: optionalString(body.phone, "電話番号", 80),
    email: optionalString(body.email, "メールアドレス", 160),
    website: optionalString(body.website, "Webサイト", 300),
    status: optionalString(body.status, "状態", 40),
    primaryContactId: optionalString(body.primaryContactId, "主担当者ID", 160) || null,
    primaryContactName: optionalString(body.primaryContactName, "担当者名", 120) || null,
    notes: optionalString(body.notes, "メモ", 5000)
  });
  if (result.requiresConfirmation) return { handled: true, kind: "company" as const, message: "同じ会社が既に登録されている可能性があります", items: result.duplicates ?? [], draft: { name } };
  return { handled: true, kind: "company" as const, message: "会社を登録しました", items: [{ id: result.companyId, name }], draft: null, executedAction: "company.create", refreshRequired: true };
}

async function handleCompanyDeleteCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const businessAuth = toBusinessAuth(auth);
  const companyId = optionalString(body.companyId, "会社ID", 160);
  if (companyId && body.confirmed === true) {
    await deleteCompany(businessAuth, companyId);
    return { handled: true, kind: "company" as const, message: "会社を削除しました", items: [{ id: companyId, type: "company" }], draft: null, executedAction: "company.delete", refreshRequired: true };
  }
  if (companyId) {
    const impact = await getCompanyDeletionImpact(businessAuth, companyId);
    return {
      handled: true,
      kind: "company" as const,
      message: `削除前の確認が必要です。関連タスク${impact.tasksCount}件、予定${impact.calendarEventsCount}件、活動${impact.activitiesCount}件、営業リスト${impact.leadsCount}件があります。削除してよいか確認してください。`,
      items: [{ type: "company", id: companyId, deletionImpact: impact }],
      draft: { action: "delete_company", companyId, confirmationRequired: true, confirmationPayload: impact }
    };
  }
  const query = optionalString(body.companyName, "会社名", 200) || extractNameAfter(rawMessage, /(会社|企業|取引先|顧客)/) || rawMessage.replace(/(会社|企業|取引先|顧客|削除|消して|して|ください)/g, "").trim();
  if (!query) return { handled: true, kind: "company" as const, message: "削除する会社名を入力してください", items: [], draft: null };
  const candidates = await searchCompanies(businessAuth, query, { limit: 5 });
  if (!candidates.length) {
    return { handled: true, kind: "company" as const, message: "削除対象の会社が見つかりませんでした。会社名を指定してもう一度入力してください。", items: [], draft: null };
  }
  if (candidates.length !== 1) {
    return { handled: true, kind: "company" as const, message: "削除対象の会社を選んでください", items: candidates.map((company) => ({ type: "company", ...toDesktopCompanyPayload(company) })), draft: { action: "delete_company", query, candidateEntities: candidates.map(toDesktopCompanyPayload) } };
  }
  const company = candidates[0];
  const impact = await getCompanyDeletionImpact(businessAuth, String(company.id ?? ""));
  return {
    handled: true,
    kind: "company" as const,
    message: `削除前の確認が必要です。関連タスク${impact.tasksCount}件、予定${impact.calendarEventsCount}件、活動${impact.activitiesCount}件、営業リスト${impact.leadsCount}件があります。削除してよいか確認してください。`,
    items: [{ type: "company", ...toDesktopCompanyPayload(company), deletionImpact: impact }],
    draft: { action: "delete_company", companyId: company.id, companyName: company.name, confirmationRequired: true, confirmationPayload: impact }
  };
}

async function createTaskFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const action = detectTaskAction(body, rawMessage);
  if (action !== "create") return handleTaskUpdateOrSearch(auth, body, rawMessage, action);
  const title = optionalString(body.title, "タスクタイトル", 200) || rawMessage.replace(/(タスク|TODO|作成|追加|登録)/gi, "").trim();
  if (!title) return { handled: true, kind: "task" as const, message: "タスク内容を入力してください", items: [], draft: null };
  const dueDate = parseIsoDate(body.dueDate, "期限") ?? parseDateFromText(rawMessage);
  const created = await createBusinessTask(toBusinessAuth(auth), {
    title,
    description: optionalString(body.description, "説明", 3000),
    status: "todo",
    priority: body.priority === "high" || body.priority === "low" ? body.priority : "medium",
    companyId: optionalString(body.companyId, "会社ID", 160) || null,
    companyName: optionalString(body.companyName, "会社名", 200) || null,
    leadId: optionalString(body.leadId, "営業リストID", 160) || null,
    leadName: optionalString(body.leadName, "営業リスト名", 200) || null,
    productId: optionalString(body.productId, "商品ID", 160) || null,
    productName: optionalString(body.productName, "商品名", 200) || null,
    dueDate: dueDate ? dueDate.toISOString() : null,
    force: body.force === true
  });
  if (created.requiresConfirmation) return { handled: true, kind: "task" as const, message: "同じタスクが既に登録されている可能性があります", items: created.duplicates ?? [], draft: { title } };
  return { handled: true, kind: "task" as const, message: "タスクを登録しました", items: [{ id: created.taskId, title }], draft: null, executedAction: "task.create", refreshRequired: true };
}

async function handleTaskUpdateOrSearch(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string, action: TaskCommandAction) {
  const businessAuth = toBusinessAuth(auth);
  const explicitTaskId = optionalString(body.taskId ?? body.id, "タスクID", 160);
  const query = optionalString(body.query, "検索キーワード", 200) || extractTaskQuery(rawMessage);
  const candidates = explicitTaskId ? [] : await searchTasks(businessAuth, query, { limit: 8, includeCompleted: true });
  const targetId = explicitTaskId || (candidates.length === 1 ? String(candidates[0].id ?? "") : "");
  if (!targetId) {
    return {
      handled: true,
      kind: "task" as const,
      message: candidates.length > 1 ? "候補が複数あります。対象のタスクを選んでください。" : "対象のタスクが見つかりませんでした。",
      items: candidates.map((task) => ({ type: "task", ...toDesktopTaskPayload(task) })),
      draft: { action, query }
    };
  }
  if (action === "complete") {
    if (body.confirmed !== true) return { handled: true, kind: "task" as const, message: "このタスクを完了にしますか？", items: [{ type: "task", id: targetId }], draft: { action: "complete_task", taskId: targetId, confirmationRequired: true } };
    await completeTask(businessAuth, targetId);
    return { handled: true, kind: "task" as const, message: "タスクを完了しました", items: [{ type: "task", id: targetId }], draft: null, executedAction: "task.complete", refreshRequired: true };
  }
  if (action === "reopen") {
    if (body.confirmed !== true) return { handled: true, kind: "task" as const, message: "このタスクを未完了に戻しますか？", items: [{ type: "task", id: targetId }], draft: { action: "reopen_task", taskId: targetId, confirmationRequired: true } };
    await reopenTask(businessAuth, targetId);
    return { handled: true, kind: "task" as const, message: "タスクを未完了に戻しました", items: [{ type: "task", id: targetId }], draft: null, executedAction: "task.reopen", refreshRequired: true };
  }
  if (action === "dueDate") {
    const dueDate = parseIsoDate(body.dueDate, "期限") ?? parseDateFromText(rawMessage);
    if (!dueDate) return { handled: true, kind: "task" as const, message: "変更後の期限を入力してください", items: [{ type: "task", id: targetId }], draft: { action, taskId: targetId } };
    await changeTaskDueDate(businessAuth, targetId, dueDate.toISOString());
    return { handled: true, kind: "task" as const, message: "タスクの期限を変更しました", items: [{ type: "task", id: targetId, dueDate: dueDate.toISOString() }], draft: null, executedAction: "task.due_date_change", refreshRequired: true };
  }
  if (action === "priority") {
    const priority = normalizeTaskPriorityFromText(body.priority, rawMessage);
    if (body.confirmed !== true) return { handled: true, kind: "task" as const, message: "タスクの優先度を変更しますか？", items: [{ type: "task", id: targetId, priority }], draft: { action: "change_task_priority", taskId: targetId, priority, confirmationRequired: true } };
    await changeTaskPriority(businessAuth, targetId, priority);
    return { handled: true, kind: "task" as const, message: "タスクの優先度を変更しました", items: [{ type: "task", id: targetId, priority }], draft: null, executedAction: "task.priority_change", refreshRequired: true };
  }
  const tasks = await searchTasks(businessAuth, query, { limit: 8, includeCompleted: true });
  return { handled: true, kind: "task" as const, message: tasks.length ? "タスクを検索しました" : "該当するタスクは見つかりませんでした", items: tasks.map((task) => ({ type: "task", ...toDesktopTaskPayload(task) })), draft: null };
}

async function handleProductCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const action = detectProductAction(body, rawMessage);
  if (action === "create") return createProductFromCommand(auth, body, rawMessage);
  if (action === "delete") return handleProductDeleteCommand(auth, body, rawMessage);
  if (action === "update") return handleProductUpdateCommand(auth, body, rawMessage);
  if (action === "detail") return handleProductDetailCommand(auth, body, rawMessage);
  return searchProductsFromCommand(auth, body, rawMessage);
}

async function createProductFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const name = optionalString(body.name, "商品名", 200) || rawMessage.replace(/(商品|商材|プロダクト|サービス|登録|追加|作成)/g, "").trim();
  if (!name) return { handled: true, kind: "product" as const, message: "商品名を入力してください", items: [], draft: null };
  const result = await createBusinessProduct(toBusinessAuth(auth), {
    ...body,
    name,
    displayName: optionalString(body.displayName, "表示名", 200) || name,
    productType: optionalString(body.productType, "商品種別", 80) || "other",
    tagline: optionalString(body.tagline, "一言説明", 300),
    summary: optionalString(body.summary ?? body.description, "概要", 5000)
  });
  if (result.requiresConfirmation) return { handled: true, kind: "product" as const, message: "同じ商品が既に登録されている可能性があります", items: result.duplicates ?? [], draft: { name } };
  return { handled: true, kind: "product" as const, message: "商品を登録しました", items: [{ id: result.productId, name }], draft: null, executedAction: "product.create", refreshRequired: true };
}

async function searchProductsFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const products = await productCandidates(auth, body, rawMessage);
  return { handled: true, kind: "product" as const, message: products.length ? "商材を検索しました" : "該当する商材は見つかりませんでした", items: products.map((product) => ({ type: "product", ...toDesktopProductPayload(product) })), draft: null };
}

async function handleProductDetailCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const resolved = await resolveSingleProduct(auth, body, rawMessage, "get_product_detail");
  if ("response" in resolved) return resolved.response;
  return { handled: true, kind: "product" as const, message: "商材詳細を取得しました", items: [{ type: "product", ...toDesktopProductPayload(resolved.product) }], draft: null };
}

async function handleProductUpdateCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const resolved = await resolveSingleProduct(auth, body, rawMessage, "update_product");
  if ("response" in resolved) return resolved.response;
  const patch = buildProductCommandPatch(body, rawMessage);
  if (Object.keys(patch).length === 0) return { handled: true, kind: "product" as const, message: "変更内容を入力してください", items: [{ type: "product", ...toDesktopProductPayload(resolved.product) }], draft: { action: "update_product", productId: resolved.product.id, missingFields: ["patch"] } };
  const updated = await updateBusinessProduct(toBusinessAuth(auth), { ...patch, id: resolved.product.id });
  return { handled: true, kind: "product" as const, message: "商材情報を更新しました", items: [{ type: "product", ...toDesktopProductPayload(updated.product) }], draft: null, executedAction: "product.update", refreshRequired: true };
}

async function handleProductDeleteCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const productId = optionalString(body.productId ?? body.id, "商品ID", 160);
  if (productId && body.confirmed === true) {
    await deleteProduct(toBusinessAuth(auth), productId);
    return { handled: true, kind: "product" as const, message: "商材を削除しました", items: [{ id: productId, type: "product" }], draft: null, executedAction: "product.delete", refreshRequired: true };
  }
  const resolved = await resolveSingleProduct(auth, body, rawMessage, "delete_product");
  if ("response" in resolved) return resolved.response;
  const impact = await getProductDeletionImpact(toBusinessAuth(auth), String(resolved.product.id));
  return {
    handled: true,
    kind: "product" as const,
    message: `削除前の確認が必要です。関連営業リスト${impact.leadsCount}件、予定${impact.calendarEventsCount}件、タスク${impact.tasksCount}件、活動${impact.activitiesCount}件があります。削除してよいか確認してください。`,
    items: [{ type: "product", ...toDesktopProductPayload(resolved.product), deletionImpact: impact }],
    draft: { action: "delete_product", productId: resolved.product.id, productName: resolved.product.name, confirmationRequired: true, confirmationPayload: impact }
  };
}

async function resolveSingleProduct(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string, action: string): Promise<ResolveProductResult> {
  const productId = optionalString(body.productId ?? body.id, "商品ID", 160);
  if (productId) {
    return { product: await getProductById(toBusinessAuth(auth), productId) };
  }
  const candidates = await productCandidates(auth, body, rawMessage);
  if (candidates.length === 1) return { product: candidates[0] };
  return {
    response: {
      handled: true,
      kind: "product" as const,
      message: candidates.length ? "対象の商材を選んでください" : "対象の商材が見つかりませんでした",
      items: candidates.map((product) => ({ type: "product", ...toDesktopProductPayload(product) })),
      draft: { action, candidateEntities: candidates.map(toDesktopProductPayload), confirmationRequired: candidates.length > 1 }
    }
  };
}

async function productCandidates(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const query = optionalString(body.query ?? body.productName ?? body.name, "検索キーワード", 200) || rawMessage.replace(/(商品|商材|プロダクト|サービス|検索|詳細|確認|削除|消して|編集|変更|更新|追加|登録|作成|概要|ターゲット|対象企業規模|価格|料金|して|ください|を|に|の|教えて)/g, " ").replace(/\s+/g, " ").trim();
  if (!query) return [];
  return searchProducts(toBusinessAuth(auth), query, { limit: 8 });
}

function detectProductAction(body: Record<string, unknown>, rawMessage: string): ProductCommandAction {
  const explicit = String(body.action ?? "").toLowerCase();
  if (explicit === "delete" || explicit === "search" || explicit === "detail" || explicit === "update" || explicit === "create") return explicit;
  if (/(登録|追加|作成|作って)/.test(rawMessage)) return "create";
  if (/(削除|消して)/.test(rawMessage)) return "delete";
  if (/(編集|変更|更新|設定|して)/.test(rawMessage)) return "update";
  if (/(詳細|ターゲット|対象|価格|料金|概要|確認|教えて)/.test(rawMessage)) return "detail";
  return "search";
}

function buildProductCommandPatch(body: Record<string, unknown>, rawMessage: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const summary = optionalString(body.summary ?? body.description, "概要", 5000);
  if (summary) patch.summary = summary;
  const tagline = optionalString(body.tagline, "一言説明", 300);
  if (tagline) patch.tagline = tagline;
  if (body.status) patch.status = body.status;
  if (body.target && typeof body.target === "object") patch.target = body.target;
  if (body.pricing && typeof body.pricing === "object") patch.pricing = body.pricing;

  const targetValue = optionalString(body.targetValue, "ターゲット", 500);
  if (targetValue || /(ターゲット|顧客|対象)/.test(rawMessage)) {
    const inferred = targetValue || extractValueAfter(rawMessage, /(ターゲット|顧客|対象|対象企業規模|企業規模|対象業種|業種|地域|担当者|決裁者)/);
    if (inferred) {
      patch.target = {
        ...(typeof patch.target === "object" && patch.target ? patch.target : {}),
        ...(/(企業規模|対象企業規模)/.test(rawMessage) ? { companySizes: [inferred] } : {}),
        ...(/(業種|対象業種)/.test(rawMessage) ? { industries: [inferred] } : {}),
        ...(/(地域|エリア)/.test(rawMessage) ? { regions: [inferred] } : {}),
        ...(/(決裁者)/.test(rawMessage) ? { decisionMakerRoles: [inferred] } : {}),
        ...(!/(企業規模|対象企業規模|業種|対象業種|地域|エリア|決裁者)/.test(rawMessage) ? { suitableConditions: [inferred] } : {})
      };
    }
  }

  const priceValue = optionalString(body.price ?? body.pricingNotes, "価格", 1000) || (/(価格|料金)/.test(rawMessage) ? extractValueAfter(rawMessage, /(価格|料金)/) : "");
  if (priceValue) {
    patch.pricing = { ...(typeof patch.pricing === "object" && patch.pricing ? patch.pricing : {}), notes: priceValue };
  }
  return patch;
}

async function handleActivityCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const action = detectActivityAction(body, rawMessage);
  if (action === "delete") return handleActivityDeleteCommand(auth, body, rawMessage);
  if (action === "company") return listCompanyActivitiesFromCommand(auth, body, rawMessage);
  if (action === "lead") return listLeadActivitiesFromCommand(auth, body, rawMessage);
  if (action === "search") return searchActivitiesFromCommand(auth, body, rawMessage);
  return createActivityFromCommand(auth, body, rawMessage);
}

async function createActivityFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const title = optionalString(body.title, "営業ログタイトル", 200) || rawMessage.replace(/(営業ログ|活動ログ|対応履歴|履歴|メモ|登録|追加)/g, "").trim() || "営業ログ";
  const occurredAt = parseIsoDate(body.occurredAt, "発生日") ?? new Date();
  const companyId = optionalString(body.companyId, "会社ID", 160);
  if (!companyId) return { handled: true, kind: "activity" as const, message: "営業ログを登録するには会社IDが必要です", items: [], draft: { title } };
  const type = normalizeActivityLogType(body.activityType ?? body.type);
  const created = await createBusinessActivity(toBusinessAuth(auth), {
    title,
    content: optionalString(body.content ?? body.description, "内容", 5000) || rawMessage,
    activityType: type,
    occurredAt,
    companyId,
    companyName: optionalString(body.companyName, "会社名", 200) || null,
    leadId: optionalString(body.leadId, "営業リストID", 160) || null,
    leadStatus: normalizeLeadStatus(body.leadStatus),
    productId: optionalString(body.productId, "商品ID", 160) || null,
    productName: optionalString(body.productName, "商品名", 200) || null,
    nextActionAt: parseIsoDate(body.nextActionAt, "次回対応日時")?.toISOString() ?? null,
    nextActionTitle: optionalString(body.nextActionTitle, "次回対応", 200) || null,
    force: body.force === true
  });
  if (created.requiresConfirmation) return { handled: true, kind: "activity" as const, message: "同じ活動ログが既に登録されている可能性があります", items: created.duplicates ?? [], draft: { title } };
  return { handled: true, kind: "activity" as const, message: "営業ログを登録しました", items: [{ id: created.activityId, activityLogId: created.activityLogId, title }], draft: null, executedAction: "activity.create", refreshRequired: true };
}

async function searchActivitiesFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const query = optionalString(body.query, "検索キーワード", 200) || rawMessage.replace(/(営業ログ|活動ログ|対応履歴|履歴|メモ|検索|確認|教えて|見せて)/g, " ").replace(/\s+/g, " ").trim();
  const activities = await searchActivities(toBusinessAuth(auth), query, { limit: 10 });
  return { handled: true, kind: "activity" as const, message: activities.length ? "活動ログを検索しました" : "該当する活動ログは見つかりませんでした", items: activities.map((activity) => ({ ...toDesktopActivityPayload(activity), type: "activity" })), draft: null };
}

async function listCompanyActivitiesFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const companyId = optionalString(body.companyId, "会社ID", 160);
  if (!companyId) return { handled: true, kind: "activity" as const, message: "活動履歴を見る会社を選んでください", items: [], draft: { action: "company_activities", missingFields: ["companyId"] } };
  const activities = await listActivitiesByCompanyId(toBusinessAuth(auth), companyId, { limit: 10, includeLegacy: true });
  return { handled: true, kind: "activity" as const, message: activities.length ? "会社の活動履歴を取得しました" : "会社の活動履歴はありません", items: activities.map((activity) => ({ ...toDesktopActivityPayload(activity), type: "activity" })), draft: null };
}

async function listLeadActivitiesFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const leadId = optionalString(body.leadId, "営業リストID", 160);
  if (!leadId) return { handled: true, kind: "activity" as const, message: "活動履歴を見る営業リストを選んでください", items: [], draft: { action: "lead_activities", missingFields: ["leadId"] } };
  const activities = await listActivitiesByLeadId(toBusinessAuth(auth), leadId, { limit: 10 });
  return { handled: true, kind: "activity" as const, message: activities.length ? "営業リストの活動履歴を取得しました" : "営業リストの活動履歴はありません", items: activities.map((activity) => ({ ...toDesktopActivityPayload(activity), type: "activity" })), draft: null };
}

async function handleActivityDeleteCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const activityId = optionalString(body.activityId ?? body.id, "活動ログID", 160);
  if (activityId && body.confirmed === true) {
    await deleteActivity(toBusinessAuth(auth), activityId);
    return { handled: true, kind: "activity" as const, message: "活動ログを削除しました", items: [{ id: activityId, type: "activity" }], draft: null, executedAction: "activity.delete", refreshRequired: true };
  }
  if (activityId) {
    return {
      handled: true,
      kind: "activity" as const,
      message: "削除前の確認が必要です。この活動ログを削除してよいですか？",
      items: [{ id: activityId, type: "activity" }],
      draft: { action: "delete_activity", activityId, confirmationRequired: true }
    };
  }
  const query = optionalString(body.query, "検索キーワード", 200) || rawMessage.replace(/(営業ログ|活動ログ|対応履歴|履歴|削除|消して|して|ください)/g, " ").replace(/\s+/g, " ").trim();
  const candidates = await searchActivities(toBusinessAuth(auth), query, { limit: 5 });
  return {
    handled: true,
    kind: "activity" as const,
    message: candidates.length ? "削除前の確認が必要です。対象の活動ログを選んでください。" : "削除対象の活動ログが見つかりませんでした",
    items: candidates.map((activity) => ({ ...toDesktopActivityPayload(activity), type: "activity" })),
    draft: { action: "delete_activity", query, confirmationRequired: candidates.length > 0 }
  };
}

async function handleLeadCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const action = detectLeadAction(body, rawMessage);
  if (action === "create") return createLeadFromCommand(auth, body, rawMessage);
  if (action === "delete") return handleLeadDeleteCommand(auth, body, rawMessage);
  if (action === "status") return handleLeadStatusCommand(auth, body, rawMessage);
  if (action === "website") return handleLeadWebsiteCommand(auth, body, rawMessage);
  if (action === "linkCompany") return handleLeadCompanyLinkCommand(auth, body, rawMessage);
  if (action === "update") return handleLeadUpdateCommand(auth, body, rawMessage);
  if (action === "detail") return handleLeadDetailCommand(auth, body, rawMessage);
  if (action === "activities") return { handled: true, kind: "lead" as const, message: "活動履歴確認はLead Aggregate/Activity Serviceで扱う予定です。対象の営業リストを選んでください。", items: (await leadCandidates(auth, body, rawMessage)).map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })), draft: { action: "lead_activities", confirmationRequired: false } };
  if (action === "activity") return { handled: true, kind: "lead" as const, message: "活動登録はActivity Serviceで実行するため、対象と内容の確認が必要です。", items: (await leadCandidates(auth, body, rawMessage)).map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })), draft: { action: "create_lead_activity", confirmationRequired: true } };
  if (action === "calendar") return { handled: true, kind: "lead" as const, message: "予定登録はCalendar Serviceで実行するため、日時と対象を確認してください。", items: (await leadCandidates(auth, body, rawMessage)).map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })), draft: { action: "create_lead_calendar", confirmationRequired: true } };
  return searchLeadsFromCommand(auth, body, rawMessage);
}

async function createLeadFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const companyName = optionalString(body.companyName ?? body.name, "会社名", 200) || rawMessage.replace(/(見込み客|リード|営業リスト|登録|追加|作成)/g, "").trim();
  if (!companyName) return { handled: true, kind: "lead" as const, message: "営業リストの会社名を入力してください", items: [], draft: null };
  const appointmentAt = parseIsoDate(body.appointmentAt, "商談日時");
  const nextActionAt = parseIsoDate(body.nextActionAt, "次回対応日時");
  const result = await createBusinessLead(toBusinessAuth(auth), {
    companyName,
    contactName: optionalString(body.contactName, "担当者名", 120),
    contactRole: optionalString(body.contactRole, "役職", 120),
    phone: optionalString(body.phone, "電話番号", 80),
    email: optionalString(body.email, "メールアドレス", 160),
    website: optionalString(body.website ?? body.websiteUrl, "Webサイト", 300),
    industry: optionalString(body.industry, "業種", 120),
    source: optionalString(body.source, "流入元", 120),
    productId: optionalString(body.productId, "商品ID", 160) || null,
    productName: optionalString(body.productName, "商品名", 200) || null,
    status: normalizeBusinessLeadStatus(body.status),
    prospectRank: optionalString(body.prospectRank, "見込み度", 40),
    appointmentAt: appointmentAt?.toISOString() ?? null,
    nextActionAt: nextActionAt?.toISOString() ?? null,
    nextActionTitle: optionalString(body.nextActionTitle, "次回対応", 200) || null,
    assignedUserId: optionalString(body.assignedUserId, "担当者ID", 160) || auth.userId,
    assignedUserName: optionalString(body.assignedUserName, "担当者名", 160) || getUserDisplayNameById(auth.userId),
    notes: optionalString(body.notes, "メモ", 5000),
    companyId: optionalString(body.companyId, "会社ID", 160) || null
  });
  if (result.requiresConfirmation) return { handled: true, kind: "lead" as const, message: "同じ営業リストが既に登録されている可能性があります", items: result.duplicates ?? [], draft: { name: companyName } };
  return { handled: true, kind: "lead" as const, message: "営業リストへ登録しました", items: [{ id: result.leadId, name: companyName, companyName }], draft: null, executedAction: "lead.create", refreshRequired: true };
}

async function searchLeadsFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const items = await leadCandidates(auth, body, rawMessage);
  return { handled: true, kind: "lead" as const, message: items.length ? "営業リストを検索しました" : "該当する営業リストは見つかりませんでした", items: items.map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })), draft: null };
}

async function handleLeadDetailCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const leadId = optionalString(body.leadId, "営業リストID", 160);
  if (leadId) return { handled: true, kind: "lead" as const, message: "営業リスト詳細を取得しました", items: [{ type: "lead", ...toDesktopLeadPayload(await getLeadById(toBusinessAuth(auth), leadId)) }], draft: null };
  const candidates = await leadCandidates(auth, body, rawMessage);
  if (candidates.length === 1) return { handled: true, kind: "lead" as const, message: "営業リスト詳細を取得しました", items: candidates.map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })), draft: null };
  return { handled: true, kind: "lead" as const, message: candidates.length ? "詳細を見る営業リストを選んでください" : "営業リストが見つかりませんでした", items: candidates.map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })), draft: { action: "get_lead_detail", confirmationRequired: candidates.length > 1 } };
}

async function handleLeadStatusCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const lead = await resolveSingleLead(auth, body, rawMessage, "change_lead_status");
  if ("response" in lead) return lead.response;
  const status = leadStatusFromText(body.status, rawMessage);
  if (body.confirmed !== true) {
    return { handled: true, kind: "lead" as const, message: "営業リストのステータスを変更しますか？", items: [{ type: "lead", ...toDesktopLeadPayload(lead.lead), status }], draft: { action: "change_lead_status", leadId: lead.lead.id, status, confirmationRequired: true } };
  }
  const updated = await changeLeadStatus(toBusinessAuth(auth), String(lead.lead.id), status);
  return { handled: true, kind: "lead" as const, message: "営業リストのステータスを更新しました", items: [{ type: "lead", ...toDesktopLeadPayload(updated.lead) }], draft: null, executedAction: "lead.status_change", refreshRequired: true };
}

async function handleLeadWebsiteCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const lead = await resolveSingleLead(auth, body, rawMessage, "update_lead_website");
  if ("response" in lead) return lead.response;
  const websiteUrl = optionalString(body.websiteUrl ?? body.website, "Webサイト", 300) || extractUrl(rawMessage);
  if (!websiteUrl) return { handled: true, kind: "lead" as const, message: "設定するURLを入力してください", items: [{ type: "lead", ...toDesktopLeadPayload(lead.lead) }], draft: { action: "update_lead_website", leadId: lead.lead.id, missingFields: ["websiteUrl"] } };
  const updated = await updateLeadWebsiteUrl(toBusinessAuth(auth), String(lead.lead.id), websiteUrl);
  return { handled: true, kind: "lead" as const, message: "営業リストのHP URLを更新しました", items: [{ type: "lead", ...toDesktopLeadPayload(updated.lead) }], draft: null, executedAction: "lead.website_update", refreshRequired: true };
}

async function handleLeadCompanyLinkCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const lead = await resolveSingleLead(auth, body, rawMessage, "link_lead_company");
  if ("response" in lead) return lead.response;
  const companyId = optionalString(body.companyId, "会社ID", 160);
  if (!companyId) return { handled: true, kind: "lead" as const, message: "関連付ける会社を選んでください", items: [{ type: "lead", ...toDesktopLeadPayload(lead.lead) }], draft: { action: "link_lead_company", leadId: lead.lead.id, missingFields: ["companyId"] } };
  const companyName = optionalString(body.companyName, "会社名", 200) || null;
  const updated = await linkBusinessLeadToCompany(toBusinessAuth(auth), String(lead.lead.id), companyId, companyName);
  return { handled: true, kind: "lead" as const, message: "営業リストを会社に関連付けました", items: [{ type: "lead", ...toDesktopLeadPayload(updated.lead) }], draft: null, executedAction: "lead.company_link", refreshRequired: true };
}

async function handleLeadUpdateCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const lead = await resolveSingleLead(auth, body, rawMessage, "update_lead");
  if ("response" in lead) return lead.response;
  const updated = await updateBusinessLead(toBusinessAuth(auth), { ...body, id: lead.lead.id });
  return { handled: true, kind: "lead" as const, message: "営業リストを更新しました", items: [{ type: "lead", ...toDesktopLeadPayload(updated.lead) }], draft: null, executedAction: "lead.update", refreshRequired: true };
}

async function handleLeadDeleteCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<DesktopCommandResult> {
  const leadId = optionalString(body.leadId, "営業リストID", 160);
  if (leadId && body.confirmed === true) {
    await deleteLead(toBusinessAuth(auth), leadId);
    return { handled: true, kind: "lead" as const, message: "営業リストを削除しました", items: [{ id: leadId, type: "lead" }], draft: null, executedAction: "lead.delete", refreshRequired: true };
  }
  const resolved = await resolveSingleLead(auth, body, rawMessage, "delete_lead");
  if ("response" in resolved) return resolved.response;
  const impact = await getLeadDeletionImpact(toBusinessAuth(auth), String(resolved.lead.id));
  return {
    handled: true,
    kind: "lead" as const,
    message: `削除前の確認が必要です。関連活動${impact.activitiesCount}件、タスク${impact.tasksCount}件、予定${impact.calendarEventsCount}件があります。削除してよいか確認してください。`,
    items: [{ type: "lead", ...toDesktopLeadPayload(resolved.lead), deletionImpact: impact }],
    draft: { action: "delete_lead", leadId: resolved.lead.id, companyName: resolved.lead.companyName, confirmationRequired: true, confirmationPayload: impact }
  };
}

async function resolveSingleLead(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string, action: string): Promise<ResolveLeadResult> {
  const leadId = optionalString(body.leadId, "営業リストID", 160);
  if (leadId) return { lead: await getLeadById(toBusinessAuth(auth), leadId) };
  const candidates = await leadCandidates(auth, body, rawMessage);
  if (candidates.length === 1) return { lead: candidates[0] };
  return {
    response: {
      handled: true,
      kind: "lead" as const,
      message: candidates.length ? "対象の営業リストを選んでください" : "対象の営業リストが見つかりませんでした",
      items: candidates.map((lead) => ({ type: "lead", ...toDesktopLeadPayload(lead) })),
      draft: { action, candidateEntities: candidates.map(toDesktopLeadPayload), confirmationRequired: candidates.length > 1 }
    }
  };
}

async function leadCandidates(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const query = optionalString(body.query ?? body.companyName ?? body.name, "検索キーワード", 200) || rawMessage.replace(/(見込み客|リード|営業リスト|検索|詳細|確認|削除|消して|ステータス|変更|更新|HP|URL|会社|関連付け|活動履歴|活動登録|予定登録|して|ください|を|に)/g, " ").replace(/\s+/g, " ").trim();
  if (!query) return [];
  return searchLeads(toBusinessAuth(auth), query, { limit: 8 });
}

function detectLeadAction(body: Record<string, unknown>, rawMessage: string): LeadCommandAction {
  const explicit = String(body.action ?? "").toLowerCase();
  if (explicit === "linkcompany" || explicit === "link_company") return "linkCompany";
  if (explicit === "delete" || explicit === "status" || explicit === "website" || explicit === "search" || explicit === "detail" || explicit === "update" || explicit === "activities" || explicit === "activity" || explicit === "calendar") return explicit;
  if (/(登録|追加|作成|作って)/.test(rawMessage)) return "create";
  if (/(削除|消して)/.test(rawMessage)) return "delete";
  if (/(ステータス|状態).*(変更|更新|して|に)|契約|失注|追っかけ|連絡待ち|打ち合わせ中|検討中|資料請求|アポ獲得/.test(rawMessage)) return "status";
  if (/(HP|URL|サイト|ホームページ|website)/i.test(rawMessage) && /(変更|更新|登録|設定)/.test(rawMessage)) return "website";
  if (/(会社).*(関連付け|紐付け|リンク)/.test(rawMessage)) return "linkCompany";
  if (/(編集|変更|更新)/.test(rawMessage)) return "update";
  if (/(活動履歴|履歴確認)/.test(rawMessage)) return "activities";
  if (/(活動登録|活動ログ|ログ追加)/.test(rawMessage)) return "activity";
  if (/(予定登録|予定追加|カレンダー)/.test(rawMessage)) return "calendar";
  if (/(詳細|状況|確認|教えて)/.test(rawMessage)) return "detail";
  return "search";
}

function leadStatusFromText(value: unknown, rawMessage: string) {
  if (value) return normalizeBusinessLeadStatus(value);
  if (/契約|受注|成約/.test(rawMessage)) return "won";
  if (/失注|終了/.test(rawMessage)) return "lost";
  if (/連絡済み|連絡済|架電済み|架電済|接触済み|接触済/.test(rawMessage)) return "contacted";
  if (/追っかけ|追客|接触中/.test(rawMessage)) return "contacting";
  if (/送付済|送信済|メール済/.test(rawMessage)) return "sent";
  if (/資料請求|資料送付/.test(rawMessage)) return "document_sent";
  if (/アポ獲得|アポ/.test(rawMessage)) return "appointment";
  if (/打ち合わせ中|商談中|商談/.test(rawMessage)) return "meeting";
  if (/検討中/.test(rawMessage)) return "considering";
  if (/連絡待ち|保留/.test(rawMessage)) return "hold";
  return "new";
}

function extractUrl(rawMessage: string) {
  return rawMessage.match(/https?:\/\/[^\s　]+/)?.[0] ?? "";
}

async function handleNotificationCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  if (body.action === "mark_all_read" || /すべて既読|全て既読|全部既読/.test(rawMessage)) {
    const snapshot = await auth.db.collection("agentNotifications").where("userId", "==", auth.userId).get();
    const batch = auth.db.batch();
    let count = 0;
    snapshot.docs.forEach((entry) => {
      if (entry.data().environment === "test") return;
      batch.update(entry.ref, { read: true, updatedAt: FieldValue.serverTimestamp() });
      count += 1;
    });
    if (count) await batch.commit();
    return { handled: true, kind: "notification" as const, message: "通知をすべて既読にしました", items: [{ count }], draft: null, executedAction: "notification.mark_all_read", refreshRequired: true };
  }
  return { handled: true, kind: "notification" as const, message: "通知操作は通知APIで処理してください", items: [], draft: null };
}

function readMessage(body: Record<string, unknown>) {
  return optionalString(body.rawMessage ?? body.message ?? body.text ?? body.input ?? body.query, "入力", 2000);
}

function isCommandKind(value: string): value is CommandKind {
  return ["calendar", "task", "company", "lead", "activity", "product", "notification", "business_query"].includes(value);
}

function valueObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toBusinessAuth(auth: DesktopAuth): BusinessAuth {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop",
    deviceId: null
  };
}

function parseDateFromText(rawMessage: string): Date | null {
  const time = rawMessage.match(/(\d{1,2})[:時](\d{2})?/);
  const hour = time?.[1] ? Number(time[1]) : 10;
  const minute = time?.[2] ? Number(time[2]) : 0;
  const base = tokyoDateParts();
  if (/明後日/.test(rawMessage)) base.day += 2;
  else if (/明日/.test(rawMessage)) base.day += 1;
  const md = rawMessage.match(/(\d{1,2})月(\d{1,2})日/);
  if (md) {
    base.month = Number(md[1]);
    base.day = Number(md[2]);
  }
  if (!time && !/(今日|明日|明後日|\d{1,2}月\d{1,2}日)/.test(rawMessage)) return null;
  return fromTokyoWallClock(base.year, base.month, base.day, hour, minute);
}

function extractCompanyName(rawMessage: string) {
  const cleaned = rawMessage
    .replace(/^(今日|本日|明日|明後日|\d{1,2}月\d{1,2}日)(の|に)?/, "")
    .replace(/^\d{1,2}[:時]\d{0,2}分?(に)?/, "")
    .trim();
  const beforePurpose = cleaned.match(/^(.+?)(?:さん|社|会社)?と.+?(?:予定|商談|打ち合わせ|会議|訪問|面談|ミーティング)/);
  if (beforePurpose?.[1]) return beforePurpose[1].trim();
  const direct = cleaned.match(/(?:^|[に、。]\s*)([^に、。\s]+?)(?:さん|社|会社)?との(?:予定|商談|打ち合わせ|会議|訪問|面談|ミーティング)/);
  if (direct?.[1]) return direct[1].trim();
  const withTo = cleaned.match(/(?:^|[に、。]\s*)([^に、。\s]+?)(?:さん|社|会社)?と(?:予定|商談|打ち合わせ|会議|訪問|面談|ミーティング)/);
  if (withTo?.[1]) return withTo[1].trim();
  const possessive = cleaned.match(/(?:^|[に、。]\s*)([^に、。\s]+?)(?:さん|社|会社)?の(?:予定|商談|打ち合わせ|会議|訪問|面談|ミーティング)/);
  if (possessive?.[1]) return possessive[1].trim();
  const fallback = cleaned.match(/([^\s、。]+?)(?:さん|社|会社)?(?:と|の)?(?:予定|商談|打ち合わせ|会議|訪問|面談|ミーティング)/);
  return fallback?.[1]?.replace(/.*時に/, "").trim() || "";
}

function buildCalendarTitle(rawMessage: string, companyName: string, eventType: string) {
  const label = eventType === "customer_support" ? "顧客対応" : eventType === "internal" ? "社内予定" : eventType === "deskwork" ? "作業" : eventType === "personal" ? "私用" : "打ち合わせ";
  if (companyName) return `${companyName}との${label}`;
  const cleaned = rawMessage.replace(/(今日|本日|明日|明後日|\d{1,2}月\d{1,2}日|\d{1,2}[:時]\d{0,2}分?|登録|追加|作成|保存|入れて|予定して|設定して|ください|して|を|に)/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80) || label;
}

function extractNameAfter(rawMessage: string, marker: RegExp) {
  const index = rawMessage.search(marker);
  if (index < 0) return "";
  return rawMessage.slice(index).replace(marker, "").replace(/(登録|追加|作成|して|する)/g, "").trim();
}

function extractValueAfter(rawMessage: string, marker: RegExp) {
  const index = rawMessage.search(marker);
  if (index < 0) return "";
  return rawMessage.slice(index).replace(marker, "").replace(/(変更|更新|設定|して|する|に|を|は)/g, " ").replace(/\s+/g, " ").trim();
}

function detectTaskAction(body: Record<string, unknown>, rawMessage: string): TaskCommandAction {
  const explicit = String(body.action ?? "").toLowerCase();
  if (explicit === "complete" || explicit === "reopen" || explicit === "dueDate" || explicit === "priority" || explicit === "search") return explicit;
  if (/(登録|追加|作成|作って|入れて)/.test(rawMessage)) return "create";
  if (/(未完了|戻して|再開)/.test(rawMessage)) return "reopen";
  if (/(完了|済み)/.test(rawMessage)) return "complete";
  if (/(期限|締切|期日).*(変更|して|に)|明日|明後日|\d{1,2}月\d{1,2}日/.test(rawMessage) && /(期限|締切|期日)/.test(rawMessage)) return "dueDate";
  if (/(優先度|優先順位|重要度|高|中|低)/.test(rawMessage) && /(優先|重要|高|中|低)/.test(rawMessage)) return "priority";
  return "search";
}

function extractTaskQuery(rawMessage: string) {
  return rawMessage
    .replace(/タスク|TODO|やること|依頼|宿題/gi, "")
    .replace(/を?(完了|済み|未完了|戻して|再開|期限|締切|期日|優先度|優先順位|重要度|変更|高|中|低|明日|明後日|今日|本日|に|して|する|してください)/g, " ")
    .replace(/\d{1,2}月\d{1,2}日|\d{1,2}時\d{0,2}分?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTaskPriorityFromText(value: unknown, rawMessage: string): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  if (/(高|重要|急ぎ|至急)/.test(rawMessage)) return "high";
  if (/(低|後で|低め)/.test(rawMessage)) return "low";
  return "medium";
}

function tokyoDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month"), day: value("day") };
}

function fromTokyoWallClock(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
}

function detectActivityAction(body: Record<string, unknown>, rawMessage: string): ActivityCommandAction {
  const explicit = String(body.action ?? "").toLowerCase();
  if (explicit === "delete" || explicit === "search" || explicit === "company" || explicit === "lead" || explicit === "create") return explicit;
  if (/(削除|消して)/.test(rawMessage)) return "delete";
  if (/(最近|履歴|確認|見せて|教えて)/.test(rawMessage) && /(会社|社)/.test(rawMessage)) return "company";
  if (/(最近|履歴|確認|見せて|教えて)/.test(rawMessage) && /(営業リスト|リード)/.test(rawMessage)) return "lead";
  if (/(検索|探して|確認|見せて|教えて)/.test(rawMessage)) return "search";
  return "create";
}

async function findCompanyByName(auth: DesktopAuth, name: string) {
  const aliases = companyNameAliases(name);
  const companies = await searchCompanies(toBusinessAuth(auth), name, { limit: 200 });
  const found = companies.find((company) => Array.from(companyNameAliases(String(company.name ?? ""))).some((alias) => aliases.has(alias)));
  return found ? { id: String(found.id ?? ""), name: String(found.name ?? "") } : null;
}

function companyNameAliases(name: string) {
  const normalized = normalizeComparableName(name);
  const stripped = normalizeComparableName(name.replace(/株式会社|有限会社|合同会社|社$/g, ""));
  return new Set([normalized, stripped].filter(Boolean));
}

function normalizeActivityLogType(value: unknown): "phone" | "email" | "visit" | "meeting" | "memo" | "other" {
  return value === "phone" || value === "email" || value === "visit" || value === "meeting" || value === "memo" || value === "other" ? value : "memo";
}

function normalizeLeadStatus(value: unknown) {
  return value === "contacted" || value === "contacting" || value === "document_sent" || value === "sent" || value === "appointment" || value === "meeting" || value === "considering" || value === "hold" || value === "won" || value === "lost" ? value : "new";
}
