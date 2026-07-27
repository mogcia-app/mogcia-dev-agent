import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

const adviceSchema = {
  name: "teleapo_advice",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "temperature",
      "prospectScore",
      "scoreReason",
      "customerIssues",
      "concerns",
      "meetingWarnings",
      "meetingQuestions",
      "scheduleCallScript",
      "meetingScript",
      "materials",
      "nextActions",
      "gapFromTeleapo",
      "closeReasons",
      "lostRisks",
      "shouldFollowupCall",
      "shouldFollowupEmail",
      "followupTiming",
      "followupTimingReason",
      "followupCallScript",
      "followupEmail",
      "nextMeetingQuestions",
      "additionalMaterials"
    ],
    properties: {
      summary: { type: "string" },
      temperature: { type: "string", enum: ["high", "middle", "low"] },
      prospectScore: { type: "number", minimum: 0, maximum: 100 },
      scoreReason: { type: "string" },
      customerIssues: { type: "array", items: { type: "string" } },
      concerns: { type: "array", items: { type: "string" } },
      meetingWarnings: { type: "array", items: { type: "string" } },
      meetingQuestions: { type: "array", items: { type: "string" } },
      scheduleCallScript: {
        type: "object",
        additionalProperties: false,
        required: ["candidates", "script"],
        properties: {
          candidates: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "datetime", "reason"],
              properties: {
                label: { type: "string" },
                datetime: { type: "string" },
                reason: { type: "string" }
              }
            }
          },
          script: { type: "string" }
        }
      },
      meetingScript: {
        type: "object",
        additionalProperties: false,
        required: ["greeting", "hearing", "issue整理", "proposal", "qa", "nextAction"],
        properties: {
          greeting: { type: "array", items: { type: "string" } },
          hearing: { type: "array", items: { type: "string" } },
          issue整理: { type: "array", items: { type: "string" } },
          proposal: { type: "array", items: { type: "string" } },
          qa: { type: "array", items: { type: "string" } },
          nextAction: { type: "array", items: { type: "string" } }
        }
      },
      materials: { type: "array", items: { type: "string" } },
      nextActions: { type: "array", items: { type: "string" } },
      gapFromTeleapo: { type: "array", items: { type: "string" } },
      closeReasons: { type: "array", items: { type: "string" } },
      lostRisks: { type: "array", items: { type: "string" } },
      shouldFollowupCall: { type: "boolean" },
      shouldFollowupEmail: { type: "boolean" },
      followupTiming: { type: "string" },
      followupTimingReason: { type: "string" },
      followupCallScript: { type: "string" },
      followupEmail: { type: "string" },
      nextMeetingQuestions: { type: "array", items: { type: "string" } },
      additionalMaterials: { type: "array", items: { type: "string" } }
    }
  }
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function POST(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const model = process.env.OPENAI_ADVICE_MODEL || process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
    }

    const user = await requireUserFromRequest(request);
    const { recordId } = await params;
    const db = getAdminDb();
    const ref = db.collection("teleapoRecords").doc(recordId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const record = snapshot.data();
    if (record?.userId !== user.uid && user.uid !== "TjDadmBAdVYaPEvG3ppfBLS4HGN2") return NextResponse.json({ error: "forbidden" }, { status: 403 });

    await ref.update({ aiAdviceStatus: "running", aiAdviceModel: model, aiAdviceError: null, updatedAt: FieldValue.serverTimestamp() });

    const productSnapshot = record?.productId ? await db.collection("products").doc(String(record.productId)).get() : null;
    const calendarSnapshot = await db.collection("calendarEvents").orderBy("startAt", "asc").limit(20).get();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: adviceSchema },
        messages: [
          {
            role: "system",
            content:
              "あなたはBtoB営業のテレアポ・商談フォロー専門のAIです。営業がすぐ行動できるよう、短く具体的な日本語でJSON Schemaに厳密に従って返してください。"
          },
          {
            role: "user",
            content: JSON.stringify({
              record,
              product: productSnapshot?.exists ? productSnapshot.data() : null,
              calendarAvailabilitySource: calendarSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
              instruction:
                record?.salesDomain === "meeting"
                  ? "商談後分析として、テレアポ時の想定との差分、追っかけ電話/メール、追うべきタイミングと理由を重視してください。"
                  : "テレアポ後分析として、日程調整電話の候補日を3つ、5分程度の台本、1時間商談の要点台本、必要資料候補を重視してください。"
            })
          }
        ]
      })
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const result = (await response.json()) as ChatCompletionResponse;
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI response was empty.");
    const advice = JSON.parse(content) as unknown;

    await ref.update({
      aiAdviceStatus: "completed",
      aiAdvice: advice,
      aiAdviceModel: model,
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { recordId } = await params;
    await getAdminDb().collection("teleapoRecords").doc(recordId).set(
      {
        aiAdviceStatus: "failed",
        aiAdviceError: error instanceof Error ? error.message : "advice_failed",
        aiAdviceModel: model,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return NextResponse.json({ error: error instanceof Error ? error.message : "advice_failed" }, { status: 500 });
  }
}
