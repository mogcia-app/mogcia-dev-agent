import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { splitTextIntoConversationBlocks } from "@/lib/conversation-blocks";
import { getAdminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import type { ConversationLog, TeleapoSpeaker } from "@/types/teleapo";

const execFileAsync = promisify(execFile);

type ProcessRequest = {
  recordId?: string;
  audioFilePath?: string | null;
  audioDownloadUrl?: string | null;
  transcriptionModel?: string;
};

type OpenAiTranscriptionResponse = {
  text?: string;
  segments?: Array<{
    id?: string | number;
    speaker?: string;
    text?: string;
    start?: number;
    end?: number;
  }>;
};

export async function POST(request: Request) {
  const expectedSecret = process.env.WORKER_SHARED_SECRET;
  if (expectedSecret && request.headers.get("x-worker-secret") !== expectedSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as ProcessRequest;
  if (!body.recordId) return NextResponse.json({ error: "recordId is required." }, { status: 400 });
  if (!body.audioFilePath && !body.audioDownloadUrl) return NextResponse.json({ error: "audio source is required." }, { status: 400 });

  const db = getAdminDb();
  const recordRef = db.collection("teleapoRecords").doc(body.recordId);
  const workDir = await mkdtemp(join(tmpdir(), "mogcia-teleapo-"));
  const inputPath = join(workDir, `input${detectSourceExtension(body)}`);
  const audioPath = join(workDir, "audio.mp3");
  const transcriptionModel = body.transcriptionModel || process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

  try {
    await recordRef.update({
      transcriptionStatus: "extracting",
      transcriptionModel,
      transcriptionError: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    const source = await downloadSource(body);
    await writeFile(inputPath, source);
    await execFileAsync("ffmpeg", ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audioPath], { timeout: 180_000 });

    await recordRef.update({
      transcriptionStatus: "transcribing",
      updatedAt: FieldValue.serverTimestamp()
    });

    const audio = await readFile(audioPath);
    const transcription = await transcribeAudio(audio, transcriptionModel);
    const transcriptText = transcription.text?.trim() || "";

    await recordRef.update({
      transcriptionStatus: "diarizing",
      updatedAt: FieldValue.serverTimestamp()
    });

    const conversationLogs = transcription.segments?.length ? segmentsToLogs(transcription.segments) : textToLogs(transcriptText);

    await recordRef.update({
      transcriptionStatus: "completed",
      transcriptionModel,
      transcriptText,
      conversationLogs,
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ ok: true, transcriptText, conversationLogs });
  } catch (error) {
    await recordRef.set(
      {
        transcriptionStatus: "failed",
        transcriptionError: error instanceof Error ? error.message : "process_failed",
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return NextResponse.json({ error: error instanceof Error ? error.message : "process_failed" }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function downloadSource(body: ProcessRequest): Promise<Buffer> {
  if (body.audioFilePath) {
    const [file] = await getAdminStorageBucket().file(body.audioFilePath).download();
    return file;
  }

  const response = await fetch(String(body.audioDownloadUrl));
  if (!response.ok) throw new Error(`download_failed:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function detectSourceExtension(body: ProcessRequest): ".mp4" | ".m4a" {
  const source = body.audioFilePath || body.audioDownloadUrl || "";
  return source.toLowerCase().split("?")[0]?.endsWith(".m4a") ? ".m4a" : ".mp4";
}

async function transcribeAudio(audio: Buffer, model: string): Promise<OpenAiTranscriptionResponse> {
  const form = new FormData();
  form.set("model", model);
  form.set("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`openai_transcription_failed:${response.status}:${detail.slice(0, 300)}`);
  }

  return response.json() as Promise<OpenAiTranscriptionResponse>;
}

function segmentsToLogs(segments: NonNullable<OpenAiTranscriptionResponse["segments"]>): ConversationLog[] {
  return segments
    .flatMap((segment, segmentIndex) =>
      splitTextIntoConversationBlocks(String(segment.text ?? "")).map((block, blockIndex) => ({
        id: `log-${segment.id ?? segmentIndex + 1}-${blockIndex + 1}`,
        speaker: normalizeSpeaker(segment.speaker),
        text: block,
        startSec: typeof segment.start === "number" ? segment.start : null,
        endSec: typeof segment.end === "number" ? segment.end : null
      }))
    );
}

function textToLogs(text: string): ConversationLog[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const logs = lines.flatMap((line) => {
    const match = line.match(/^(営業|顧客|同席者|不明|sales|customer|participant|unknown)\s*[:：]\s*(.+)$/i);
    return splitTextIntoConversationBlocks(match?.[2]?.trim() || line).map((block) => ({
      speaker: normalizeSpeaker(match?.[1]),
      text: block,
      startSec: null,
      endSec: null
    }));
  });

  return logs.map((log, index) => ({ id: `log-${index + 1}`, ...log }));
}

function normalizeSpeaker(value?: string): TeleapoSpeaker {
  const normalized = value?.toLowerCase();
  if (value === "営業" || normalized === "sales" || normalized === "speaker_0") return "sales";
  if (value === "顧客" || normalized === "customer" || normalized === "speaker_1") return "customer";
  if (value === "同席者" || normalized === "participant") return "participant";
  return "unknown";
}
