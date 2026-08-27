import "server-only";

import type { AgentResultCard } from "@/types/agent";

export interface AgentAnswerToolResult {
  toolName: string;
  summary: string;
  data: unknown;
}

export async function generateAgentAnswer(input: {
  userRequest: string;
  draftAnswer: string;
  cards: AgentResultCard[];
  toolResults: AgentAnswerToolResult[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || input.toolResults.length === 0) return input.draftAnswer;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_AGENT_ANSWER_MODEL || process.env.OPENAI_AGENT_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              "あなたはMOGCIA管理画面の業務Agentです。",
              "回答は必ずtoolResultsとcardsに含まれる事実だけから作成してください。",
              "未確認情報を推測しないでください。データが足りない場合は不足として明示してください。",
              "社内向けに、短く、次に見るべきポイントが分かる日本語で回答してください。",
              "データ変更の実行可否や承認状態はdraftAnswerに従ってください。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              userRequest: input.userRequest,
              draftAnswer: input.draftAnswer,
              cards: input.cards.map((card) => ({
                type: card.type,
                title: card.title,
                subtitle: card.subtitle ?? "",
                body: card.body ?? "",
                meta: card.meta ?? []
              })),
              toolResults: input.toolResults
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "agent_answer",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["answer"],
              properties: {
                answer: { type: "string" }
              }
            }
          }
        }
      })
    });
    if (!response.ok) return input.draftAnswer;
    const json = await response.json() as Record<string, unknown>;
    const parsed = JSON.parse(outputText(json)) as { answer?: unknown };
    return typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : input.draftAnswer;
  } catch {
    return input.draftAnswer;
  }
}

function outputText(json: Record<string, unknown>): string {
  if (typeof json.output_text === "string") return json.output_text;
  const output = Array.isArray(json.output) ? json.output : [];
  return output.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const content = Array.isArray((entry as Record<string, unknown>).content) ? (entry as Record<string, unknown>).content as unknown[] : [];
    return content.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("");
}

