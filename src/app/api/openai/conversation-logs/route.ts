import { NextResponse } from "next/server";
import type { ConversationLog, ConversationSpeaker } from "@/domain/types";
import { requireApiPermission } from "@/lib/server/api-permissions";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

export const maxDuration = 60;

interface RequestBody {
  transcriptText?: string;
}

interface ResponsesApiResult {
  output_text?: string;
}

function normalizeSpeaker(value: unknown): ConversationSpeaker {
  return value === "sales" || value === "customer" || value === "participant" || value === "unknown" ? value : "unknown";
}

function labelForSpeaker(speaker: ConversationSpeaker): ConversationLog["label"] {
  if (speaker === "sales") return "営業";
  if (speaker === "customer") return "顧客";
  if (speaker === "participant") return "同席者";
  return "不明";
}

function parseLogs(text: string): ConversationLog[] {
  const parsed = JSON.parse(text) as { logs?: Array<{ speaker?: unknown; text?: unknown; confidence?: unknown }> };
  return (parsed.logs ?? [])
    .map((item, index): ConversationLog | null => {
      const speaker = normalizeSpeaker(item.speaker);
      const body = typeof item.text === "string" ? item.text.trim() : "";
      if (!body) return null;
      return {
        id: `ai-conversation-log-${index + 1}`,
        speaker,
        label: labelForSpeaker(speaker),
        text: body,
        sourceSegmentIndexes: [] as number[],
        confidence: typeof item.confidence === "number" ? Math.max(0.1, Math.min(0.99, item.confidence)) : 0.82
      };
    })
    .filter((item): item is ConversationLog => Boolean(item));
}

export async function POST(request: Request) {
  const permission = await requireApiPermission(request, "ai:run");
  if (!permission.ok) return permission.response;

  const body = (await request.json()) as RequestBody;
  const transcriptText = body.transcriptText?.trim() ?? "";

  if (!transcriptText) {
    return NextResponse.json({ error: "transcriptText is required." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CONVERSATION_LOG_MODEL || DEFAULT_MODEL,
        store: false,
        max_output_tokens: 1800,
        text: {
          format: {
            type: "json_object"
          }
        },
        input: [
          {
            role: "system",
            content: [
              "あなたは営業商談・テレアポの文字起こしを会話ログに分割するAgentです。",
              "出力はJSONの logs 配列のみ。各要素は speaker, text, confidence。",
              "speakerは sales/customer/participant/unknown のみ。",
              "質問と回答、反論と返答、料金/時期/決裁/次回アクションは細かめに分ける。",
              "意味の追加や勝手な補完は禁止。",
              "誤認識の修正は文脈上明確な場合だけ。"
            ].join("\n")
          },
          {
            role: "user",
            content: transcriptText
          }
        ]
      })
    });

    if (!response.ok) {
      return NextResponse.json({ error: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as ResponsesApiResult;
    const logs = parseLogs(data.output_text ?? "{}");
    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversation log split failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
