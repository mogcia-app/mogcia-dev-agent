"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { businessApi, toJsonBody } from "@/lib/business-api-client";
import { activityTypeLabels } from "@/lib/lead-utils";
import type { Activity, ActivityDraft, ActivityType, Lead, LeadDraft, LeadStatus } from "@/types/lead";

export const leadsCollection = "leads";
export const activitiesCollection = "activities";

function nowTs(): Timestamp {
  return Timestamp.now();
}

function ts(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : nowTs();
}

function nullableTs(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeLead(id: string, data: DocumentData): Lead {
  const status = isLeadStatus(data.status) ? data.status : "new";
  return {
    id,
    companyName: str(data.companyName),
    contactName: str(data.contactName),
    contactRole: str(data.contactRole),
    phone: str(data.phone),
    email: str(data.email),
    source: str(data.source),
    productId: optionalStr(data.productId),
    productName: optionalStr(data.productName),
    status,
    prospectRank: str(data.prospectRank),
    appointmentAt: nullableTs(data.appointmentAt),
    nextActionAt: nullableTs(data.nextActionAt),
    nextActionTitle: optionalStr(data.nextActionTitle),
    lastActivityAt: nullableTs(data.lastActivityAt),
    assignedUserId: optionalStr(data.assignedUserId),
    assignedUserName: optionalStr(data.assignedUserName),
    notes: str(data.notes),
    companyId: optionalStr(data.companyId),
    createdBy: str(data.createdBy),
    createdByName: str(data.createdByName),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt)
  };
}

export function normalizeActivity(id: string, data: DocumentData): Activity {
  return {
    id,
    leadId: optionalStr(data.leadId),
    companyId: optionalStr(data.companyId),
    dealId: optionalStr(data.dealId),
    type: isActivityType(data.type) ? data.type : "other",
    title: str(data.title),
    content: str(data.content),
    productId: optionalStr(data.productId),
    productName: optionalStr(data.productName),
    audioId: optionalStr(data.audioId),
    transcriptId: optionalStr(data.transcriptId),
    analysisId: optionalStr(data.analysisId),
    legacyCompanyActivityLogId: optionalStr(data.legacyCompanyActivityLogId),
    nextActionAt: nullableTs(data.nextActionAt),
    nextActionTitle: optionalStr(data.nextActionTitle),
    createdBy: str(data.createdBy),
    createdByName: str(data.createdByName),
    occurredAt: ts(data.occurredAt),
    createdAt: ts(data.createdAt),
    updatedAt: nullableTs(data.updatedAt)
  };
}

export function subscribeLeads(onNext: (leads: Lead[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, leadsCollection), orderBy("updatedAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeLead(entry.id, entry.data()))), onError);
}

export function subscribeLeadActivities(leadId: string, onNext: (activities: Activity[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db || !leadId) return () => undefined;
  return onSnapshot(query(collection(db, activitiesCollection), where("leadId", "==", leadId), orderBy("occurredAt", "desc"), limit(100)), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeActivity(entry.id, entry.data()))), onError);
}

export function subscribeCompanyActivities(companyId: string, onNext: (activities: Activity[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db || !companyId) return () => undefined;
  return onSnapshot(query(collection(db, activitiesCollection), where("companyId", "==", companyId), orderBy("occurredAt", "desc"), limit(100)), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeActivity(entry.id, entry.data()))), onError);
}

export async function createLead(draft: LeadDraft, user: { id: string; name: string }): Promise<string> {
  const result = await businessApi<{ id: string; leadId?: string }>("/api/business/leads", {
    method: "POST",
    body: toJsonBody({ ...leadDraftPayload(draft), createdBy: user.id, createdByName: user.name })
  });
  return result.leadId ?? result.id;
}

export async function updateLead(leadId: string, draft: LeadDraft, user: { id: string; name: string }): Promise<void> {
  await businessApi<{ lead: Lead }>("/api/business/leads", {
    method: "PATCH",
    body: toJsonBody({ ...leadDraftPayload(draft), id: leadId, updatedBy: user.id, updatedByName: user.name })
  });
  if (draft.status === "won" && draft.companyId) {
    await createActivity({
      leadId,
      companyId: draft.companyId,
      type: "status_change",
      title: "会社一覧へ関連付けました",
      content: "見込み客と会社を関連付けました。",
      productId: draft.productId || null,
      productName: draft.productName || null,
      occurredAt: Timestamp.now()
    }, user);
  }
}

export async function linkLeadToCompany(leadId: string, companyId: string, user: { id: string; name: string }): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, leadsCollection, leadId), { companyId, updatedAt: serverTimestamp() });
  await createActivity({ leadId, companyId, type: "status_change", title: "会社に関連付けました", occurredAt: Timestamp.now() }, user);
}

export async function linkAnalysisToLead(input: { leadId: string; analysisId: string; companyId?: string | null; productId?: string | null; productName?: string | null; type?: ActivityType; title?: string; occurredAt?: Timestamp }, user: { id: string; name: string }): Promise<void> {
  await createActivity({
    leadId: input.leadId,
    companyId: input.companyId ?? null,
    type: input.type ?? "telemarketing",
    title: input.title ?? "分析データを関連付けました",
    productId: input.productId ?? null,
    productName: input.productName ?? null,
    analysisId: input.analysisId,
    audioId: input.analysisId,
    transcriptId: input.analysisId,
    occurredAt: input.occurredAt ?? Timestamp.now()
  }, user);
}

export async function createManualActivity(target: { leadId?: string | null; companyId?: string | null }, draft: ActivityDraft, user: { id: string; name: string }): Promise<string> {
  return createActivity({
    ...target,
    type: draft.type,
    title: draft.title.trim() || activityTypeLabels[draft.type],
    content: draft.content.trim(),
    productId: draft.productId || null,
    productName: draft.productName || null,
    occurredAt: Timestamp.fromDate(new Date(draft.occurredAt)),
    nextActionAt: draft.nextActionAt ? Timestamp.fromDate(new Date(draft.nextActionAt)) : null,
    nextActionTitle: draft.nextActionTitle.trim() || null
  }, user);
}

export async function createActivity(input: Omit<Activity, "id" | "createdBy" | "createdByName" | "createdAt" | "updatedAt">, user: { id: string; name: string }): Promise<string> {
  const result = await businessApi<{ id: string; activityId?: string }>("/api/business/activities", {
    method: "POST",
    body: toJsonBody({
      leadId: input.leadId ?? null,
      companyId: input.companyId ?? null,
      dealId: input.dealId ?? null,
      type: input.type,
      title: input.title ?? activityTypeLabels[input.type],
      content: input.content ?? "",
      productId: input.productId ?? null,
      productName: input.productName ?? null,
      audioId: input.audioId ?? null,
      transcriptId: input.transcriptId ?? null,
      analysisId: input.analysisId ?? null,
      legacyCompanyActivityLogId: input.legacyCompanyActivityLogId ?? null,
      nextActionAt: input.nextActionAt ?? null,
      nextActionTitle: input.nextActionTitle ?? null,
      occurredAt: input.occurredAt,
      createdBy: user.id,
      createdByName: user.name
    })
  });
  return result.activityId ?? result.id;
}

function leadDraftPayload(draft: LeadDraft) {
  return {
    companyName: draft.companyName.trim(),
    contactName: draft.contactName.trim(),
    contactRole: draft.contactRole.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    source: draft.source.trim(),
    productId: draft.productId || null,
    productName: draft.productName.trim() || null,
    status: draft.status,
    prospectRank: draft.prospectRank.trim(),
    appointmentAt: draft.appointmentAt ? Timestamp.fromDate(new Date(draft.appointmentAt)) : null,
    nextActionAt: draft.nextActionAt ? Timestamp.fromDate(new Date(draft.nextActionAt)) : null,
    nextActionTitle: draft.nextActionTitle.trim() || null,
    assignedUserId: draft.assignedUserId || null,
    assignedUserName: draft.assignedUserName.trim() || null,
    notes: draft.notes.trim(),
    companyId: draft.companyId || null
  };
}

function isLeadStatus(value: unknown): value is LeadStatus {
  return value === "new" || value === "contacting" || value === "document_sent" || value === "appointment" || value === "meeting" || value === "considering" || value === "hold" || value === "won" || value === "lost";
}

function isActivityType(value: unknown): value is ActivityType {
  return value === "call" || value === "email" || value === "document" || value === "meeting" || value === "telemarketing" || value === "note" || value === "status_change" || value === "other";
}
