"use client";

import { Timestamp, addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorageClient } from "@/lib/firebase/client";
import type { WorkspaceSpreadsheet } from "@/types/spreadsheet";

const collectionName = "spreadsheets";

function normalizeSpreadsheet(id: string, data: DocumentData): WorkspaceSpreadsheet {
  const now = Timestamp.now();
  return {
    id,
    name: String(data.name ?? data.originalFileName ?? "無題の表"),
    month: String(data.month ?? ""),
    originalFileName: String(data.originalFileName ?? ""),
    url: String(data.url ?? ""),
    storagePath: String(data.storagePath ?? ""),
    size: typeof data.size === "number" ? data.size : 0,
    createdBy: String(data.createdBy ?? ""),
    createdByName: String(data.createdByName ?? ""),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now
  };
}

export function subscribeSpreadsheets(onNext: (items: WorkspaceSpreadsheet[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, collectionName), orderBy("month", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeSpreadsheet(entry.id, entry.data()))), onError);
}

export async function uploadSpreadsheet(input: { file: File; month: string; name: string; user: { id: string; name: string }; onProgress: (progress: number) => void }): Promise<string> {
  const db = getFirebaseDb();
  const storage = getFirebaseStorageClient();
  if (!db || !storage) throw new Error("Firebaseが未設定です。");
  const extension = input.file.name.split(".").pop()?.toLowerCase();
  if (extension !== "xlsx") throw new Error(".xlsx ファイルを選んでください。");
  if (input.file.size > 25 * 1024 * 1024) throw new Error("ファイルサイズは25MB以下にしてください。");
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `spreadsheets/${input.user.id}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, input.file, { contentType: input.file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => input.onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve));
  const url = await getDownloadURL(storageRef);
  try {
    const record = await addDoc(collection(db, collectionName), {
      name: input.name.trim() || input.file.name.replace(/\.xlsx$/i, ""),
      month: input.month,
      originalFileName: input.file.name,
      url,
      storagePath: path,
      size: input.file.size,
      createdBy: input.user.id,
      createdByName: input.user.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return record.id;
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined);
    throw error;
  }
}

export async function deleteSpreadsheet(item: WorkspaceSpreadsheet): Promise<void> {
  const db = getFirebaseDb();
  const storage = getFirebaseStorageClient();
  if (!db || !storage) throw new Error("Firebaseが未設定です。");
  await deleteObject(ref(storage, item.storagePath)).catch((error: { code?: string }) => {
    if (error.code !== "storage/object-not-found") throw error;
  });
  await deleteDoc(doc(db, collectionName, item.id));
}
