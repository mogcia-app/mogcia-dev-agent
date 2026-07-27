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
      "prospectRank",
      "prospectScore",
      "rankReason",
      "scoreReason",
      "nextActionUrgency",
      "customerIssues",
      "concerns",
      "meetingWarnings",
      "meetingQuestions",
      "scheduleCallScript",
      "meetingScript",
      "materials",
      "nextActions",
      "positives",
      "negatives",
      "positiveCustomerSignals",
      "hesitationSignals",
      "closingRequirements",
      "missingInformation",
      "requiredMaterials",
      "gapFromTeleapo",
      "closeReasons",
      "lostRisks",
      "shouldFollowUp",
      "followUpReason",
      "followUpMethod",
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
      prospectRank: { type: "string", enum: ["A", "B+", "B", "B-", "C"] },
      prospectScore: { type: "number", minimum: 0, maximum: 100 },
      rankReason: { type: "string" },
      scoreReason: { type: "string" },
      nextActionUrgency: { type: "string", enum: ["today", "next_business_day", "within_3_days", "next_week", "long_term", "none"] },
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
      positives: { type: "array", items: { type: "string" } },
      negatives: { type: "array", items: { type: "string" } },
      positiveCustomerSignals: { type: "array", items: { type: "string" } },
      hesitationSignals: { type: "array", items: { type: "string" } },
      closingRequirements: { type: "array", items: { type: "string" } },
      missingInformation: { type: "array", items: { type: "string" } },
      requiredMaterials: { type: "array", items: { type: "string" } },
      gapFromTeleapo: { type: "array", items: { type: "string" } },
      closeReasons: { type: "array", items: { type: "string" } },
      lostRisks: { type: "array", items: { type: "string" } },
      shouldFollowUp: { type: "boolean" },
      followUpReason: { type: "string" },
      followUpMethod: { type: "string", enum: ["phone", "email", "chat", "meeting", "none"] },
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
              prospectRankRule: {
                priority: "prospectScoreよりprospectRankを先に判定し、ランクに合うスコアを付けること。",
                ranks: {
                  A: "契約直前。契約書、見積、申込、開始日、社内稟議、決裁者確認まで進んでいる。次は契約・入金・導入準備に近い。score 85-100",
                  "B+": "高確度。前向きで、次回アクション日時が決まっている。予算・決裁者・導入時期のどれかもかなり見えている。score 70-84",
                  B: "通常見込み。検討意思と課題適合はあるが、決裁・予算・時期がまだ弱い。score 55-69",
                  "B-": "低め見込み。興味はあるが温度感が薄い。資料を見る、また連絡ください止まり、次回時期が曖昧。score 35-54",
                  C: "見込みなし。明確に不要、予算なし、対象外、連絡拒否、課題不一致。score 0-34"
                },
                nextActionUrgency: {
                  today: "当日中に追うべき",
                  next_business_day: "翌営業日に追うべき",
                  within_3_days: "3営業日以内に追うべき",
                  next_week: "1週間以内に追うべき",
                  long_term: "長期フォローでよい",
                  none: "追わない"
                }
              },
              instruction:
                record?.salesDomain === "meeting"
                  ? [
                      "商談後分析として、prospectRankをA/B+/B/B-/Cで厳密に判定してください。",
                      "record.diagnosisSheetがある場合は、人間が商談終了後に入力した評価として重視してください。ただし、会話ログと矛盾する場合は矛盾点をrankReasonやmissingInformationに含めてください。",
                      "営業が次に動けるよう、良かった点、ダメだった点・弱かった点、顧客が前向きだった発言、迷っていた発言、決まりそうな条件、足りない情報、成約のために必要なもの、失注リスクを具体的に出してください。",
                      "良かった点は、営業側のヒアリング、提案、切り返し、次回アクション設定ができていたかを評価してください。",
                      "ダメだった点は、決裁者、予算、導入時期、競合、懸念点を聞けていないなどを評価してください。",
                      "決まりそうな条件は、見積、契約書、事例、費用対効果、決裁者同席、導入スケジュール、具体的な運用イメージなどから判断してください。",
                      "フォローアップするべきか、理由、タイミング、方法(phone/email/chat/meeting/none)、電話トーク、メール文面、次回商談で確認すること、次に送る資料を必ず実務的に書いてください。"
                    ].join("\n")
                  : "テレアポ後分析として、日程調整電話の候補日を3つ、5分程度の台本、1時間商談の要点台本、必要資料候補を重視してください。商談後専用項目は空配列または最小限で構いません。"
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
