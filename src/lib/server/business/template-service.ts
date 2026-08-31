import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { BusinessApiError, nullableString, requireString, serializeDoc, type BusinessAuth } from "@/lib/server/business/api";
import { listActivitiesByCompanyId, listActivitiesByLeadId } from "@/lib/server/business/activity-service";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { getCompanyById } from "@/lib/server/business/company-service";
import { getLeadById } from "@/lib/server/business/lead-service";
import { getProductById } from "@/lib/server/business/product-service";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export type TemplateGenerateInput = {
  templateId?: unknown;
  relatedSource?: unknown;
  relatedId?: unknown;
  productId?: unknown;
  instruction?: unknown;
};

export async function listBusinessTemplates(auth: BusinessAuth, options: { limit?: number; category?: string | null } = {}) {
  const snapshot = await auth.db.collection("businessTemplates").orderBy("updatedAt", "desc").limit(options.limit ?? 500).get();
  return snapshot.docs
    .map((entry) => serializeDoc(entry.id, entry.data()))
    .filter((template) => !options.category || template.category === options.category);
}

export async function getBusinessTemplateById(auth: BusinessAuth, templateId: string) {
  const snapshot = await auth.db.collection("businessTemplates").doc(templateId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "テンプレートが見つかりません。", 404);
  return serializeDoc(snapshot.id, snapshot.data() ?? {});
}

export async function generateBusinessTemplateContent(auth: BusinessAuth, input: TemplateGenerateInput) {
  const templateId = requireString(input.templateId, "テンプレートID", 160);
  const relatedSource = normalizeRelatedSource(input.relatedSource);
  const relatedId = nullableString(input.relatedId, 160);
  const productId = nullableString(input.productId, 160);
  if (!process.env.OPENAI_API_KEY) throw new BusinessApiError("AI_ERROR", "AI生成に必要な設定が未完了です。", 503);

  const template = await getBusinessTemplateById(auth, templateId);
  const [related, product, activities, calendarEvents] = await Promise.all([
    relatedSource && relatedId ? loadRelated(auth, relatedSource, relatedId) : Promise.resolve(null),
    productId ? getProductById(auth, productId).catch(() => null) : Promise.resolve(null),
    relatedSource && relatedId ? loadActivities(auth, relatedSource, relatedId) : Promise.resolve([]),
    relatedSource && relatedId ? loadCalendarEvents(auth, relatedSource, relatedId) : Promise.resolve([])
  ]);

  const generated = await generateWithOpenAi({
    template,
    related,
    product,
    activities,
    calendarEvents,
    instruction: nullableString(input.instruction, 1000)
  });
  await auth.db.collection("businessTemplates").doc(templateId).set({
    usageCount: FieldValue.increment(1),
    lastUsedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return generated;
}

export async function findTemplateForInstruction(auth: BusinessAuth, rawMessage: string) {
  const templates = await listBusinessTemplates(auth, { limit: 80 });
  const emailLike = /(メール|mail|文面|文章|送付|返信)/i.test(rawMessage);
  const preferred = templates.filter((template) => {
    const category = String(template.category ?? "");
    return emailLike ? category === "email" || category === "proposal" || category === "meeting" : true;
  });
  return preferred[0] ?? templates[0] ?? null;
}

async function loadRelated(auth: BusinessAuth, source: "lead" | "company", id: string) {
  if (source === "lead") return getLeadById(auth, id).catch(() => null);
  return getCompanyById(auth, id).catch(() => null);
}

async function loadActivities(auth: BusinessAuth, source: "lead" | "company", id: string) {
  return source === "lead"
    ? listActivitiesByLeadId(auth, id, { limit: 8 })
    : listActivitiesByCompanyId(auth, id, { limit: 8 });
}

async function loadCalendarEvents(auth: BusinessAuth, source: "lead" | "company", id: string) {
  const events = await listCalendarEvents(auth, { limit: 80 });
  const now = Date.now();
  return events
    .filter((event) => {
      if (source === "lead" && event.relatedType === "lead" && event.relatedId === id) return true;
      if (source === "company" && event.companyId === id) return true;
      if (source === "company" && event.relatedType === "company" && event.relatedId === id) return true;
      return false;
    })
    .filter((event) => dateMillis(event.startAt) >= now)
    .slice(0, 8);
}

async function generateWithOpenAi(input: {
  template: Record<string, unknown>;
  related: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  activities: Array<Record<string, unknown>>;
  calendarEvents: Array<Record<string, unknown>>;
  instruction?: string | null;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "あなたはMOGCIAの営業メール作成AIです。渡されたテンプレート、関連先、商材、最近の活動、今後の予定だけを根拠に、実務で使える件名と本文を日本語で作成してください。存在しない担当者、課題、約束、料金、導入状況は推測しないでください。JSONだけを返してください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: input.instruction || "次のJSON形式で返してください: {\"subject\":\"\",\"body\":\"\"}",
            template: pickTemplate(input.template),
            related: input.related ? pickRelated(input.related) : null,
            product: input.product ? pickProduct(input.product) : null,
            recentActivities: input.activities.map(pickActivity),
            upcomingCalendarEvents: input.calendarEvents.map(pickCalendarEvent)
          })
        }
      ]
    })
  });

  const text = await response.text();
  const json = parseJson(text);
  if (!response.ok) throw new BusinessApiError("AI_ERROR", `AI生成に失敗しました。時間をおいて再実行してください。（HTTP ${response.status}）`, 502);
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new BusinessApiError("AI_ERROR", "AI生成結果が空でした。", 502);
  const generated = parseJson(content) as { subject?: unknown; body?: unknown };
  return {
    subject: typeof generated.subject === "string" ? generated.subject.trim() : "",
    body: typeof generated.body === "string" ? generated.body.trim() : ""
  };
}

function normalizeRelatedSource(value: unknown): "lead" | "company" | null {
  if (value === "lead" || value === "company") return value;
  return null;
}

function parseJson(text: string): ChatCompletionResponse {
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new BusinessApiError("AI_ERROR", "AI生成サーバーから正しいJSONが返りませんでした。", 502);
  }
}

function pickTemplate(data: Record<string, unknown>) {
  return { title: data.title, subject: data.subject ?? data.description, description: data.description, category: data.category, scene: data.scene, content: data.content };
}

function pickRelated(data: Record<string, unknown>) {
  return {
    sourceId: data.id,
    name: data.companyName ?? data.name,
    contactName: data.contactName ?? data.primaryContactName,
    contactRole: data.contactRole,
    status: data.status,
    productName: data.productName,
    nextActionTitle: data.nextActionTitle,
    notes: data.notes
  };
}

function pickProduct(data: Record<string, unknown>) {
  return { name: data.name ?? data.displayName, summary: data.summary ?? data.description, values: data.values, targetIndustries: data.targetIndustries, problems: data.problems };
}

function pickActivity(data: Record<string, unknown>) {
  return { title: data.title, type: data.type ?? data.activityType, content: data.content, productName: data.productName, occurredAt: data.occurredAt };
}

function pickCalendarEvent(data: Record<string, unknown>) {
  return { title: data.title, companyName: data.companyName, productName: data.productName, startAt: data.startAt, meetingMethod: data.meetingMethod };
}

function dateMillis(value: unknown) {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis() as number;
  return 0;
}
