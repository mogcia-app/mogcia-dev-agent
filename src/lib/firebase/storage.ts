import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { MeetingAsset, StorageAsset } from "@/domain/types";
import { getFirebaseStorageClient } from "./client";

export async function uploadStorageAsset({
  file,
  kind,
  projectId,
  uploadedBy
}: {
  file: File;
  kind: StorageAsset["kind"];
  projectId?: string;
  uploadedBy: string;
}): Promise<StorageAsset> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebase Storage is not configured.");

  const id = `storage-asset-${crypto.randomUUID()}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `mogcia-dev-agent/${projectId ?? "shared"}/${kind}/${id}-${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);

  return {
    id,
    projectId,
    name: file.name,
    path,
    url,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    kind,
    uploadedAt: new Date().toISOString(),
    uploadedBy
  };
}

export async function uploadMeetingAsset({
  file,
  clientId,
  projectId,
  meetingId,
  kind,
  uploadedBy
}: {
  file: File;
  clientId: string;
  projectId?: string;
  meetingId: string;
  kind: MeetingAsset["kind"];
  uploadedBy: string;
}): Promise<MeetingAsset> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebase Storage is not configured.");

  const id = `meeting-asset-${crypto.randomUUID()}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `mogcia-dev-agent/${projectId ?? clientId}/meetings/${meetingId}/${id}-${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });

  return {
    id,
    clientId,
    projectId,
    meetingId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    storagePath: path,
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    kind
  };
}
