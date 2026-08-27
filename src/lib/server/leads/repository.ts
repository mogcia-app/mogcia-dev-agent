import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export const leadsCollection = "leads";
export const activitiesCollection = "activities";

export async function listLeads(count = 200) {
  const snapshot = await getAdminDb().collection(leadsCollection).orderBy("updatedAt", "desc").limit(count).get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...serialize(entry.data()) }));
}

export async function getLead(leadId: string) {
  const snapshot = await getAdminDb().collection(leadsCollection).doc(leadId).get();
  return snapshot.exists ? { id: snapshot.id, ...serialize(snapshot.data() ?? {}) } : null;
}

export async function createLeadForUser(input: Record<string, unknown>, user: { uid: string; name?: string }) {
  const ref = await getAdminDb().collection(leadsCollection).add({
    companyName: stringValue(input.companyName),
    contactName: stringValue(input.contactName),
    contactRole: stringValue(input.contactRole),
    phone: stringValue(input.phone),
    email: stringValue(input.email),
    source: stringValue(input.source),
    productId: nullableString(input.productId),
    productName: nullableString(input.productName),
    status: validLeadStatus(input.status),
    prospectRank: stringValue(input.prospectRank),
    appointmentAt: dateOrNull(input.appointmentAt),
    nextActionAt: dateOrNull(input.nextActionAt),
    nextActionTitle: nullableString(input.nextActionTitle),
    lastActivityAt: null,
    assignedUserId: nullableString(input.assignedUserId),
    assignedUserName: nullableString(input.assignedUserName),
    notes: stringValue(input.notes),
    companyId: nullableString(input.companyId),
    createdBy: user.uid,
    createdByName: user.name ?? "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { id: ref.id };
}

export async function updateLeadForUser(leadId: string, input: Record<string, unknown>) {
  await getAdminDb().collection(leadsCollection).doc(leadId).update({
    companyName: stringValue(input.companyName),
    contactName: stringValue(input.contactName),
    contactRole: stringValue(input.contactRole),
    phone: stringValue(input.phone),
    email: stringValue(input.email),
    source: stringValue(input.source),
    productId: nullableString(input.productId),
    productName: nullableString(input.productName),
    status: validLeadStatus(input.status),
    prospectRank: stringValue(input.prospectRank),
    appointmentAt: dateOrNull(input.appointmentAt),
    nextActionAt: dateOrNull(input.nextActionAt),
    nextActionTitle: nullableString(input.nextActionTitle),
    assignedUserId: nullableString(input.assignedUserId),
    assignedUserName: nullableString(input.assignedUserName),
    notes: stringValue(input.notes),
    companyId: nullableString(input.companyId),
    updatedAt: FieldValue.serverTimestamp()
  });
  return getLead(leadId);
}

export async function listLeadActivities(leadId: string, count = 100) {
  const snapshot = await getAdminDb().collection(activitiesCollection).where("leadId", "==", leadId).orderBy("occurredAt", "desc").limit(count).get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...serialize(entry.data()) }));
}

export async function createActivityForUser(input: Record<string, unknown>, user: { uid: string; name?: string }) {
  const occurredAt = dateOrNow(input.occurredAt);
  const ref = await getAdminDb().collection(activitiesCollection).add({
    leadId: nullableString(input.leadId),
    companyId: nullableString(input.companyId),
    dealId: nullableString(input.dealId),
    type: validActivityType(input.type),
    title: stringValue(input.title),
    content: stringValue(input.content),
    productId: nullableString(input.productId),
    productName: nullableString(input.productName),
    audioId: nullableString(input.audioId),
    transcriptId: nullableString(input.transcriptId),
    analysisId: nullableString(input.analysisId),
    legacyCompanyActivityLogId: nullableString(input.legacyCompanyActivityLogId),
    nextActionAt: dateOrNull(input.nextActionAt),
    nextActionTitle: nullableString(input.nextActionTitle),
    occurredAt,
    createdBy: user.uid,
    createdByName: user.name ?? "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  const leadId = nullableString(input.leadId);
  if (leadId) {
    await getAdminDb().collection(leadsCollection).doc(leadId).update({
      lastActivityAt: occurredAt,
      nextActionAt: dateOrNull(input.nextActionAt),
      nextActionTitle: nullableString(input.nextActionTitle),
      updatedAt: FieldValue.serverTimestamp()
    });
  }
  return { id: ref.id };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const next = stringValue(value);
  return next || null;
}

function validLeadStatus(value: unknown): string {
  return value === "contacting" || value === "document_sent" || value === "appointment" || value === "meeting" || value === "considering" || value === "hold" || value === "won" || value === "lost" ? value : "new";
}

function validActivityType(value: unknown): string {
  return value === "call" || value === "email" || value === "document" || value === "meeting" || value === "telemarketing" || value === "note" || value === "status_change" ? value : "other";
}

function dateOrNull(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function dateOrNow(value: unknown): Timestamp {
  return dateOrNull(value) ?? Timestamp.now();
}

function serialize(data: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeValue(value)]));
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") return serialize(value as DocumentData);
  return value;
}
