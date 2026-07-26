import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { conversationLogsFromSegments } from "@/domain/conversation-logs";
import type { TranscriptionSegment } from "@/domain/types";

const execFileAsync = promisify(execFile);
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MAX_DIRECT_BYTES = 25 * 1024 * 1024;
const SEGMENT_SECONDS = 1200;

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

interface ChunkFile {
  path: string;
  name: string;
  durationSec: number;
}

export async function transcribeFileLocally({ file, speakerHint }: { file: File; speakerHint: string }) {
  const tempDir = await mkdtemp(join(tmpdir(), "mogcia-transcribe-"));

  try {
    const inputPath = join(tempDir, sanitizeFileName(file.name || "audio-input"));
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const chunks = file.size > MAX_DIRECT_BYTES ? await createCompressedChunks(inputPath, tempDir) : [{ path: inputPath, name: file.name || "audio-input", durationSec: await probeDuration(inputPath) }];
    const allSegments: TranscriptionSegment[] = [];
    const texts: string[] = [];
    let language = "ja";
    let elapsedSec = 0;

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const result = await transcribeChunk(chunk, speakerHint);
      if (result.language) language = result.language;
      if (result.text) texts.push(result.text.trim());

      const segments = (result.segments ?? []).map((segment, segmentIndex): TranscriptionSegment => {
        const startSec = roundSec((segment.start ?? 0) + elapsedSec);
        const endSec = roundSec((segment.end ?? segment.start ?? 0) + elapsedSec);
        return {
          index: allSegments.length + segmentIndex,
          text: segment.text?.trim() ?? "",
          startSec,
          endSec,
          speaker: segment.speaker,
          confidence: confidenceFromAvgLogprob(segment.avg_logprob)
        };
      });
      allSegments.push(...segments.filter((segment) => segment.text));
      elapsedSec += chunk.durationSec || result.duration || 0;
      if (chunkIndex === chunks.length - 1 && elapsedSec === 0) elapsedSec = result.duration ?? 0;
    }

    const durationSec = roundSec(elapsedSec || chunks.reduce((sum, chunk) => sum + chunk.durationSec, 0));
    return {
      text: texts.join("\n").trim(),
      language,
      durationSec,
      segments: allSegments,
      conversationLogs: conversationLogsFromSegments(allSegments),
      chunkCount: chunks.length,
      wasChunked: chunks.length > 1
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function transcribeChunk(chunk: ChunkFile, speakerHint: string): Promise<OpenAiVerboseTranscription> {
  const buffer = await readFile(chunk.path);
  const form = new FormData();
  form.append("file", new File([buffer], chunk.name, { type: chunk.name.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream" }));
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

  return (await response.json()) as OpenAiVerboseTranscription;
}

async function createCompressedChunks(inputPath: string, tempDir: string): Promise<ChunkFile[]> {
  const outputPattern = join(tempDir, "chunk-%03d.mp3");
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    "-f",
    "segment",
    "-segment_time",
    String(SEGMENT_SECONDS),
    "-reset_timestamps",
    "1",
    outputPattern
  ]);

  const names = (await readdir(tempDir)).filter((name) => name.startsWith("chunk-") && name.endsWith(".mp3")).sort();
  const chunks = await Promise.all(
    names.map(async (name) => {
      const path = join(tempDir, name);
      return {
        path,
        name,
        durationSec: await probeDuration(path)
      };
    })
  );

  if (chunks.length === 0) throw new Error("ffmpeg did not create audio chunks.");
  return chunks;
}

async function probeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]);
    return roundSec(Number(stdout.trim()) || 0);
  } catch {
    return 0;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-") || "audio-input";
}

function roundSec(value: number): number {
  return Math.round(value * 100) / 100;
}

function confidenceFromAvgLogprob(avgLogprob?: number): number {
  if (typeof avgLogprob !== "number") return 0.86;
  return Math.max(0.1, Math.min(0.99, Math.exp(avgLogprob)));
}
