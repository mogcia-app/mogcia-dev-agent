import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { callCloudRunWorker, isCloudRunConfigured } from "@/lib/cloud-run/worker";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";
import { processTeleapoAudio } from "@/lib/server/teleapo/process-audio";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { recordId } = await params;
    const db = getAdminDb();
    const ref = db.collection("teleapoRecords").doc(recordId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const data = snapshot.data();
    if (data?.userId !== user.uid && user.uid !== "TjDadmBAdVYaPEvG3ppfBLS4HGN2") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!data?.audioFilePath && !data?.audioDownloadUrl) {
      return NextResponse.json({ error: "音声ファイルがまだアップロードされていません。もう一度ファイルを選択して保存してください。" }, { status: 400 });
    }

    await ref.update({
      transcriptionStatus: "extracting",
      updatedAt: FieldValue.serverTimestamp()
    });

    const processInput = {
      recordId,
      audioFilePath: data?.audioFilePath ?? null,
      audioDownloadUrl: data?.audioDownloadUrl ?? null,
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe"
    };

    if (isCloudRunConfigured()) {
      try {
        await callCloudRunWorker({
          path: "/teleapo/process",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(processInput)
          }
        });
        return NextResponse.json({ ok: true });
      } catch (error) {
        console.warn("Cloud Run teleapo process failed. Falling back to local processing.", error);
      }
    }

    await processTeleapoAudio(processInput);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "process_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
