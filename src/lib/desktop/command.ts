import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { DesktopApiError, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { timestampToIso, toDesktopCompany, toDesktopTask } from "@/lib/desktop/format";
import { findLooseDuplicates, findNameDuplicates, normalizeComparableName } from "@/lib/server/duplicate-utils";
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
  companyId: string | null;
  companyName: string | null;
  eventType: string;
};

export async function handleDesktopCommand(auth: DesktopAuth, body: Record<string, unknown>) {
  const rawMessage = readMessage(body);
  const kind = detectKind(body, rawMessage);

  if (kind === "calendar") {
    const draft = await buildCalendarDraft(auth, body, rawMessage);
    return { handled: true, kind, message: "予定内容を確認しました", items: [], draft };
  }
  if (kind === "company") return createCompanyFromCommand(auth, body, rawMessage);
  if (kind === "task") return createTaskFromCommand(auth, body, rawMessage);
  if (kind === "product") return createProductFromCommand(auth, body, rawMessage);
  if (kind === "activity") return createActivityFromCommand(auth, body, rawMessage);
  if (kind === "lead") return createLeadFromCommand(auth, body, rawMessage);
  if (kind === "notification") return handleNotificationCommand(auth, body, rawMessage);
  return searchBusiness(auth, rawMessage || optionalString(body.q, "検索キーワード", 120));
}

export async function commitCalendarDraft(auth: DesktopAuth, body: Record<string, unknown>) {
  const draftSource = valueObject(body.draft) ?? body;
  const title = requireString(draftSource.title, "予定タイトル", 200);
  const startAt = parseIsoDate(draftSource.startAt, "開始日時");
  if (!startAt) throw new DesktopApiError("VALIDATION_ERROR", "開始日時を入力してください", 400);
  const endAt = parseIsoDate(draftSource.endAt, "終了日時") ?? new Date(startAt.getTime() + 60 * 60 * 1000);
  const companyId = optionalString(draftSource.companyId, "会社ID", 160) || null;
  const force = body.force === true || draftSource.force === true;

  const existing = await auth.db.collection("calendarEvents").orderBy("startAt", "desc").limit(300).get();
  const duplicates = findLooseDuplicates(existing.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() })), { title, companyId, startsAt: startAt });
  if (duplicates.length && !force) {
    throw new DesktopApiError("DUPLICATE", "同じ予定が既に登録されている可能性があります", 409);
  }

  const companySnapshot = companyId ? await auth.db.collection("companies").doc(companyId).get() : null;
  if (companyId && !companySnapshot?.exists) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
  const userName = getUserDisplayNameById(auth.userId);
  const ref = await auth.db.collection("calendarEvents").add({
    title,
    description: optionalString(draftSource.description, "説明", 3000),
    eventType: optionalString(draftSource.eventType, "予定種別", 80) || "meeting",
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    allDay: Boolean(draftSource.allDay),
    assigneeId: auth.userId,
    assigneeName: userName,
    attendeeIds: [],
    attendeeNames: [],
    companyId,
    companyName: companySnapshot?.data()?.name ?? (optionalString(draftSource.companyName, "会社名", 200) || null),
    source: "manual",
    origin: "desktop",
    visibility: "team",
    environment: runtimeEnvironment(),
    createdBy: auth.userId,
    createdByName: userName,
    updatedBy: auth.userId,
    updatedByName: userName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { eventId: ref.id, message: "予定を登録しました", targetURL: "/calendar" };
}

export async function searchBusiness(auth: DesktopAuth, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return { handled: true, kind: "business_query" as const, message: "検索キーワードを入力してください", items: [], draft: null };
  const [companies, leads, products, tasks] = await Promise.all([
    auth.db.collection("companies").orderBy("updatedAt", "desc").limit(200).get(),
    auth.db.collection("leads").orderBy("updatedAt", "desc").limit(200).get(),
    auth.db.collection("products").orderBy("updatedAt", "desc").limit(200).get(),
    auth.db.collection("tasks").orderBy("updatedAt", "desc").limit(200).get()
  ]);
  const items = [
    ...companies.docs.map((entry) => ({ type: "company", ...toDesktopCompany(entry.id, entry.data()) })).filter((item) => matches(item, keyword)),
    ...leads.docs.map((entry) => ({ type: "lead", id: entry.id, name: String(entry.data().name ?? entry.data().companyName ?? ""), companyName: entry.data().companyName ?? null })).filter((item) => matches(item, keyword)),
    ...products.docs.map((entry) => ({ type: "product", id: entry.id, name: String(entry.data().name ?? entry.data().displayName ?? ""), status: entry.data().status ?? null })).filter((item) => matches(item, keyword)),
    ...tasks.docs.map((entry) => ({ type: "task", ...toDesktopTask(entry.id, entry.data()) })).filter((item) => matches(item, keyword))
  ].slice(0, 20);
  return { handled: true, kind: "business_query" as const, message: items.length ? "検索結果を取得しました" : "該当する業務データは見つかりませんでした", items, draft: null };
}

function detectKind(body: Record<string, unknown>, rawMessage: string): CommandKind {
  const explicit = String(body.kind ?? body.intent ?? body.type ?? "").toLowerCase();
  if (isCommandKind(explicit)) return explicit;
  if (/(予定|カレンダー|スケジュール|訪問|打ち合わせ|商談|面談|会議|ミーティング)/.test(rawMessage)) return "calendar";
  if (/(タスク|TODO|やること|依頼|宿題)/i.test(rawMessage)) return "task";
  if (/(会社|企業|取引先|顧客)/.test(rawMessage) && /(登録|追加|作成)/.test(rawMessage)) return "company";
  if (/(見込み客|リード|営業リスト)/.test(rawMessage)) return "lead";
  if (/(営業ログ|活動ログ|対応履歴|履歴|メモ)/.test(rawMessage)) return "activity";
  if (/(商品|商材|プロダクト|サービス)/.test(rawMessage) && /(登録|追加|作成)/.test(rawMessage)) return "product";
  if (/(通知|既読|完了|削除)/.test(rawMessage)) return "notification";
  return "business_query";
}

async function buildCalendarDraft(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string): Promise<CalendarDraft> {
  const explicit = valueObject(body.draft) ?? body;
  const companyName = optionalString(explicit.companyName, "会社名", 200) || extractCompanyName(rawMessage);
  const company = companyName ? await findCompanyByName(auth, companyName) : null;
  const startAt = parseIsoDate(explicit.startAt, "開始日時") ?? parseDateFromText(rawMessage) ?? new Date(Date.now() + 60 * 60 * 1000);
  const endAt = parseIsoDate(explicit.endAt, "終了日時") ?? new Date(startAt.getTime() + 60 * 60 * 1000);
  const title = optionalString(explicit.title, "予定タイトル", 200) || rawMessage.replace(/\s+/g, " ").trim().slice(0, 80) || "予定";
  return {
    title,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    allDay: Boolean(explicit.allDay),
    description: optionalString(explicit.description, "説明", 3000),
    companyId: company?.id ?? (optionalString(explicit.companyId, "会社ID", 160) || null),
    companyName: company?.name ?? (companyName || null),
    eventType: optionalString(explicit.eventType, "予定種別", 80) || "meeting"
  };
}

async function createCompanyFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const name = optionalString(body.name, "会社名", 200) || extractNameAfter(rawMessage, /(会社|企業|取引先|顧客)/) || rawMessage.replace(/(会社|企業|取引先|顧客|登録|追加|作成)/g, "").trim();
  if (!name) return { handled: true, kind: "company" as const, message: "会社名を入力してください", items: [], draft: null };
  const duplicates = await findDuplicateNames(auth, "companies", name, ["name", "nameKana"]);
  if (duplicates.length && body.force !== true) return { handled: true, kind: "company" as const, message: "同じ会社が既に登録されている可能性があります", items: duplicates, draft: { name } };
  const userName = getUserDisplayNameById(auth.userId);
  const ref = await auth.db.collection("companies").add({
    name,
    nameKana: optionalString(body.nameKana, "フリガナ", 200),
    industry: optionalString(body.industry, "業種", 120),
    status: optionalString(body.status, "状態", 40) || "lead",
    customerRank: "C",
    primaryContactName: optionalString(body.primaryContactName, "担当者名", 120) || null,
    internalOwnerId: auth.userId,
    internalOwnerName: userName,
    productIds: [],
    productNames: [],
    contacts: [],
    tags: [],
    favoriteUserIds: [],
    notes: optionalString(body.notes, "メモ", 5000),
    origin: "desktop",
    environment: runtimeEnvironment(),
    createdBy: auth.userId,
    createdByName: userName,
    updatedBy: auth.userId,
    updatedByName: userName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { handled: true, kind: "company" as const, message: "会社を登録しました", items: [{ id: ref.id, name }], draft: null };
}

async function createTaskFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const title = optionalString(body.title, "タスクタイトル", 200) || rawMessage.replace(/(タスク|TODO|作成|追加|登録)/gi, "").trim();
  if (!title) return { handled: true, kind: "task" as const, message: "タスク内容を入力してください", items: [], draft: null };
  const dueDate = parseIsoDate(body.dueDate, "期限") ?? parseDateFromText(rawMessage);
  const userName = getUserDisplayNameById(auth.userId);
  const ref = await auth.db.collection("tasks").add({
    title,
    description: optionalString(body.description, "説明", 3000),
    status: "todo",
    priority: body.priority === "high" || body.priority === "low" ? body.priority : "medium",
    source: "manual",
    aiGenerated: false,
    assigneeId: auth.userId,
    assigneeName: userName,
    companyId: optionalString(body.companyId, "会社ID", 160) || null,
    companyName: optionalString(body.companyName, "会社名", 200) || null,
    dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
    completedAt: null,
    checklist: [],
    comments: "",
    origin: "desktop",
    environment: runtimeEnvironment(),
    createdBy: auth.userId,
    createdByName: userName,
    updatedBy: auth.userId,
    updatedByName: userName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { handled: true, kind: "task" as const, message: "タスクを登録しました", items: [{ id: ref.id, title }], draft: null };
}

async function createProductFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const name = optionalString(body.name, "商品名", 200) || rawMessage.replace(/(商品|商材|プロダクト|サービス|登録|追加|作成)/g, "").trim();
  if (!name) return { handled: true, kind: "product" as const, message: "商品名を入力してください", items: [], draft: null };
  const duplicates = await findDuplicateNames(auth, "products", name, ["name", "displayName"]);
  if (duplicates.length && body.force !== true) return { handled: true, kind: "product" as const, message: "同じ商品が既に登録されている可能性があります", items: duplicates, draft: { name } };
  const userName = getUserDisplayNameById(auth.userId);
  const ref = await auth.db.collection("products").add({
    name,
    displayName: optionalString(body.displayName, "表示名", 200) || name,
    slug: normalizeComparableName(name) || `product-${Date.now()}`,
    productType: optionalString(body.productType, "商品種別", 80) || "other",
    status: "draft",
    ownerId: auth.userId,
    ownerName: userName,
    categoryIds: [],
    categoryNames: [],
    resources: [],
    favoriteUserIds: [],
    origin: "desktop",
    environment: runtimeEnvironment(),
    createdBy: auth.userId,
    createdByName: userName,
    updatedBy: auth.userId,
    updatedByName: userName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { handled: true, kind: "product" as const, message: "商品を登録しました", items: [{ id: ref.id, name }], draft: null };
}

async function createActivityFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const title = optionalString(body.title, "営業ログタイトル", 200) || rawMessage.replace(/(営業ログ|活動ログ|対応履歴|履歴|メモ|登録|追加)/g, "").trim() || "営業ログ";
  const occurredAt = parseIsoDate(body.occurredAt, "発生日") ?? new Date();
  const ref = await auth.db.collection("activities").add({
    title,
    content: optionalString(body.content ?? body.description, "内容", 5000) || rawMessage,
    activityType: optionalString(body.activityType, "活動種別", 80) || "memo",
    occurredAt: Timestamp.fromDate(occurredAt),
    companyId: optionalString(body.companyId, "会社ID", 160) || null,
    companyName: optionalString(body.companyName, "会社名", 200) || null,
    origin: "desktop",
    environment: runtimeEnvironment(),
    createdBy: auth.userId,
    createdByName: getUserDisplayNameById(auth.userId),
    updatedBy: auth.userId,
    updatedByName: getUserDisplayNameById(auth.userId),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { handled: true, kind: "activity" as const, message: "営業ログを登録しました", items: [{ id: ref.id, title }], draft: null };
}

async function createLeadFromCommand(auth: DesktopAuth, body: Record<string, unknown>, rawMessage: string) {
  const name = optionalString(body.name, "見込み客名", 200) || optionalString(body.companyName, "会社名", 200) || rawMessage.replace(/(見込み客|リード|営業リスト|登録|追加|作成)/g, "").trim();
  if (!name) return { handled: true, kind: "lead" as const, message: "見込み客名を入力してください", items: [], draft: null };
  const ref = await auth.db.collection("leads").add({
    name,
    companyName: optionalString(body.companyName, "会社名", 200) || name,
    status: optionalString(body.status, "状態", 80) || "new",
    ownerId: auth.userId,
    ownerName: getUserDisplayNameById(auth.userId),
    origin: "desktop",
    environment: runtimeEnvironment(),
    createdBy: auth.userId,
    createdByName: getUserDisplayNameById(auth.userId),
    updatedBy: auth.userId,
    updatedByName: getUserDisplayNameById(auth.userId),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { handled: true, kind: "lead" as const, message: "営業リストへ登録しました", items: [{ id: ref.id, name }], draft: null };
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
    return { handled: true, kind: "notification" as const, message: "通知をすべて既読にしました", items: [{ count }], draft: null };
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

function parseDateFromText(rawMessage: string): Date | null {
  const time = rawMessage.match(/(\d{1,2})[:時](\d{2})?/);
  const hour = time?.[1] ? Number(time[1]) : 10;
  const minute = time?.[2] ? Number(time[2]) : 0;
  const base = new Date();
  if (/明後日/.test(rawMessage)) base.setDate(base.getDate() + 2);
  else if (/明日/.test(rawMessage)) base.setDate(base.getDate() + 1);
  const md = rawMessage.match(/(\d{1,2})月(\d{1,2})日/);
  if (md) {
    base.setMonth(Number(md[1]) - 1);
    base.setDate(Number(md[2]));
  }
  if (!time && !/(今日|明日|明後日|\d{1,2}月\d{1,2}日)/.test(rawMessage)) return null;
  base.setHours(hour, minute, 0, 0);
  return base;
}

function extractCompanyName(rawMessage: string) {
  const match = rawMessage.match(/([^\s、。]+)(?:さん|社|会社|との|の)?(?:と|の)?(?:予定|商談|打ち合わせ|会議|訪問)/);
  return match?.[1]?.trim() || "";
}

function extractNameAfter(rawMessage: string, marker: RegExp) {
  const index = rawMessage.search(marker);
  if (index < 0) return "";
  return rawMessage.slice(index).replace(marker, "").replace(/(登録|追加|作成|して|する)/g, "").trim();
}

async function findCompanyByName(auth: DesktopAuth, name: string) {
  const snapshot = await auth.db.collection("companies").orderBy("updatedAt", "desc").limit(200).get();
  const normalized = normalizeComparableName(name);
  const found = snapshot.docs.find((entry) => normalizeComparableName(String(entry.data().name ?? "")) === normalized);
  return found ? { id: found.id, name: String(found.data().name ?? "") } : null;
}

async function findDuplicateNames(auth: DesktopAuth, collectionName: string, name: string, fields: string[]) {
  const snapshot = await auth.db.collection(collectionName).orderBy("updatedAt", "desc").limit(400).get();
  return findNameDuplicates(snapshot.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() })), name, fields).slice(0, 5).map((item) => ({ id: item.id, name: item.name ?? item.displayName ?? item.title }));
}

function matches(item: Record<string, unknown>, keyword: string) {
  return Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(keyword));
}

function runtimeEnvironment() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production" ? "production" : "development";
}
