import "server-only";

import type { AgentIntent } from "@/types/agent";

export interface RoutedIntent {
  intent: AgentIntent;
  confidence: number;
  entities: Record<string, string>;
}

const agentIntents: AgentIntent[] = [
  "search_leads",
  "search_companies",
  "get_company_summary",
  "get_lead_summary",
  "get_today_tasks",
  "get_upcoming_tasks",
  "get_calendar",
  "create_task",
  "update_task",
  "get_analysis",
  "get_meeting_history",
  "create_activity",
  "search_products",
  "development_request",
  "general"
];

export async function routeAgentIntent(rawMessage: string): Promise<RoutedIntent> {
  const trimmed = rawMessage.trim();
  if (!trimmed) return { intent: "general", confidence: 0, entities: {} };
  const viaLlm = await routeWithOpenAI(trimmed);
  if (viaLlm) return viaLlm;
  return routeWithHeuristics(trimmed);
}

async function routeWithOpenAI(rawMessage: string): Promise<RoutedIntent | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_AGENT_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              "あなたはMOGCIA管理画面のAgent Intent Routerです。",
              "ユーザー文からintentと名前・日付・商材名などのentityだけを抽出してください。",
              "Firestore IDや存在確認済みでないIDは絶対に推測しないでください。",
              "データ変更が必要な依頼はcreate_task/update_task/create_activityに分類してください。",
              "開発・コード修正・管理画面改修依頼はdevelopment_requestに分類してください。"
            ].join("\n")
          },
          { role: "user", content: rawMessage }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "agent_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["intent", "confidence", "entities"],
              properties: {
                intent: { type: "string", enum: agentIntents },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                entities: {
                  type: "object",
                  additionalProperties: { type: "string" }
                }
              }
            }
          }
        }
      })
    });
    if (!response.ok) return null;
    const json = await response.json() as Record<string, unknown>;
    const text = outputText(json);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const intent = agentIntents.includes(parsed.intent as AgentIntent) ? parsed.intent as AgentIntent : "general";
    return {
      intent,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      entities: cleanEntities(parsed.entities)
    };
  } catch {
    return null;
  }
}

function routeWithHeuristics(rawMessage: string): RoutedIntent {
  const message = rawMessage.replace(/\s+/g, "");
  const entities = extractEntities(rawMessage);
  if (/(直して|改修|実装|コード|Codex|リポジトリ|GitHub|月次レポート|管理画面を整理)/i.test(rawMessage)) return { intent: "development_request", confidence: 0.76, entities };
  if (/(活動ログ|履歴追加|ログ追加)/.test(rawMessage)) return { intent: "create_activity", confidence: 0.72, entities };
  if (/(タスク).*(作って|作成|追加|登録)|フォローするタスク/.test(message)) return { intent: "create_task", confidence: 0.72, entities };
  if (/(タスク).*(完了|変更|更新|延期|直して)/.test(message)) return { intent: "update_task", confidence: 0.68, entities };
  if (/(今日).*(タスク|やること|TODO|Todo)/i.test(rawMessage)) return { intent: "get_today_tasks", confidence: 0.82, entities };
  if (/(明日|予定|カレンダー|スケジュール)/.test(rawMessage)) return { intent: "get_calendar", confidence: 0.76, entities };
  if (/(今週|近日|対応した方がいい|対応すべき|フォローした方がいい)/.test(rawMessage)) return { intent: "get_upcoming_tasks", confidence: 0.74, entities };
  if (/(商談|テレアポ|音声|文字起こし|分析|振り返り|見込み推移)/.test(rawMessage)) return { intent: "get_meeting_history", confidence: 0.7, entities };
  if (/(商材|プロダクト|商品)/.test(rawMessage) && /(見込み客|リード|アポ)/.test(rawMessage)) return { intent: "search_leads", confidence: 0.72, entities };
  if (/(商材|プロダクト|商品)/.test(rawMessage)) return { intent: "search_products", confidence: 0.68, entities };
  if (/(会社|企業)/.test(rawMessage)) return { intent: "search_companies", confidence: 0.64, entities };
  if (/(どうなってる|状況|要約|サマリ|まとめ)/.test(rawMessage)) return { intent: "get_lead_summary", confidence: 0.68, entities };
  return { intent: "general", confidence: 0.45, entities };
}

function extractEntities(rawMessage: string): Record<string, string> {
  const entities: Record<string, string> = {};
  const productMatch = rawMessage.match(/([A-Za-z0-9_.-]{3,}|commo\.?|Signal\.?|selmo\.?|upmo|voimo\.?)/i);
  if (productMatch?.[1]) entities.productName = productMatch[1].replace(/。$/, "");
  const dateMatch = rawMessage.match(/(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日|今日|明日|明後日|今週|来週)/);
  if (dateMatch?.[1]) entities.date = dateMatch[1];
  const normalized = rawMessage
    .replace(/(今日|明日|明後日|今週|来週|までに|に|を|へ|の|って|どうなってる|状況|教えて|タスク|作って|作成|追加|登録|活動ログ|見込み客|会社|商材|アポ取れてるところ|フォローする)/g, " ")
    .replace(/\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日/g, " ")
    .trim();
  const candidate = normalized.split(/\s+/).find((item) => item.length >= 2 && !item.includes("."));
  if (candidate) {
    entities.leadName = candidate;
    entities.companyName = candidate;
  }
  return entities;
}

function cleanEntities(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item === "string" && item.trim()).map(([key, item]) => [key, String(item).trim()]));
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

