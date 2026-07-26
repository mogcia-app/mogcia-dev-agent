import { NextResponse } from "next/server";
import type { OpenAiReview } from "@/domain/types";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";

export const maxDuration = 60;

interface ReviewRequest {
  title?: string;
  input?: string;
  projectId?: string;
  createdBy?: string;
}

interface ResponsesApiResult {
  output_text?: string;
}

function localReview({ title, input, projectId, createdBy }: Required<ReviewRequest>): OpenAiReview {
  return {
    id: `openai-review-${crypto.randomUUID()}`,
    projectId,
    title,
    input,
    summary: "ローカルfallbackで、導線・CTA・情報整理を中心に改善案を作成しました。",
    findings: ["主要CTAの優先度を明確にする必要があります。", "スマホ表示で、予約・LINE・問い合わせ導線を近接配置すると確認しやすくなります。"],
    improvements: ["ファーストビューに主CTAを1つ固定する", "SNS流入後の遷移先をキャンペーンまたは予約導線へ絞る", "本番化前に計測イベントと改善Demoを分けて管理する"],
    createdAt: new Date().toISOString(),
    createdBy,
    generatedBy: "local-fallback"
  };
}

function parseReview(text: string, fallback: OpenAiReview): OpenAiReview {
  try {
    const parsed = JSON.parse(text) as Partial<OpenAiReview>;
    return {
      ...fallback,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      findings: Array.isArray(parsed.findings) ? parsed.findings.filter((item): item is string => typeof item === "string") : fallback.findings,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.filter((item): item is string => typeof item === "string") : fallback.improvements,
      generatedBy: "openai"
    };
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as ReviewRequest;
  const normalized = {
    title: body.title?.trim() || "MOGCIA Review",
    input: body.input?.trim() || "",
    projectId: body.projectId || "shared",
    createdBy: body.createdBy || "local-user"
  };
  const fallback = localReview(normalized);

  if (!process.env.OPENAI_API_KEY || !normalized.input) {
    return NextResponse.json({ review: fallback });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false,
        max_output_tokens: 700,
        text: {
          format: {
            type: "json_object"
          }
        },
        input: [
          {
            role: "system",
            content: "あなたはMOGCIA Dev AgentのReview Agentです。出力はJSONのみ。summary, findings, improvementsを返してください。"
          },
          {
            role: "user",
            content: normalized.input
          }
        ]
      })
    });

    if (!response.ok) return NextResponse.json({ review: fallback });
    const data = (await response.json()) as ResponsesApiResult;
    const review = parseReview(data.output_text ?? "", fallback);
    return NextResponse.json({ review });
  } catch {
    return NextResponse.json({ review: fallback });
  }
}
