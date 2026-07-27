"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable, type UploadTaskSnapshot } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorageClient } from "@/lib/firebase/client";
import type { ConversationLog, ProductKnowledge, TeleapoRecord } from "@/types/teleapo";

export const teleapoCollection = "teleapoRecords";
export const maxTeleapoDurationSec = 15 * 60;

export function normalizeTeleapoRecord(id: string, data: DocumentData): TeleapoRecord {
  const now = Timestamp.now();
  return {
    id,
    companyId: data.companyId ?? null,
    userId: String(data.userId ?? ""),
    userName: typeof data.userName === "string" ? data.userName : "",
    salesDomain: data.salesDomain === "meeting" ? "meeting" : "teleapo",
    sourceTeleapoId: data.sourceTeleapoId ?? null,
    customerName: String(data.customerName ?? ""),
    contactName: String(data.contactName ?? ""),
    productId: data.productId ?? null,
    productName: String(data.productName ?? ""),
    customerType: "new",
    callPurpose: data.callPurpose,
    callResult: data.callResult,
    nextContactType: data.nextContactType,
    recordedAt: data.recordedAt instanceof Timestamp ? data.recordedAt : now,
    calendarEventId: data.calendarEventId ?? null,
    attendeeUserIds: Array.isArray(data.attendeeUserIds) ? data.attendeeUserIds : [],
    attendeeNames: Array.isArray(data.attendeeNames) ? data.attendeeNames : [],
    industry: typeof data.industry === "string" ? data.industry : "",
    role: typeof data.role === "string" ? data.role : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    leadSource: typeof data.leadSource === "string" ? data.leadSource : "",
    memo: typeof data.memo === "string" ? data.memo : "",
    expectedIssue: typeof data.expectedIssue === "string" ? data.expectedIssue : "",
    reactionMemo: typeof data.reactionMemo === "string" ? data.reactionMemo : "",
    location: typeof data.location === "string" ? data.location : "",
    meetingTitle: typeof data.meetingTitle === "string" ? data.meetingTitle : "",
    meetingMemo: typeof data.meetingMemo === "string" ? data.meetingMemo : "",
    audioFilePath: data.audioFilePath ?? null,
    audioDownloadUrl: data.audioDownloadUrl ?? null,
    audioDurationSec: typeof data.audioDurationSec === "number" ? data.audioDurationSec : null,
    transcriptionStatus: data.transcriptionStatus ?? "draft",
    transcriptionModel: typeof data.transcriptionModel === "string" ? data.transcriptionModel : "gpt-4o-mini-transcribe",
    transcriptText: typeof data.transcriptText === "string" ? data.transcriptText : "",
    conversationLogs: Array.isArray(data.conversationLogs) ? data.conversationLogs : [],
    aiAdviceStatus: data.aiAdviceStatus ?? "idle",
    aiAdviceModel: data.aiAdviceModel ?? null,
    aiAdvice: data.aiAdvice ?? null,
    aiAdviceError: data.aiAdviceError ?? null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now
  };
}

export function subscribeTeleapoRecord(recordId: string, onNext: (record: TeleapoRecord | null) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(doc(db, teleapoCollection, recordId), (snapshot) => onNext(snapshot.exists() ? normalizeTeleapoRecord(snapshot.id, snapshot.data()) : null), onError);
}

export function subscribeProducts(onNext: (products: ProductKnowledge[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "products"), orderBy("name", "asc")),
    (snapshot) =>
      onNext(
        snapshot.docs.map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            name: String(data.name ?? ""),
            overview: data.overview,
            targetCustomer: data.targetCustomer,
            issues: data.issues,
            valueProposition: data.valueProposition,
            pricing: data.pricing,
            objections: data.objections,
            faq: data.faq,
            successTalk: data.successTalk,
            ngTalk: data.ngTalk,
            proposalMaterials: data.proposalMaterials,
            caseMaterials: data.caseMaterials
          };
        }).filter((product) => product.name)
      ),
    onError
  );
}

export async function createTeleapoRecord(payload: Record<string, unknown>): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const entry = await addDoc(collection(db, teleapoCollection), {
    ...payload,
    customerType: "new",
    aiAdviceStatus: "idle",
    conversationLogs: payload.conversationLogs ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return entry.id;
}

export async function updateTeleapoRecord(recordId: string, payload: Record<string, unknown>): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, teleapoCollection, recordId), { ...payload, updatedAt: serverTimestamp() });
}

export async function uploadTeleapoFile({ userId, recordId, file, onProgress }: { userId: string; recordId: string; file: File; onProgress: (progress: number) => void }): Promise<{ path: string; url: string }> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebase Storageが未設定です。");
  const path = `teleapoRecords/${userId}/${recordId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type || "video/mp4" });
  await new Promise<UploadTaskSnapshot>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      () => resolve(task.snapshot)
    );
  });
  return { path, url: await getDownloadURL(storageRef) };
}

export function parseTranscriptToLogs(text: string): ConversationLog[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(営業|顧客|同席者|不明|sales|customer|participant|unknown)\s*[:：]\s*(.+)$/i);
      const speaker = normalizeSpeaker(match?.[1]);
      return { id: `log-${index + 1}`, speaker, text: match?.[2] ?? line, startSec: null, endSec: null };
    });
}

function normalizeSpeaker(value?: string): ConversationLog["speaker"] {
  if (value === "営業" || value?.toLowerCase() === "sales") return "sales";
  if (value === "顧客" || value?.toLowerCase() === "customer") return "customer";
  if (value === "同席者" || value?.toLowerCase() === "participant") return "participant";
  return "unknown";
}
