import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { timestampToIso } from "@/lib/desktop/format";
import { arrayOfStrings, assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";
import type { LeadStatus } from "@/types/lead";

const COLLECTION = "leads";
const leadStatuses = ["new", "contacting", "document_sent", "sent", "appointment", "meeting", "considering", "hold", "won", "lost"] as const;

export type LeadListOptions = {
  limit?: number;
  companyId?: string | null;
  status?: LeadStatus | null;
};

export async function listLeads(auth: BusinessAuth, options: LeadListOptions = {}) {
  const snapshot = await auth.db.collection(COLLECTION).orderBy("updatedAt", "desc").limit(options.limit ?? 500).get();
  return snapshot.docs
    .map((entry) => serializeLead(entry.id, entry.data()))
    .filter((lead) => !options.companyId || lead.companyId === options.companyId)
    .filter((lead) => !options.status || lead.status === options.status);
}

export async function searchLeads(auth: BusinessAuth, query: string, options: LeadListOptions = {}) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];
  return (await listLeads(auth, { ...options, limit: Math.max(options.limit ?? 20, 200) }))
    .filter((lead) => matchesLead(lead, keyword))
    .slice(0, options.limit ?? 20);
}

export async function getLeadById(auth: BusinessAuth, leadId: string) {
  const snapshot = await auth.db.collection(COLLECTION).doc(leadId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "営業リストが見つかりません。", 404);
  return serializeLead(snapshot.id, snapshot.data() ?? {});
}

export async function createLead(auth: BusinessAuth, body: Record<string, unknown>) {
  const companyName = requireString(body.companyName ?? body.name, "営業リストの会社名");
  const force = body.force === true;
  const duplicates = await findTimeDuplicates(auth.db, COLLECTION, { title: companyName, companyId: nullableString(body.companyId) });
  if (duplicates.length && !force) return { id: null, leadId: null, requiresConfirmation: true, duplicates };
  const ref = await auth.db.collection(COLLECTION).add(buildLeadPayload(auth, { ...body, companyName }, companyName));
  return { id: ref.id, leadId: ref.id, requiresConfirmation: false };
}

export async function updateLead(auth: BusinessAuth, body: Record<string, unknown>) {
  const leadId = requireString(body.id ?? body.leadId, "営業リストID", 160);
  const ref = auth.db.collection(COLLECTION).doc(leadId);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  await ref.set(buildLeadUpdatePayload(auth, body, previous), { merge: true });
  const next = await ref.get();
  return { lead: serializeLead(next.id, next.data() ?? {}) };
}

export async function updateLeadProfile(auth: BusinessAuth, leadId: string, profile: Record<string, unknown>) {
  return updateLead(auth, { ...profile, id: leadId });
}

export async function changeLeadStatus(auth: BusinessAuth, leadId: string, status: unknown) {
  return updateLead(auth, { id: leadId, status });
}

export async function updateLeadWebsiteUrl(auth: BusinessAuth, leadId: string, websiteUrl: unknown) {
  return updateLead(auth, { id: leadId, websiteUrl });
}

export async function linkLeadToCompany(auth: BusinessAuth, leadId: string, companyId: string, companyName?: string | null) {
  return updateLead(auth, { id: leadId, companyId, companyName: companyName ?? undefined });
}

export async function updateLeadAfterActivity(auth: BusinessAuth, leadId: string, input: { occurredAt: unknown; nextActionAt?: unknown; nextActionTitle?: unknown; status?: unknown }) {
  const hasNextAction = Boolean(nullableString(input.nextActionTitle, 200) || parseDate(input.nextActionAt));
  const patch = {
    id: leadId,
    lastActivityAt: input.occurredAt,
    ...(hasNextAction ? { nextActionAt: input.nextActionAt, nextActionTitle: input.nextActionTitle } : {}),
    ...(input.status ? { status: input.status } : {})
  };
  return updateLead(auth, patch);
}

export async function deleteLead(auth: BusinessAuth, leadId: string) {
  const ref = auth.db.collection(COLLECTION).doc(leadId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "営業リストが見つかりません。", 404);
  await ref.delete();
  return { id: leadId, deleted: true };
}

export async function getLeadDeletionImpact(auth: BusinessAuth, leadId: string) {
  const lead = await getLeadById(auth, leadId);
  const companyId = nullableString(lead.companyId, 160);
  const [activities, tasks, leadCalendarEvents, relatedCompanyCalendarEvents] = await Promise.all([
    auth.db.collection("activities").where("leadId", "==", leadId).limit(1000).get(),
    auth.db.collection("tasks").where("leadId", "==", leadId).limit(1000).get(),
    auth.db.collection("calendarEvents").where("leadId", "==", leadId).limit(1000).get(),
    companyId ? auth.db.collection("calendarEvents").where("companyId", "==", companyId).limit(1000).get() : Promise.resolve(null)
  ]);
  return {
    leadId,
    companyId,
    activitiesCount: activities.size,
    tasksCount: tasks.size,
    calendarEventsCount: leadCalendarEvents.size,
    relatedCompanyCalendarEventsCount: relatedCompanyCalendarEvents?.size ?? 0
  };
}

export function normalizeLeadStatus(value: unknown, fallback: unknown = "new"): LeadStatus {
  if (leadStatuses.includes(value as LeadStatus)) return value as LeadStatus;
  if (leadStatuses.includes(fallback as LeadStatus)) return fallback as LeadStatus;
  return "new";
}

export function buildLeadPayload(auth: BusinessAuth, body: Record<string, unknown>, companyName = requireString(body.companyName ?? body.name, "営業リストの会社名")) {
  return {
    companyName,
    contactName: optionalString(body.contactName, 120),
    contactRole: optionalString(body.contactRole, 120),
    phone: optionalString(body.phone, 80),
    email: optionalString(body.email, 160),
    website: optionalString(body.website ?? body.websiteUrl, 300),
    industry: optionalString(body.industry, 120),
    source: optionalString(body.source, 120),
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 200),
    status: normalizeLeadStatus(body.status),
    prospectRank: optionalString(body.prospectRank, 40),
    appointmentAt: parseDate(body.appointmentAt),
    nextActionAt: parseDate(body.nextActionAt),
    nextActionTitle: nullableString(body.nextActionTitle, 200),
    lastActivityAt: parseDate(body.lastActivityAt),
    assignedUserId: nullableString(body.assignedUserId, 160),
    assignedUserName: nullableString(body.assignedUserName, 160),
    notes: optionalString(body.notes, 5000),
    companyId: nullableString(body.companyId, 160),
    ...defaultBusinessFields(auth)
  };
}

export function serializeLead(id: string, data: DocumentData): DocumentData {
  return {
    ...serializeDoc(id, data),
    status: normalizeLeadStatus(data.status),
    website: optionalString(data.website ?? data.websiteUrl, 300),
    productId: nullableString(data.productId, 160),
    productName: nullableString(data.productName, 200),
    companyId: nullableString(data.companyId, 160),
    assignedUserId: nullableString(data.assignedUserId, 160),
    assignedUserName: nullableString(data.assignedUserName, 160),
    nextActionTitle: nullableString(data.nextActionTitle, 200)
  };
}

export function toDesktopLeadPayload(lead: DocumentData) {
  return {
    id: String(lead.id ?? ""),
    name: String(lead.companyName ?? lead.name ?? ""),
    companyName: String(lead.companyName ?? ""),
    contactName: String(lead.contactName ?? ""),
    status: String(lead.status ?? "new"),
    productName: lead.productName ?? null,
    companyId: lead.companyId ?? null,
    nextActionTitle: lead.nextActionTitle ?? null,
    nextActionAt: isoDate(lead.nextActionAt),
    updatedAt: isoDate(lead.updatedAt)
  };
}

function buildLeadUpdatePayload(auth: BusinessAuth, body: Record<string, unknown>, previous: DocumentData) {
  return {
    ...cleanPatchBody(body, ["action"]),
    ...(body.companyName !== undefined || body.name !== undefined ? { companyName: requireString(body.companyName ?? body.name, "営業リストの会社名") } : {}),
    ...(body.contactName !== undefined ? { contactName: optionalString(body.contactName, 120) } : {}),
    ...(body.contactRole !== undefined ? { contactRole: optionalString(body.contactRole, 120) } : {}),
    ...(body.phone !== undefined ? { phone: optionalString(body.phone, 80) } : {}),
    ...(body.email !== undefined ? { email: optionalString(body.email, 160) } : {}),
    ...(body.website !== undefined || body.websiteUrl !== undefined ? { website: optionalString(body.website ?? body.websiteUrl, 300) } : {}),
    ...(body.industry !== undefined ? { industry: optionalString(body.industry, 120) } : {}),
    ...(body.source !== undefined ? { source: optionalString(body.source, 120) } : {}),
    ...(body.productId !== undefined ? { productId: nullableString(body.productId, 160) } : {}),
    ...(body.productName !== undefined ? { productName: nullableString(body.productName, 200) } : {}),
    ...(body.status !== undefined ? { status: normalizeLeadStatus(body.status, previous.status) } : {}),
    ...(body.prospectRank !== undefined ? { prospectRank: optionalString(body.prospectRank, 40) } : {}),
    ...(body.appointmentAt !== undefined ? { appointmentAt: parseDate(body.appointmentAt) } : {}),
    ...(body.nextActionAt !== undefined ? { nextActionAt: parseDate(body.nextActionAt) } : {}),
    ...(body.nextActionTitle !== undefined ? { nextActionTitle: nullableString(body.nextActionTitle, 200) } : {}),
    ...(body.lastActivityAt !== undefined ? { lastActivityAt: parseDate(body.lastActivityAt) } : {}),
    ...(body.assignedUserId !== undefined ? { assignedUserId: nullableString(body.assignedUserId, 160) } : {}),
    ...(body.assignedUserName !== undefined ? { assignedUserName: nullableString(body.assignedUserName, 160) } : {}),
    ...(body.notes !== undefined ? { notes: optionalString(body.notes, 5000) } : {}),
    ...(body.companyId !== undefined ? { companyId: nullableString(body.companyId, 160) } : {}),
    ...(body.tags !== undefined ? { tags: arrayOfStrings(body.tags) } : {}),
    id: FieldValue.delete(),
    leadId: FieldValue.delete(),
    websiteUrl: FieldValue.delete(),
    ...updateBusinessFields(auth)
  };
}

function matchesLead(lead: DocumentData, keyword: string) {
  const fields = [
    lead.companyName,
    lead.name,
    lead.contactName,
    lead.contactRole,
    lead.phone,
    lead.email,
    lead.website,
    lead.industry,
    lead.productName,
    lead.status,
    lead.prospectRank,
    lead.assignedUserName,
    lead.notes
  ];
  return fields.some((value) => String(value ?? "").toLowerCase().includes(keyword));
}

function isoDate(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return timestampToIso(value);
}
