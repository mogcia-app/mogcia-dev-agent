import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { callCloudRunWorker } from "@/lib/cloud-run/worker";
import { getAdminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const allowedTypes: Record<string, string> = {
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "audio/x-m4a": "m4a"
};

export async function POST(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request, "useAiParser");
    const body = (await request.json()) as Record<string, unknown>;
    const fileName = safeFileName(body.fileName);
    const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
    const size = typeof body.size === "number" ? body.size : 0;
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!fileName || !(extension === "m4a" || extension === "mp4") || !allowedTypes[contentType]) {
      return failure(".m4a または .mp4 ファイルを選択してください。", 400);
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
      return failure("音声ファイルは150MB以下にしてください。", 400);
    }

    const db = getAdminDb();
    const ref = db.collection("teleapoRecords").doc();
    const storagePath = `teleapoRecords/${user.uid}/${ref.id}/${Date.now()}-${fileName}`;
    const file = getAdminStorageBucket().file(storagePath);
    const [uploadURL] = await file.getSignedUrl({
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
      version: "v4"
    });

    await ref.set({
      userId: user.uid,
      userName: user.name ?? user.email ?? "",
      salesDomain: "teleapo",
      sourceTeleapoId: null,
      leadId: null,
      companyId: null,
      customerName: fileName.replace(/\.(m4a|mp4)$/i, ""),
      contactName: "",
      productId: null,
      productName: "",
      customerType: "new",
      callPurpose: "first_appointment",
      callResult: "appointment",
      nextContactType: "none",
      recordedAt: FieldValue.serverTimestamp(),
      audioFilePath: storagePath,
      audioDownloadUrl: null,
      audioDurationSec: null,
      transcriptionStatus: "uploaded",
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      transcriptText: "",
      conversationLogs: [],
      aiAdviceStatus: "idle",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, data: { recordId: ref.id, uploadURL, storagePath } }, { status: 201 });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "アップロードを開始できませんでした。", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request, "useAiParser");
    const body = (await request.json()) as Record<string, unknown>;
    const recordId = typeof body.recordId === "string" ? body.recordId : "";
    const durationSec = typeof body.durationSec === "number" ? body.durationSec : null;
    if (!recordId) return failure("recordIdが必要です。", 400);
    if (durationSec !== null && (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 15 * 60)) {
      return failure("15分以内の音声だけアップロードできます。", 400);
    }

    const ref = getAdminDb().collection("teleapoRecords").doc(recordId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return failure("アップロード情報が見つかりません。", 404);
    const data = snapshot.data();
    if (data?.userId !== user.uid) return failure("この音声にはアクセスできません。", 403);
    const storagePath = typeof data?.audioFilePath === "string" ? data.audioFilePath : "";
    if (!storagePath) return failure("保存先が見つかりません。", 400);
    const [exists] = await getAdminStorageBucket().file(storagePath).exists();
    if (!exists) return failure("音声のアップロードが完了していません。", 409);

    await ref.update({
      audioDurationSec: durationSec,
      transcriptionStatus: "extracting",
      updatedAt: FieldValue.serverTimestamp()
    });
    await callCloudRunWorker({
      path: "/teleapo/process",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          audioFilePath: storagePath,
          audioDownloadUrl: null,
          transcriptionModel: data?.transcriptionModel || "gpt-4o-mini-transcribe"
        })
      }
    });

    return NextResponse.json({
      success: true,
      data: { recordId, targetURL: `/sales/upload?recordId=${encodeURIComponent(recordId)}`, message: "アップロードが完了し、解析を開始しました。" }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "解析を開始できませんでした。", 400);
  }
}

function safeFileName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, error: { message } }, { status });
}
