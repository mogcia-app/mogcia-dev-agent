import { NextResponse } from "next/server";
import { processTeleapoAudio, type ProcessTeleapoAudioInput } from "@/lib/server/teleapo/process-audio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expectedSecret = process.env.WORKER_SHARED_SECRET;
  if (expectedSecret && request.headers.get("x-worker-secret") !== expectedSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Partial<ProcessTeleapoAudioInput>;
    if (!body.recordId) return NextResponse.json({ error: "recordId is required." }, { status: 400 });
    if (!body.audioFilePath && !body.audioDownloadUrl) return NextResponse.json({ error: "audio source is required." }, { status: 400 });

    const result = await processTeleapoAudio({
      recordId: body.recordId,
      audioFilePath: body.audioFilePath ?? null,
      audioDownloadUrl: body.audioDownloadUrl ?? null,
      transcriptionModel: body.transcriptionModel
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "process_failed" }, { status: 500 });
  }
}
