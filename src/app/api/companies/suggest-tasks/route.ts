import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";

const taskSchema = {
  name: "company_meeting_task_suggestions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "priority", "dueDate", "reason"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            dueDate: { type: ["string", "null"] },
            reason: { type: "string" }
          }
        }
      }
    }
  }
};

type SuggestedTask = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
  reason: string;
};

type ChatResponse = { choices?: Array<{ message?: { content?: string } }> };

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await getAdminAuth().verifyIdToken(token);

    const body = (await request.json()) as Record<string, unknown>;
    const title = stringValue(body.title);
    const companyName = stringValue(body.companyName);
    const content = stringValue(body.content);
    const nextActions = stringValue(body.nextActions);
    const productNames = Array.isArray(body.productNames) ? body.productNames.filter((item): item is string => typeof item === "string") : [];
    const contactNames = Array.isArray(body.contactNames) ? body.contactNames.filter((item): item is string => typeof item === "string") : [];

    if (!title || (!content && !nextActions)) return NextResponse.json({ tasks: [] });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ tasks: fallbackTasks(title, content, nextActions) });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_schema", json_schema: taskSchema },
        messages: [
          {
            role: "system",
            content:
              "あなたは営業打ち合わせ後のタスク整理AIです。内容と次回アクションから、実行単位の小さなタスクに分解してください。期限が明記されない場合はdueDateをnullにしてください。"
          },
          {
            role: "user",
            content: JSON.stringify({
              now: new Date().toISOString(),
              timezone: "Asia/Tokyo",
              companyName,
              meetingTitle: title,
              productNames,
              contactNames,
              content,
              nextActions
            })
          }
        ]
      })
    });

    if (!response.ok) return NextResponse.json({ tasks: fallbackTasks(title, content, nextActions) });
    const result = (await response.json()) as ChatResponse;
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{\"tasks\":[]}") as { tasks?: SuggestedTask[] };
    return NextResponse.json({ tasks: normalizeTasks(parsed.tasks ?? []) });
  } catch {
    return NextResponse.json({ tasks: [] });
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTasks(tasks: SuggestedTask[]): SuggestedTask[] {
  return tasks
    .filter((task) => task.title.trim())
    .slice(0, 8)
    .map((task) => ({
      title: task.title.trim(),
      description: task.description.trim(),
      priority: task.priority === "high" || task.priority === "low" ? task.priority : "medium",
      dueDate: task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ? task.dueDate : null,
      reason: task.reason.trim()
    }));
}

function fallbackTasks(title: string, content: string, nextActions: string): SuggestedTask[] {
  const source = nextActions || content;
  return source
    .split(/\n|。|・/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => ({
      title: item.length > 40 ? `${item.slice(0, 40)}...` : item,
      description: `${title}\n${content}`.trim(),
      priority: "medium" as const,
      dueDate: null,
      reason: "打ち合わせ内容と次回アクションから作成"
    }));
}
