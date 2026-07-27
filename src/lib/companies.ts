"use client";

import { Timestamp, addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorageClient } from "@/lib/firebase/client";
import { createEmptyCompany } from "@/lib/company-utils";
import type { ActivityLogType, Company, CompanyActivityLog, CompanyFile, CompanyMeeting, CompanyMemo } from "@/types/company";

const companiesCollection = "companies";

function tsNow() {
  return Timestamp.now();
}

function normalizeCompany(id: string, data: DocumentData): Company {
  const now = tsNow();
  return {
    id,
    name: String(data.name ?? ""),
    nameKana: data.nameKana ?? "",
    logoUrl: data.logoUrl ?? null,
    industry: data.industry ?? "",
    companyType: data.companyType ?? "",
    postalCode: data.postalCode ?? "",
    address: data.address ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    website: data.website ?? "",
    employeeCount: data.employeeCount ?? "",
    foundedAt: data.foundedAt ?? "",
    revenueRange: data.revenueRange ?? "",
    status: data.status ?? "lead",
    customerRank: data.customerRank ?? "C",
    internalOwnerId: data.internalOwnerId ?? "",
    internalOwnerName: data.internalOwnerName ?? "",
    primaryContactId: data.primaryContactId ?? null,
    primaryContactName: data.primaryContactName ?? "",
    tags: data.tags ?? [],
    favoriteUserIds: data.favoriteUserIds ?? [],
    lastContactAt: data.lastContactAt instanceof Timestamp ? data.lastContactAt : null,
    nextActionAt: data.nextActionAt instanceof Timestamp ? data.nextActionAt : null,
    nextActionTitle: data.nextActionTitle ?? "",
    notes: data.notes ?? "",
    createdBy: data.createdBy ?? "",
    createdByName: data.createdByName ?? "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now,
    archivedAt: data.archivedAt instanceof Timestamp ? data.archivedAt : null
  };
}

function normalizeLog(id: string, data: DocumentData): CompanyActivityLog {
  const now = tsNow();
  return {
    id,
    companyId: data.companyId ?? "",
    type: data.type ?? "other",
    title: data.title ?? "",
    content: data.content ?? "",
    occurredAt: data.occurredAt instanceof Timestamp ? data.occurredAt : now,
    userId: data.userId ?? "",
    userName: data.userName ?? "",
    dealId: data.dealId ?? null,
    meetingId: data.meetingId ?? null,
    taskId: data.taskId ?? null,
    fileId: data.fileId ?? null,
    attachments: data.attachments ?? [],
    nextAction: data.nextAction ?? null,
    aiTaskRequested: Boolean(data.aiTaskRequested),
    aiTaskGeneratedIds: data.aiTaskGeneratedIds ?? [],
    source: data.source ?? "manual",
    createdBy: data.createdBy ?? "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now
  };
}

export function subscribeCompaniesMaster(onNext: (companies: Company[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, companiesCollection), orderBy("updatedAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeCompany(entry.id, entry.data()))), onError);
}

export function subscribeCompanyActivityLogs(companyId: string, count: number, onNext: (logs: CompanyActivityLog[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, companiesCollection, companyId, "activityLogs"), orderBy("occurredAt", "desc"), limit(count)), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeLog(entry.id, entry.data()))), onError);
}

export function subscribeCompanyMeetings(companyId: string, onNext: (meetings: CompanyMeeting[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, "meetings"), orderBy("createdAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CompanyMeeting)).filter((meeting) => meeting.companyId === companyId)), onError);
}

export function subscribeCompanyFiles(companyId: string, onNext: (files: CompanyFile[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, companiesCollection, companyId, "files"), orderBy("createdAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CompanyFile))), onError);
}

export function subscribeCompanyMemos(companyId: string, onNext: (memos: CompanyMemo[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, companiesCollection, companyId, "memos"), orderBy("createdAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CompanyMemo))), onError);
}

export async function createCompany(user: { id: string; name: string }, patch: Partial<Company>): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const ref = await addDoc(collection(db, companiesCollection), { ...createEmptyCompany(user), ...patch, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await addCompanyLog(ref.id, user, { type: "status_change", title: "会社を作成しました", content: patch.name ?? "", occurredAt: Timestamp.now(), source: "system" });
  return ref.id;
}

export async function updateCompany(companyId: string, user: { id: string; name: string }, patch: Partial<Company>): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, companiesCollection, companyId), { ...patch, updatedAt: serverTimestamp() });
  await addCompanyLog(companyId, user, { type: "status_change", title: "会社情報を更新しました", content: patch.name ?? "", occurredAt: Timestamp.now(), source: "system" });
}

export async function toggleCompanyFavorite(company: Company, userId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const favoriteUserIds = company.favoriteUserIds.includes(userId) ? company.favoriteUserIds.filter((id) => id !== userId) : [...company.favoriteUserIds, userId];
  await updateDoc(doc(db, companiesCollection, company.id), { favoriteUserIds, updatedAt: serverTimestamp() });
}

export async function addCompanyLog(companyId: string, user: { id: string; name: string }, input: { type: ActivityLogType; title: string; content?: string; occurredAt: Timestamp; source?: CompanyActivityLog["source"]; aiTaskRequested?: boolean; nextAction?: CompanyActivityLog["nextAction"] }): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const ref = await addDoc(collection(db, companiesCollection, companyId, "activityLogs"), { companyId, userId: user.id, userName: user.name, createdBy: user.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), source: "manual", ...input });
  await updateDoc(doc(db, companiesCollection, companyId), { lastContactAt: input.occurredAt, nextActionTitle: input.nextAction?.title ?? null, nextActionAt: input.nextAction?.dueAt ?? null, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function addManualMeeting(company: Company, user: { id: string; name: string }, input: Omit<CompanyMeeting, "id" | "companyId" | "companyName" | "createdBy" | "createdByName" | "createdAt" | "updatedAt">): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const ref = await addDoc(collection(db, "meetings"), { ...input, companyId: company.id, companyName: company.name, createdBy: user.id, createdByName: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await addCompanyLog(company.id, user, { type: "meeting", title: input.title, content: input.summary, occurredAt: input.startAt, source: "meeting" });
  return ref.id;
}

export async function addCompanyMemo(companyId: string, user: { id: string; name: string }, input: { title: string; content: string; pinned: boolean }): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await addDoc(collection(db, companiesCollection, companyId, "memos"), { ...input, createdBy: user.id, createdByName: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await addCompanyLog(companyId, user, { type: "memo", title: input.title, content: input.content, occurredAt: Timestamp.now(), source: "manual" });
}

export async function uploadCompanyFile(companyId: string, user: { id: string; name: string }, file: File, onProgress: (progress: number) => void): Promise<void> {
  const db = getFirebaseDb();
  const storage = getFirebaseStorageClient();
  if (!db || !storage) throw new Error("Firebaseが未設定です。");
  const path = `companies/${companyId}/files/${Date.now()}-${file.name}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)), reject, () => resolve()));
  const url = await getDownloadURL(ref(storage, path));
  const fileRef = await addDoc(collection(db, companiesCollection, companyId, "files"), { name: file.name, type: "other", url, storagePath: path, size: file.size, createdBy: user.id, createdByName: user.name, createdAt: serverTimestamp() });
  await addCompanyLog(companyId, user, { type: "file", title: "ファイルを追加しました", content: file.name, occurredAt: Timestamp.now(), source: "manual" });
  await updateDoc(doc(db, companiesCollection, companyId, "files", fileRef.id), { id: fileRef.id });
}

export async function deleteCompany(companyId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await deleteDoc(doc(db, companiesCollection, companyId));
}
