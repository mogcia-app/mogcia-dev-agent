import { NextResponse } from "next/server";
import { buildAnalysisConversationText, conversationLogsToTranscript } from "@/domain/conversation-logs";
import type { Client, ConversationLog, MeetingAnalysis, MeetingRecord, Project } from "@/domain/types";
import { requireApiPermission } from "@/lib/server/api-permissions";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-haiku-latest";

export const maxDuration = 60;

interface MeetingAnalysisRequest {
  meeting?: MeetingRecord;
  client?: Client;
  project?: Project;
  conversationLogs?: ConversationLog[];
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

function parseJson(text: string): Partial<MeetingAnalysis> | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned) as Partial<MeetingAnalysis>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const permission = await requireApiPermission(request, "ai:run");
  if (!permission.ok) return permission.response;

  const body = (await request.json()) as MeetingAnalysisRequest;
  const meeting = body.meeting;
  const client = body.client;
  const project = body.project;
  const conversationLogs = body.conversationLogs ?? meeting?.conversationLogs ?? [];

  if (!meeting || !client || !project) {
    return NextResponse.json({ error: "meeting, client, and project are required." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 503 });
  }

  const transcript = conversationLogs.length > 0 ? conversationLogsToTranscript(conversationLogs) : `${meeting.transcription ?? ""}\n${meeting.manualMemo ?? ""}`.trim();
  if (!transcript) {
    return NextResponse.json({ error: "meeting transcript or memo is required." }, { status: 400 });
  }
  const { salesOnlyText, customerOnlyText, responsePairsText } = buildAnalysisConversationText(conversationLogs);
  const isTeleAppo = meeting.kind === "電話";

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MEETING_MODEL || DEFAULT_MODEL,
        max_tokens: 1800,
        temperature: 0.2,
        system:
          "あなたはMOGCIA Dev Agentの営業分析Agentです。出力はJSONのみ。日本語で、営業現場がそのまま使える具体性にしてください。",
        messages: [
          {
            role: "user",
            content: [
              `会社: ${client.name}`,
              `案件: ${project.name}`,
              `会議種別: ${meeting.kind}`,
              isTeleAppo ? "これはテレアポです。商談クロージングではなく、アポ打診・関心確認・次回接点づくりとして軽量に評価してください。" : "これは商談です。課題、要望、懸念、次回提案を評価してください。",
              "conversationLogsがある場合は、全文より話者別ログを優先して分析してください。",
              "",
              "全文/会話ログ:",
              transcript,
              "",
              salesOnlyText ? `営業発言のみ:\n${salesOnlyText}` : "",
              customerOnlyText ? `顧客発言のみ:\n${customerOnlyText}` : "",
              responsePairsText ? `質問回答/反論返答ペア:\n${responsePairsText}` : "",
              "",
              "JSON keys: summary, customerStatements, mogciaStatements, issues, requests, concerns, importantPoints, proposals, decisions, undecided, confirmations, nextActions, dealStatusCandidate, leadScore, leadGrade, goodPoints, badPoints, talkFlow, talkScript, preparationItems, objectionHandling, projectCandidate, requirementInput, salesNotes",
              "nextActionsは {title, assignee, due, importance} の配列。leadGradeは 高/中/低。"
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      return NextResponse.json({ error: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((item) => item.type === "text")?.text ?? "";
    const analysis = parseJson(text);
    if (!analysis) {
      return NextResponse.json({ error: "Claude response was not JSON." }, { status: 502 });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meeting analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
