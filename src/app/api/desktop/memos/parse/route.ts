import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { listActivitiesByCompanyId } from "@/lib/server/business/activity-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { getCompanyById, listCompanies, toDesktopCompanyPayload } from "@/lib/server/business/company-service";
import { listTasks } from "@/lib/server/business/task-service";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { DesktopMemoSource, ParsedDesktopMemo } from "@/types/desktop";

const memoSchema = {
  name: "desktop_memo_parse",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["companyCandidates", "activityLog", "suggestedTasks", "companyNotes", "warnings"],
    properties: {
      companyCandidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "confidence"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            confidence: { type: "number" }
          }
        }
      },
      activityLog: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["selected", "type", "title", "content", "occurredAt"],
        properties: {
          selected: { type: "boolean" },
          type: { type: "string", enum: ["phone", "email", "visit", "meeting", "memo", "other"] },
          title: { type: "string" },
          content: { type: "string" },
          occurredAt: { type: ["string", "null"] }
        }
      },
      suggestedTasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tempId", "selected", "title", "description", "dueDate", "priority", "reason"],
          properties: {
            tempId: { type: "string" },
            selected: { type: "boolean" },
            title: { type: "string" },
            description: { type: "string" },
            dueDate: { type: ["string", "null"] },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            reason: { type: "string" }
          }
        }
      },
      companyNotes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tempId", "selected", "content"],
          properties: {
            tempId: { type: "string" },
            selected: { type: "boolean" },
            content: { type: "string" }
          }
        }
      },
      warnings: { type: "array", items: { type: "string" } }
    }
  }
};

type ChatResponse = { choices?: Array<{ message?: { content?: string } }> };

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) throw new DesktopApiError("AI_ERROR", "OPENAI_API_KEYが未設定です", 503);
    const auth = await authenticateDesktopRequest(request, "useAiParser");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const text = requireString(body.text, "メモ", 10_000);
    const companyId = optionalString(body.companyId, "会社ID", 120) || null;
    const createdFrom = normalizeSource(body.createdFrom);

    const data = await withDesktopAudit(context, "memo_parse", async () => {
      const businessAuth = toBusinessAuth(auth);
      const selectedCompany = companyId ? await getCompanyById(businessAuth, companyId).catch(() => null) : null;
      if (companyId && !selectedCompany) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
      const candidates = await findCompanyCandidates(businessAuth, text, companyId);
      const recentLogs = companyId ? await listActivitiesByCompanyId(businessAuth, companyId, { limit: 8, includeLegacy: true }) : [];
      const openTasks = companyId ? await listTasks(businessAuth, { includeCompleted: false, limit: 20 }) : [];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_schema", json_schema: memoSchema },
          messages: [
            {
              role: "system",
              content:
                "あなたはMOGCIAの営業メモ整理AIです。ユーザー確認前に保存される前提の候補だけをJSONで返してください。曖昧な期限（来週、後日、月末など）は勝手に日付へ断定せず dueDate:null とし warnings に注意を入れてください。"
            },
            {
              role: "user",
              content: JSON.stringify({
                now: new Date().toISOString(),
                timezone: "Asia/Tokyo",
                userId: auth.userId,
                memo: text,
                selectedCompany,
                companyCandidates: candidates,
                recentLogs,
                openTasks: openTasks.filter((task) => !companyId || task.companyId === companyId)
              })
            }
          ]
        })
      });

      if (!response.ok) throw new DesktopApiError("AI_ERROR", `AI解析に失敗しました: ${response.status}`, 502);
      const result = (await response.json()) as ChatResponse;
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new DesktopApiError("AI_ERROR", "AI解析結果が空でした", 502);
      const parsed = normalizeParsedMemo(JSON.parse(content) as ParsedDesktopMemo, candidates);
      const memoRef = await auth.db.collection("desktopMemos").add({
        userId: auth.userId,
        text,
        companyId,
        status: "parsed",
        parsedResult: parsed,
        createdFrom,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { memoId: memoRef.id, parsed };
    }, companyId);

    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

async function findCompanyCandidates(auth: BusinessAuth, text: string, selectedCompanyId: string | null) {
  const companies = await listCompanies(auth, { limit: 200 });
  const lower = text.toLowerCase();
  return companies
    .map((data) => {
      const company = toDesktopCompanyPayload(data);
      const id = String(company.id ?? "");
      const confidence = selectedCompanyId === id ? 1 : lower.includes(company.name.toLowerCase()) || company.name.split(/\s+/).some((part) => part && lower.includes(part.toLowerCase())) ? 0.78 : 0.3;
      return { id, name: company.name, confidence };
    })
    .filter((candidate) => candidate.confidence >= 0.5)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);
}

function normalizeParsedMemo(parsed: ParsedDesktopMemo, candidates: Array<{ id: string; name: string; confidence: number }>): ParsedDesktopMemo {
  return {
    companyCandidates: parsed.companyCandidates?.length ? parsed.companyCandidates : candidates,
    activityLog: parsed.activityLog ?? undefined,
    suggestedTasks: parsed.suggestedTasks.slice(0, 8).map((task, index) => ({
      ...task,
      tempId: task.tempId || `task-${index + 1}`,
      selected: Boolean(task.selected),
      priority: task.priority === "high" || task.priority === "low" ? task.priority : "medium"
    })),
    companyNotes: parsed.companyNotes.slice(0, 8).map((note, index) => ({
      ...note,
      tempId: note.tempId || `note-${index + 1}`,
      selected: Boolean(note.selected)
    })),
    warnings: parsed.warnings ?? []
  };
}

function normalizeSource(value: unknown): DesktopMemoSource {
  if (value === "menubar" || value === "floating_window") return value;
  return "cli";
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>): BusinessAuth {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop",
    deviceId: auth.device.id
  };
}
