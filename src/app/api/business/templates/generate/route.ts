import { FieldValue } from "firebase-admin/firestore";
import { BusinessApiError, authenticateBusinessRequest, businessFailure, businessSuccess, nullableString, requireString, serializeDoc, withBusinessAudit } from "@/lib/server/business/api";

export const runtime = "nodejs";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const templateId = requireString(body.templateId, "テンプレートID", 160);
    const relatedSource = normalizeRelatedSource(body.relatedSource);
    const relatedId = nullableString(body.relatedId, 160);
    const productId = nullableString(body.productId, 160);
    const data = await withBusinessAudit(auth, "business_template_generate", async () => {
      if (!process.env.OPENAI_API_KEY) throw new BusinessApiError("AI_ERROR", "AI生成に必要な設定が未完了です。", 503);
      const templateRef = auth.db.collection("businessTemplates").doc(templateId);
      const templateSnapshot = await templateRef.get();
      if (!templateSnapshot.exists) throw new BusinessApiError("NOT_FOUND", "テンプレートが見つかりません。", 404);
      const template = serializeDoc(templateSnapshot.id, templateSnapshot.data() ?? {});
      const [related, product, activities] = await Promise.all([
        relatedSource && relatedId ? loadRelated(auth.db, relatedSource, relatedId) : Promise.resolve(null),
        productId ? loadDoc(auth.db, "products", productId) : Promise.resolve(null),
        relatedId ? loadActivities(auth.db, relatedSource, relatedId) : Promise.resolve([])
      ]);
      const generated = await generateWithOpenAi({ template, related, product, activities });
      await templateRef.set({ usageCount: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return generated;
    }, templateId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

async function generateWithOpenAi(input: { template: Record<string, unknown>; related: Record<string, unknown> | null; product: Record<string, unknown> | null; activities: Array<Record<string, unknown>> }) {
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
            "あなたはMOGCIAの営業テンプレート生成AIです。渡されたテンプレート、関連先、商材、最近の活動だけを根拠に、実務で使える件名と本文を日本語で作成してください。存在しない担当者、課題、約束、料金、導入状況は推測しないでください。JSONだけを返してください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: "次のJSON形式で返してください: {\"subject\":\"\",\"body\":\"\"}",
            template: pickTemplate(input.template),
            related: input.related ? pickRelated(input.related) : null,
            product: input.product ? pickProduct(input.product) : null,
            recentActivities: input.activities.map(pickActivity)
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

async function loadRelated(db: FirebaseFirestore.Firestore, source: "lead" | "company", id: string) {
  return loadDoc(db, source === "lead" ? "leads" : "companies", id);
}

async function loadDoc(db: FirebaseFirestore.Firestore, collectionName: string, id: string) {
  const snapshot = await db.collection(collectionName).doc(id).get();
  return snapshot.exists ? serializeDoc(snapshot.id, snapshot.data() ?? {}) : null;
}

async function loadActivities(db: FirebaseFirestore.Firestore, source: "lead" | "company" | null, id: string) {
  if (!source) return [];
  const field = source === "lead" ? "leadId" : "companyId";
  const snapshot = await db.collection("activities").where(field, "==", id).orderBy("occurredAt", "desc").limit(8).get();
  return snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data()));
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
  return { title: data.title, description: data.description, category: data.category, scene: data.scene, content: data.content };
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
