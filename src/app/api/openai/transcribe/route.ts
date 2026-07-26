import { NextResponse } from "next/server";
import { conversationLogsFromSegments } from "@/domain/conversation-logs";
import type { TranscriptionSegment } from "@/domain/types";
import { requireApiPermission } from "@/lib/server/api-permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MAX_DIRECT_BYTES = 25 * 1024 * 1024;

interface OpenAiVerboseSegment {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
  avg_logprob?: number;
}

interface OpenAiVerboseTranscription {
  text?: string;
  language?: string;
  duration?: number;
  segments?: OpenAiVerboseSegment[];
}

export async function POST(request: Request) {
  const permission = await requireApiPermission(request, "meeting:write");
  if (!permission.ok) return permission.response;

  const body = await request.formData();
  const workerUrl = getTranscribeWorkerUrl(request);
  if (workerUrl) {
    return proxyToTranscribeWorker({ body, request, workerUrl });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const file = body.get("file");
  const rawSpeakerHint = body.get("speakerHint");
  const speakerHint = typeof rawSpeakerHint === "string" ? rawSpeakerHint : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  if (file.size > MAX_DIRECT_BYTES) {
    return NextResponse.json(
      {
        error: "25MBを超える音声は MOGCIA_TRANSCRIBE_WORKER_URL のCloud Run workerで処理してください。"
      },
      { status: 413 }
    );
  }

  try {
    const result = await transcribeDirectly(file, speakerHint);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getTranscribeWorkerUrl(request: Request): string | null {
  const rawUrl = process.env.MOGCIA_TRANSCRIBE_WORKER_URL || process.env.TRANSCRIBE_WORKER_URL;
  if (!rawUrl) return null;

  try {
    const workerUrl = new URL(rawUrl);
    const requestUrl = new URL(request.url);
    if (workerUrl.origin === requestUrl.origin && workerUrl.pathname === requestUrl.pathname) return null;
    return workerUrl.toString();
  } catch {
    return null;
  }
}

async function proxyToTranscribeWorker({
  body,
  request,
  workerUrl
}: {
  body: FormData;
  request: Request;
  workerUrl: string;
}) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      authorization: request.headers.get("authorization") ?? ""
    },
    body
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}

async function transcribeDirectly(file: File, speakerHint: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIPTION_MODEL);
  form.append("language", "ja");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append(
    "prompt",
    [
      "日本語の営業商談・テレアポ音声です。",
      "意味を追加せず、聞こえた内容だけを文字起こししてください。",
      "話者が推定できる場合は speaker_1 / speaker_2 / sales / customer のようなspeaker情報を保ってください。",
      speakerHint ? `話者ヒント: ${speakerHint}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  );

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Transcription failed.");
  }

  const payload = (await response.json()) as OpenAiVerboseTranscription;
  const segments = (payload.segments ?? [])
    .map((segment, index): TranscriptionSegment => ({
      index,
      text: segment.text?.trim() ?? "",
      startSec: roundSec(segment.start ?? 0),
      endSec: roundSec(segment.end ?? segment.start ?? 0),
      speaker: segment.speaker,
      confidence: confidenceFromAvgLogprob(segment.avg_logprob)
    }))
    .filter((segment) => segment.text);

  return {
    text: payload.text?.trim() ?? "",
    language: payload.language ?? "ja",
    durationSec: roundSec(payload.duration ?? segments.at(-1)?.endSec ?? 0),
    segments,
    conversationLogs: conversationLogsFromSegments(segments),
    chunkCount: 1,
    wasChunked: false
  };
}

function roundSec(value: number): number {
  return Math.round(value * 100) / 100;
}

function confidenceFromAvgLogprob(avgLogprob?: number): number {
  if (typeof avgLogprob !== "number") return 0.86;
  return Math.max(0.1, Math.min(0.99, Math.exp(avgLogprob)));
}
