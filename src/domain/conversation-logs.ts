import type { ConversationLog, ConversationSpeaker, TranscriptionSegment } from "./types";

const labelBySpeaker: Record<ConversationSpeaker, ConversationLog["label"]> = {
  sales: "営業",
  customer: "顧客",
  participant: "同席者",
  unknown: "不明"
};

const salesLabels = ["営業", "担当", "mogcia", "MOGCIA", "石田", "弊社"];
const customerLabels = ["顧客", "お客様", "お客さま", "クライアント", "相手", "先方"];
const participantLabels = ["同席者", "参加者"];
const unknownLabels = ["不明", "unknown"];

export function normalizeTranscriptText(input: string): string {
  return input
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t　]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function conversationLogsFromSegments(segments: TranscriptionSegment[]): ConversationLog[] {
  const speakerMap = new Map<string, ConversationSpeaker>();
  let unknownSpeakerCount = 0;

  return segments
    .map((segment, index) => {
      const speaker = normalizeSpeakerLabel(segment.speaker, speakerMap, () => {
        unknownSpeakerCount += 1;
        if (unknownSpeakerCount === 1) return "sales";
        if (unknownSpeakerCount === 2) return "customer";
        return "unknown";
      }) ?? "unknown";

      return createLog({
        id: `conversation-log-${index + 1}`,
        speaker,
        text: segment.text,
        startSec: segment.startSec,
        endSec: segment.endSec,
        sourceSegmentIndexes: [segment.index],
        confidence: segment.confidence ?? 0.86
      });
    })
    .filter((log): log is ConversationLog => Boolean(log));
}

export function conversationLogsFromManualPaste(input: string): ConversationLog[] {
  const text = normalizeTranscriptText(input);
  if (!text) return [];

  const speakerMap = new Map<string, ConversationSpeaker>();
  let currentSpeaker: ConversationSpeaker | null = null;
  let alternateIndex = 0;
  const logs: ConversationLog[] = [];

  splitTranscriptLines(text).forEach((line) => {
    const parsed = parseSpeakerLine(line, speakerMap);
    if (parsed && !parsed.text) {
      currentSpeaker = parsed.speaker;
      return;
    }

    if (parsed) {
      currentSpeaker = parsed.speaker;
      splitLongSentence(parsed.text).forEach((sentence) => {
        const log = createLog({
          id: `conversation-log-${logs.length + 1}`,
          speaker: parsed.speaker,
          text: sentence,
          sourceSegmentIndexes: [],
          confidence: parsed.confidence
        });
        if (log) logs.push(log);
      });
      return;
    }

    splitLongSentence(line).forEach((sentence) => {
      const speaker: ConversationSpeaker = alternateIndex % 2 === 0 ? "sales" : "customer";
      alternateIndex += 1;
      const log = createLog({
        id: `conversation-log-${logs.length + 1}`,
        speaker: currentSpeaker ?? speaker,
        text: sentence,
        sourceSegmentIndexes: [],
        confidence: currentSpeaker ? 0.72 : 0.58
      });
      if (log) logs.push(log);
    });
  });

  return logs;
}

export function conversationLogsToTranscript(logs: ConversationLog[]): string {
  return logs.map((log) => `${log.label}: ${log.text}`).join("\n");
}

export function buildAnalysisConversationText(logs: ConversationLog[]) {
  const normalized = logs.map((log) => ({
    ...log,
    speaker: normalizeSpeakerLabel(log.speaker) ?? log.speaker
  }));
  const salesOnlyText = normalized.filter((log) => log.speaker === "sales").map((log) => log.text).join("\n");
  const customerOnlyText = normalized.filter((log) => log.speaker === "customer").map((log) => log.text).join("\n");
  const responsePairsText = normalized
    .map((log, index) => {
      const next = normalized[index + 1];
      if (!next) return "";
      if (log.speaker === "customer" && next.speaker === "sales") return `顧客: ${log.text}\n営業: ${next.text}`;
      if (log.speaker === "sales" && next.speaker === "customer") return `営業: ${log.text}\n顧客: ${next.text}`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  return { salesOnlyText, customerOnlyText, responsePairsText };
}

function splitTranscriptLines(text: string): string[] {
  return text.split("\n").flatMap((line) => splitInlineSpeakerLabels(line));
}

function splitInlineSpeakerLabels(line: string): string[] {
  const pattern = /(営業|担当|顧客|お客様|お客さま|クライアント|相手|先方|同席者|参加者|Speaker\s*\d+|話者\s*\d+|不明|[一-龥ぁ-んァ-ヶ]{2,8})[:：]/g;
  const matches = [...line.matchAll(pattern)];
  if (matches.length <= 1) return [line];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? line.length;
    return line.slice(start, end).trim();
  });
}

function splitLongSentence(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^。！？!?]+[。！？!?]?/g) ?? [normalized];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseSpeakerLine(line: string, speakerMap: Map<string, ConversationSpeaker>): { speaker: ConversationSpeaker; text: string; confidence: number } | null {
  const match = line.match(/^([^:：]{1,20})[:：]\s*(.*)$/);
  if (!match) return null;
  const rawLabel = match[1].trim();
  const speaker = normalizeSpeakerLabel(rawLabel, speakerMap, () => assignPersonLikeSpeaker(speakerMap));
  return {
    speaker: speaker ?? "unknown",
    text: match[2].trim(),
    confidence: speaker ? 0.88 : 0.55
  };
}

function normalizeSpeakerLabel(
  rawLabel?: string,
  speakerMap?: Map<string, ConversationSpeaker>,
  assignUnknown?: () => ConversationSpeaker
): ConversationSpeaker | null {
  if (!rawLabel) return null;
  const label = rawLabel.trim();
  const lower = label.toLowerCase().replace(/\s+/g, "");

  if (lower === "sales" || salesLabels.some((item) => lower.includes(item.toLowerCase()))) return "sales";
  if (lower === "customer" || customerLabels.some((item) => lower.includes(item.toLowerCase()))) return "customer";
  if (lower === "participant" || participantLabels.some((item) => lower.includes(item.toLowerCase()))) return "participant";
  if (lower === "unknown" || unknownLabels.some((item) => lower.includes(item.toLowerCase()))) return "unknown";
  if (/^(speaker|話者)0*1$/i.test(lower)) return "sales";
  if (/^(speaker|話者)0*2$/i.test(lower)) return "customer";

  if (speakerMap) {
    const existing = speakerMap.get(label);
    if (existing) return existing;
    const assigned = assignUnknown?.() ?? assignPersonLikeSpeaker(speakerMap);
    speakerMap.set(label, assigned);
    return assigned;
  }

  return null;
}

function assignPersonLikeSpeaker(speakerMap: Map<string, ConversationSpeaker>): ConversationSpeaker {
  const assigned = Array.from(speakerMap.values());
  if (!assigned.includes("sales")) return "sales";
  if (!assigned.includes("customer")) return "customer";
  return "unknown";
}

function createLog({
  id,
  speaker,
  text,
  startSec,
  endSec,
  sourceSegmentIndexes,
  confidence
}: {
  id: string;
  speaker: ConversationSpeaker;
  text: string;
  startSec?: number;
  endSec?: number;
  sourceSegmentIndexes: number[];
  confidence: number;
}): ConversationLog | null {
  const normalized = text.trim();
  if (!normalized) return null;
  return {
    id,
    speaker,
    label: labelBySpeaker[speaker],
    text: normalized,
    startSec,
    endSec,
    sourceSegmentIndexes,
    confidence
  };
}
