"use client";

import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { businessApi, toJsonBody } from "@/lib/business-api-client";
import { getFirebaseStorageClient } from "@/lib/firebase/client";
import type { WorkspaceSpreadsheet } from "@/types/spreadsheet";

export async function getSpreadsheets(): Promise<WorkspaceSpreadsheet[]> {
  return (await businessApi<{ items: WorkspaceSpreadsheet[] }>("/api/business/spreadsheets")).items;
}

export async function uploadSpreadsheet(input: { file: File; month: string; name: string; user: { id: string; name: string }; onProgress: (progress: number) => void }): Promise<string> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebaseが未設定です。");
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
    const result = await businessApi<{ id: string }>("/api/business/spreadsheets", { method: "POST", body: toJsonBody({
      name: input.name.trim() || input.file.name.replace(/\.xlsx$/i, ""), month: input.month, originalFileName: input.file.name,
      url, storagePath: path, size: input.file.size, createdByName: input.user.name
    }) });
    return result.id;
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined);
    throw error;
  }
}

export async function deleteSpreadsheet(item: WorkspaceSpreadsheet): Promise<void> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebaseが未設定です。");
  await deleteObject(ref(storage, item.storagePath)).catch((error: { code?: string }) => { if (error.code !== "storage/object-not-found") throw error; });
  await businessApi<{ id: string; deleted: boolean }>("/api/business/spreadsheets", { method: "DELETE", body: toJsonBody({ id: item.id }) });
}
