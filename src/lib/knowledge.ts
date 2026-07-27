"use client";

import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { createKnowledgePayload, draftToKnowledgePayload } from "@/lib/knowledge-utils";
import type { Knowledge, KnowledgeDraft } from "@/types/knowledge";

const collectionName = "knowledge";

function normalizeKnowledge(id: string, data: DocumentData): Knowledge {
  const now = Timestamp.now();
  return {
    id,
    title: String(data.title ?? ""),
    summary: data.summary ?? "",
    content: data.content ?? "",
    type: data.type ?? "other",
    customerQuote: data.customerQuote ?? "",
    possibleBackground: data.possibleBackground ?? [],
    learnings: data.learnings ?? [],
    effectiveResponses: data.effectiveResponses ?? [],
    avoidResponses: data.avoidResponses ?? [],
    nextActions: data.nextActions ?? [],
    objectionData: data.objectionData ?? {},
    successCaseData: data.successCaseData ?? {},
    lossData: data.lossData ?? {},
    productIds: data.productIds ?? [],
    productNames: data.productNames ?? [],
    companyId: data.companyId ?? null,
    companyName: data.companyName ?? null,
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
    meetingId: data.meetingId ?? null,
    meetingTitle: data.meetingTitle ?? null,
    dealId: data.dealId ?? null,
    dealName: data.dealName ?? null,
    tags: data.tags ?? [],
    source: data.source ?? "manual",
    sourceId: data.sourceId ?? null,
    sourceType: data.sourceType ?? null,
    aiGenerated: Boolean(data.aiGenerated),
    aiReason: data.aiReason ?? null,
    visibility: data.visibility ?? "team",
    viewCount: typeof data.viewCount === "number" ? data.viewCount : 0,
    favoriteUserIds: data.favoriteUserIds ?? [],
    searchKeywords: data.searchKeywords ?? [],
    createdBy: String(data.createdBy ?? ""),
    createdByName: data.createdByName ?? "",
    updatedBy: data.updatedBy ?? "",
    updatedByName: data.updatedByName ?? "",
    status: data.status ?? "active",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now,
    archivedAt: data.archivedAt instanceof Timestamp ? data.archivedAt : null
  };
}

export function subscribeKnowledge(onNext: (items: Knowledge[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, collectionName), orderBy("createdAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeKnowledge(entry.id, entry.data()))), onError);
}

export async function createKnowledge(draft: KnowledgeDraft, user: { id: string; name: string }): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const ref = await addDoc(collection(db, collectionName), createKnowledgePayload(draft, user));
  return ref.id;
}

export async function updateKnowledge(id: string, draft: KnowledgeDraft, user: { id: string; name: string }): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, collectionName, id), { ...draftToKnowledgePayload(draft, user), updatedAt: serverTimestamp() });
}

export async function duplicateKnowledge(item: Knowledge, user: { id: string; name: string }): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const { id: _id, ...copy } = item;
  const ref = await addDoc(collection(db, collectionName), {
    ...copy,
    title: `${item.title} コピー`,
    createdBy: user.id,
    createdByName: user.name,
    updatedBy: user.id,
    updatedByName: user.name,
    viewCount: 0,
    favoriteUserIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    archivedAt: null
  });
  return ref.id;
}

export async function archiveKnowledge(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, collectionName, id), { status: "archived", archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function deleteKnowledge(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await deleteDoc(doc(db, collectionName, id));
}

export async function toggleKnowledgeFavorite(item: Knowledge, userId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const nextFavorite = !item.favoriteUserIds.includes(userId);
  await setDoc(doc(db, "users", userId, "favoriteKnowledge", item.id), { knowledgeId: item.id, createdAt: serverTimestamp(), active: nextFavorite }, { merge: true });
  await updateDoc(doc(db, collectionName, item.id), {
    favoriteUserIds: nextFavorite ? [...item.favoriteUserIds, userId] : item.favoriteUserIds.filter((id) => id !== userId),
    updatedAt: serverTimestamp()
  });
}

export async function incrementKnowledgeView(id: string, userId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const key = `${id}_${userId}_${new Date().toISOString().slice(0, 10)}`;
  const viewRef = doc(db, "knowledgeViews", key);
  const snapshot = await getDoc(viewRef);
  if (snapshot.exists()) return;
  await setDoc(viewRef, { knowledgeId: id, userId, viewedAt: serverTimestamp() });
  await updateDoc(doc(db, collectionName, id), { viewCount: increment(1) });
}
