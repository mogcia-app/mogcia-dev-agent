import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { timestampToIso } from "@/lib/desktop/format";
import { arrayOfStrings, assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, findCollectionNameDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";
import type { CompanyStatus } from "@/types/company";

const COLLECTION = "companies";
const companyStatuses = ["lead", "prospect", "customer", "inactive", "archived"] as const;

export type CompanyListOptions = {
  limit?: number;
  includeArchived?: boolean;
};

export async function listCompanies(auth: BusinessAuth, options: CompanyListOptions = {}) {
  const snapshot = await auth.db.collection(COLLECTION).orderBy("updatedAt", "desc").limit(options.limit ?? 500).get();
  return snapshot.docs
    .map((entry) => serializeCompany(entry.id, entry.data()))
    .filter((company) => options.includeArchived || company.status !== "archived");
}

export async function searchCompanies(auth: BusinessAuth, query: string, options: CompanyListOptions = {}) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];
  return (await listCompanies(auth, { ...options, includeArchived: options.includeArchived ?? false }))
    .filter((company) => matchesCompany(company, keyword))
    .slice(0, options.limit ?? 20);
}

export async function getCompanyById(auth: BusinessAuth, companyId: string) {
  const snapshot = await auth.db.collection(COLLECTION).doc(companyId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "会社が見つかりません。", 404);
  return serializeCompany(snapshot.id, snapshot.data() ?? {});
}

export async function createCompany(auth: BusinessAuth, body: Record<string, unknown>) {
  const name = requireString(body.name, "会社名");
  const force = body.force === true;
  const duplicates = await findCollectionNameDuplicates(auth.db, COLLECTION, name, ["name", "nameKana"]);
  if (duplicates.length && !force) return { id: null, companyId: null, requiresConfirmation: true, duplicates };
  const ref = await auth.db.collection(COLLECTION).add(buildCompanyPayload(auth, body, name));
  return { id: ref.id, companyId: ref.id, requiresConfirmation: false };
}

export async function updateCompany(auth: BusinessAuth, body: Record<string, unknown>) {
  const companyId = requireString(body.id ?? body.companyId, "会社ID", 160);
  const ref = auth.db.collection(COLLECTION).doc(companyId);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  await ref.set(buildCompanyUpdatePayload(auth, body, previous), { merge: true });
  const next = await ref.get();
  return { company: serializeCompany(next.id, next.data() ?? {}) };
}

export async function updateCompanyProfile(auth: BusinessAuth, companyId: string, profile: Record<string, unknown>) {
  return updateCompany(auth, { ...profile, id: companyId });
}

export async function changeCompanyStatus(auth: BusinessAuth, companyId: string, status: unknown) {
  return updateCompany(auth, { id: companyId, status });
}

export async function setCompanyFavorite(auth: BusinessAuth, companyId: string, favorite: boolean) {
  const current = await getCompanyById(auth, companyId);
  const currentIds = Array.isArray(current.favoriteUserIds) ? current.favoriteUserIds.map(String) : [];
  const favoriteUserIds = favorite ? Array.from(new Set([...currentIds, auth.userId])) : currentIds.filter((id) => id !== auth.userId);
  const ref = auth.db.collection(COLLECTION).doc(companyId);
  await ref.set({ favoriteUserIds, ...updateBusinessFields(auth) }, { merge: true });
  const next = await ref.get();
  return { company: serializeCompany(next.id, next.data() ?? {}) };
}

export async function deleteCompany(auth: BusinessAuth, companyId: string) {
  const ref = auth.db.collection(COLLECTION).doc(companyId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "会社が見つかりません。", 404);
  await ref.delete();
  return { id: companyId, deleted: true };
}

export async function getCompanyDeletionImpact(auth: BusinessAuth, companyId: string) {
  await getCompanyById(auth, companyId);
  const [tasks, calendarEvents, activities, leads, activityLogs, files, memos, meetings] = await Promise.all([
    auth.db.collection("tasks").where("companyId", "==", companyId).limit(1000).get(),
    auth.db.collection("calendarEvents").where("companyId", "==", companyId).limit(1000).get(),
    auth.db.collection("activities").where("companyId", "==", companyId).limit(1000).get(),
    auth.db.collection("leads").where("companyId", "==", companyId).limit(1000).get(),
    auth.db.collection(COLLECTION).doc(companyId).collection("activityLogs").limit(1000).get(),
    auth.db.collection(COLLECTION).doc(companyId).collection("files").limit(1000).get(),
    auth.db.collection(COLLECTION).doc(companyId).collection("memos").limit(1000).get(),
    auth.db.collection(COLLECTION).doc(companyId).collection("meetings").limit(1000).get()
  ]);
  return {
    companyId,
    tasksCount: tasks.size,
    calendarEventsCount: calendarEvents.size,
    activitiesCount: activities.size,
    leadsCount: leads.size,
    subcollections: {
      activityLogsCount: activityLogs.size,
      filesCount: files.size,
      memosCount: memos.size,
      meetingsCount: meetings.size
    }
  };
}

export function normalizeCompanyStatus(value: unknown, fallback: unknown = "lead"): CompanyStatus {
  if (companyStatuses.includes(value as CompanyStatus)) return value as CompanyStatus;
  if (companyStatuses.includes(fallback as CompanyStatus)) return fallback as CompanyStatus;
  return "lead";
}

export function buildCompanyPayload(auth: BusinessAuth, body: Record<string, unknown>, name = requireString(body.name, "会社名")) {
  return {
    name,
    nameKana: optionalString(body.nameKana, 200),
    industry: optionalString(body.industry, 120),
    companyType: optionalString(body.companyType, 120),
    postalCode: optionalString(body.postalCode, 40),
    prefecture: optionalString(body.prefecture, 120),
    city: optionalString(body.city, 120),
    region: optionalString(body.region, 120),
    address: optionalString(body.address, 500),
    phone: optionalString(body.phone, 80),
    email: optionalString(body.email, 160),
    website: optionalString(body.website, 300),
    status: normalizeCompanyStatus(body.status, "lead"),
    customerRank: optionalString(body.customerRank, 20) || "C",
    contacts: Array.isArray(body.contacts) ? body.contacts : [],
    primaryContactId: nullableString(body.primaryContactId, 160),
    primaryContactName: nullableString(body.primaryContactName, 120),
    internalOwnerId: nullableString(body.internalOwnerId, 160) ?? auth.userId,
    internalOwnerName: nullableString(body.internalOwnerName, 160) ?? auth.userName,
    companionUserIds: arrayOfStrings(body.companionUserIds),
    companionNames: arrayOfStrings(body.companionNames),
    productIds: arrayOfStrings(body.productIds),
    productNames: arrayOfStrings(body.productNames),
    tags: arrayOfStrings(body.tags),
    favoriteUserIds: arrayOfStrings(body.favoriteUserIds),
    notes: optionalString(body.notes, 5000),
    ...defaultBusinessFields(auth)
  };
}

export function serializeCompany(id: string, data: DocumentData): DocumentData {
  return {
    ...serializeDoc(id, data),
    status: normalizeCompanyStatus(data.status, "lead"),
    favoriteUserIds: Array.isArray(data.favoriteUserIds) ? data.favoriteUserIds : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    companionUserIds: Array.isArray(data.companionUserIds) ? data.companionUserIds : [],
    companionNames: Array.isArray(data.companionNames) ? data.companionNames : [],
    productIds: Array.isArray(data.productIds) ? data.productIds : [],
    productNames: Array.isArray(data.productNames) ? data.productNames : []
  };
}

export function toDesktopCompanyPayload(company: DocumentData) {
  return {
    id: String(company.id ?? ""),
    name: String(company.name ?? ""),
    industry: String(company.industry ?? ""),
    primaryContactName: String(company.primaryContactName ?? ""),
    internalOwnerName: String(company.internalOwnerName ?? ""),
    lastContactAt: isoDate(company.lastContactAt)
  };
}

export function toDesktopCompanyDetailPayload(company: DocumentData) {
  return {
    id: String(company.id ?? ""),
    name: String(company.name ?? ""),
    industry: String(company.industry ?? ""),
    status: String(company.status ?? ""),
    internalOwnerName: String(company.internalOwnerName ?? ""),
    primaryContactName: String(company.primaryContactName ?? ""),
    phone: String(company.phone ?? ""),
    email: String(company.email ?? ""),
    productNames: Array.isArray(company.productNames) ? company.productNames : [],
    nextActionTitle: String(company.nextActionTitle ?? ""),
    nextActionAt: isoDate(company.nextActionAt),
    targetURL: `/sales/companies?companyId=${String(company.id ?? "")}`,
    aiSuggestion: company.nextActionTitle ? "次回対応の期限を確認しておくとよさそうです。" : "次回対応を設定しておくとよさそうです。"
  };
}

function buildCompanyUpdatePayload(auth: BusinessAuth, body: Record<string, unknown>, previous: DocumentData) {
  return {
    ...cleanPatchBody(body),
    ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
    ...(body.status === undefined ? { status: normalizeCompanyStatus(previous.status, "lead") } : { status: normalizeCompanyStatus(body.status, previous.status) }),
    ...(body.nameKana !== undefined ? { nameKana: optionalString(body.nameKana, 200) } : {}),
    ...(body.industry !== undefined ? { industry: optionalString(body.industry, 120) } : {}),
    ...(body.companyType !== undefined ? { companyType: optionalString(body.companyType, 120) } : {}),
    ...(body.postalCode !== undefined ? { postalCode: optionalString(body.postalCode, 40) } : {}),
    ...(body.prefecture !== undefined ? { prefecture: optionalString(body.prefecture, 120) } : {}),
    ...(body.city !== undefined ? { city: optionalString(body.city, 120) } : {}),
    ...(body.region !== undefined ? { region: optionalString(body.region, 120) } : {}),
    ...(body.address !== undefined ? { address: optionalString(body.address, 500) } : {}),
    ...(body.phone !== undefined ? { phone: optionalString(body.phone, 80) } : {}),
    ...(body.email !== undefined ? { email: optionalString(body.email, 160) } : {}),
    ...(body.website !== undefined ? { website: optionalString(body.website, 300) } : {}),
    ...(body.customerRank !== undefined ? { customerRank: optionalString(body.customerRank, 20) || "C" } : {}),
    ...(body.primaryContactId !== undefined ? { primaryContactId: nullableString(body.primaryContactId, 160) } : {}),
    ...(body.primaryContactName !== undefined ? { primaryContactName: nullableString(body.primaryContactName, 120) } : {}),
    ...(body.internalOwnerId !== undefined ? { internalOwnerId: nullableString(body.internalOwnerId, 160) ?? auth.userId } : {}),
    ...(body.internalOwnerName !== undefined ? { internalOwnerName: nullableString(body.internalOwnerName, 160) ?? auth.userName } : {}),
    ...(body.contacts !== undefined ? { contacts: Array.isArray(body.contacts) ? body.contacts : [] } : {}),
    ...(body.companionUserIds !== undefined ? { companionUserIds: arrayOfStrings(body.companionUserIds) } : {}),
    ...(body.companionNames !== undefined ? { companionNames: arrayOfStrings(body.companionNames) } : {}),
    ...(body.productIds !== undefined ? { productIds: arrayOfStrings(body.productIds) } : {}),
    ...(body.productNames !== undefined ? { productNames: arrayOfStrings(body.productNames) } : {}),
    ...(body.tags !== undefined ? { tags: arrayOfStrings(body.tags) } : {}),
    ...(body.favoriteUserIds !== undefined ? { favoriteUserIds: arrayOfStrings(body.favoriteUserIds) } : {}),
    ...(body.lastContactAt !== undefined ? { lastContactAt: parseDate(body.lastContactAt) } : {}),
    ...(body.nextActionAt !== undefined ? { nextActionAt: parseDate(body.nextActionAt) } : {}),
    ...(body.nextActionTitle !== undefined ? { nextActionTitle: nullableString(body.nextActionTitle, 200) } : {}),
    ...(body.archivedAt !== undefined ? { archivedAt: parseDate(body.archivedAt) } : {}),
    ...(body.notes !== undefined ? { notes: optionalString(body.notes, 5000) } : {}),
    id: FieldValue.delete(),
    companyId: FieldValue.delete(),
    ...updateBusinessFields(auth)
  };
}

function matchesCompany(company: DocumentData, keyword: string) {
  const fields = [
    company.name,
    company.nameKana,
    company.primaryContactName,
    company.internalOwnerName,
    company.phone,
    company.email,
    company.industry,
    ...(Array.isArray(company.tags) ? company.tags : [])
  ];
  return fields.some((value) => String(value ?? "").toLowerCase().includes(keyword));
}

function isoDate(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return timestampToIso(value);
}
