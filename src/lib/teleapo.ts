"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
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
import { splitConversationLogsIntoBlocks, splitTextIntoConversationBlocks } from "@/lib/conversation-blocks";
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
    companyAddress: typeof data.companyAddress === "string" ? data.companyAddress : "",
    role: typeof data.role === "string" ? data.role : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    leadSource: typeof data.leadSource === "string" ? data.leadSource : "",
    memo: typeof data.memo === "string" ? data.memo : "",
    expectedIssue: typeof data.expectedIssue === "string" ? data.expectedIssue : "",
    reactionMemo: typeof data.reactionMemo === "string" ? data.reactionMemo : "",
    location: typeof data.location === "string" ? data.location : "",
    meetingTitle: typeof data.meetingTitle === "string" ? data.meetingTitle : "",
    meetingMemo: typeof data.meetingMemo === "string" ? data.meetingMemo : "",
    diagnosisSheet: data.diagnosisSheet && typeof data.diagnosisSheet === "object"
      ? {
          meetingPhase: typeof data.diagnosisSheet.meetingPhase === "string" ? data.diagnosisSheet.meetingPhase : "",
          temperature: typeof data.diagnosisSheet.temperature === "string" ? data.diagnosisSheet.temperature : "",
          biggestIssue: typeof data.diagnosisSheet.biggestIssue === "string" ? data.diagnosisSheet.biggestIssue : "",
          resonatedPoint: typeof data.diagnosisSheet.resonatedPoint === "string" ? data.diagnosisSheet.resonatedPoint : "",
          concerns: typeof data.diagnosisSheet.concerns === "string" ? data.diagnosisSheet.concerns : "",
          nextProposal: typeof data.diagnosisSheet.nextProposal === "string" ? data.diagnosisSheet.nextProposal : "",
          closeProbability: typeof data.diagnosisSheet.closeProbability === "string" ? data.diagnosisSheet.closeProbability : "",
          nextAction: typeof data.diagnosisSheet.nextAction === "string" ? data.diagnosisSheet.nextAction : "",
          finalResult: typeof data.diagnosisSheet.finalResult === "string" ? data.diagnosisSheet.finalResult : "none",
          lossReason: typeof data.diagnosisSheet.lossReason === "string" ? data.diagnosisSheet.lossReason : "",
          contractReason: typeof data.diagnosisSheet.contractReason === "string" ? data.diagnosisSheet.contractReason : "",
          noPotentialReason: typeof data.diagnosisSheet.noPotentialReason === "string" ? data.diagnosisSheet.noPotentialReason : "",
          effectiveProposal: typeof data.diagnosisSheet.effectiveProposal === "string" ? data.diagnosisSheet.effectiveProposal : "",
          ineffectiveProposal: typeof data.diagnosisSheet.ineffectiveProposal === "string" ? data.diagnosisSheet.ineffectiveProposal : "",
          trueCustomerIssue: typeof data.diagnosisSheet.trueCustomerIssue === "string" ? data.diagnosisSheet.trueCustomerIssue : "",
          salesFeeling: typeof data.diagnosisSheet.salesFeeling === "string" ? data.diagnosisSheet.salesFeeling : "",
          aiEvaluation: typeof data.diagnosisSheet.aiEvaluation === "string" ? data.diagnosisSheet.aiEvaluation : "",
          adoptedSalesRule: typeof data.diagnosisSheet.adoptedSalesRule === "string" ? data.diagnosisSheet.adoptedSalesRule : ""
        }
      : undefined,
    audioFilePath: data.audioFilePath ?? null,
    audioDownloadUrl: data.audioDownloadUrl ?? null,
    audioDurationSec: typeof data.audioDurationSec === "number" ? data.audioDurationSec : null,
    transcriptionStatus: data.transcriptionStatus ?? "draft",
    transcriptionModel: typeof data.transcriptionModel === "string" ? data.transcriptionModel : "gpt-4o-mini-transcribe",
    transcriptText: typeof data.transcriptText === "string" ? data.transcriptText : "",
    conversationLogs: Array.isArray(data.conversationLogs) ? splitConversationLogsIntoBlocks(data.conversationLogs) : [],
    conversationLogsLocked: Boolean(data.conversationLogsLocked),
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

export function subscribeTeleapoRecords(onNext: (records: TeleapoRecord[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, teleapoCollection), orderBy("updatedAt", "desc"), limit(100)),
    (snapshot) => onNext(snapshot.docs.map((entry) => normalizeTeleapoRecord(entry.id, entry.data()))),
    onError
  );
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

export async function deleteTeleapoRecord(recordId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await deleteDoc(doc(db, teleapoCollection, recordId));
}

export async function uploadTeleapoFile({ userId, recordId, file, onProgress }: { userId: string; recordId: string; file: File; onProgress: (progress: number) => void }): Promise<{ path: string; url: string }> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebase Storageが未設定です。");
  const path = `teleapoRecords/${userId}/${recordId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  const contentType = file.type || (file.name.toLowerCase().endsWith(".m4a") ? "audio/mp4" : "video/mp4");
  const task = uploadBytesResumable(storageRef, file, { contentType });
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
  const logs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(営業|顧客|同席者|不明|sales|customer|participant|unknown)\s*[:：]\s*(.+)$/i);
      const speaker = normalizeSpeaker(match?.[1]);
      const body = match?.[2] ?? line;
      return splitTextIntoConversationBlocks(body).map((block) => ({ speaker, text: block, startSec: null, endSec: null }));
    });

  return logs.map((log, index) => ({ id: `log-${index + 1}`, ...log }));
}

function normalizeSpeaker(value?: string): ConversationLog["speaker"] {
  if (value === "営業" || value?.toLowerCase() === "sales") return "sales";
  if (value === "顧客" || value?.toLowerCase() === "customer") return "customer";
  if (value === "同席者" || value?.toLowerCase() === "participant") return "participant";
  return "unknown";
}
