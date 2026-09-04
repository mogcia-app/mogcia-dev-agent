import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";
import { createActivity, listActivitiesByCompanyId, updateActivity } from "@/lib/server/business/activity-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { getCompanyById } from "@/lib/server/business/company-service";
import { getProductById } from "@/lib/server/business/product-service";
import { getUserFamilyNameById } from "@/lib/user-display";

const stringArraySchema = { type: "array", items: { type: "string" } } as const;
const prioritySchema = { type: "string", enum: ["high", "medium", "low"] } as const;
const evidenceItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sourceQuote", "confidence"],
  properties: {
    text: { type: "string" },
    sourceQuote: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;
const issueItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "detail", "priority", "evidence", "confirmationQuestion", "proposalConnection"],
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
    priority: prioritySchema,
    evidence: { type: "string" },
    confirmationQuestion: { type: "string" },
    proposalConnection: { type: "string" }
  }
} as const;
const materialItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "priority", "purpose", "timing", "pages"],
  properties: {
    name: { type: "string" },
    priority: prioritySchema,
    purpose: { type: "string" },
    timing: { type: "string" },
    pages: stringArraySchema
  }
} as const;
const questionItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "purpose", "expectedAnswers", "followUps"],
  properties: {
    question: { type: "string" },
    purpose: { type: "string" },
    expectedAnswers: stringArraySchema,
    followUps: stringArraySchema
  }
} as const;
const scriptBranchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["condition", "response", "nextAction"],
  properties: {
    condition: { type: "string" },
    response: { type: "string" },
    nextAction: { type: "string" }
  }
} as const;
const scriptSectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["minutes", "objective", "script", "questions", "materials", "branches", "cautions"],
  properties: {
    minutes: { type: "string" },
    objective: { type: "string" },
    script: stringArraySchema,
    questions: stringArraySchema,
    materials: stringArraySchema,
    branches: { type: "array", items: scriptBranchSchema },
    cautions: stringArraySchema
  }
} as const;
const taskItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "owner", "dueDate", "priority", "status", "relatedMaterials", "completionCondition", "aiCanGenerate", "manualRequired"],
  properties: {
    title: { type: "string" },
    owner: { type: "string" },
    dueDate: { type: "string" },
    priority: prioritySchema,
    status: { type: "string", enum: ["todo", "doing", "done"] },
    relatedMaterials: stringArraySchema,
    completionCondition: { type: "string" },
    aiCanGenerate: { type: "boolean" },
    manualRequired: stringArraySchema
  }
} as const;

const adviceSchema = {
  name: "teleapo_advice",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "temperature",
      "temperatureReason",
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
      "additionalMaterials",
      "meetingPreparation"
    ],
    properties: {
      summary: { type: "string" },
      temperature: { type: "string", enum: ["high", "middle", "low"] },
      temperatureReason: { type: "string" },
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
      additionalMaterials: { type: "array", items: { type: "string" } },
      meetingPreparation: {
        type: "object",
        additionalProperties: false,
        required: [
          "overview",
          "prospectScore",
          "contactAnalysis",
          "issues",
          "proposalStrategy",
          "schedulingCall",
          "preparation",
          "questions",
          "meetingScript",
          "openingTalk",
          "proposalTalk",
          "objections",
          "closingTalk",
          "riskPoints",
          "winningPoints",
          "nextActions",
          "generatedAt",
          "sources"
        ],
        properties: {
          overview: {
            type: "object",
            additionalProperties: false,
            required: ["companyName", "contactName", "contactRole", "industry", "productName", "callDate", "audioDuration", "nextMeetingDate", "meetingStatus", "salesRep", "companyLink"],
            properties: {
              companyName: { type: "string" },
              contactName: { type: "string" },
              contactRole: { type: "string" },
              industry: { type: "string" },
              productName: { type: "string" },
              callDate: { type: "string" },
              audioDuration: { type: "string" },
              nextMeetingDate: { type: "string" },
              meetingStatus: { type: "string" },
              salesRep: { type: "string" },
              companyLink: { type: "string" }
            }
          },
          prospectScore: {
            type: "object",
            additionalProperties: false,
            required: ["rank", "score", "estimatedCloseProbability", "temperature", "temperatureLabel", "meetingConversionStrength", "followUpTiming", "nextMeetingTiming", "reason", "positiveSignals", "negativeSignals", "missingInformation"],
            properties: {
              rank: { type: "string", enum: ["A", "B+", "B", "B-", "C"] },
              score: { type: "number", minimum: 0, maximum: 100 },
              estimatedCloseProbability: { type: "number", minimum: 0, maximum: 100 },
              temperature: { type: "string", enum: ["high", "middle", "low"] },
              temperatureLabel: { type: "string" },
              meetingConversionStrength: { type: "string" },
              followUpTiming: { type: "string" },
              nextMeetingTiming: { type: "string" },
              reason: { type: "string" },
              positiveSignals: { type: "array", items: evidenceItemSchema },
              negativeSignals: { type: "array", items: evidenceItemSchema },
              missingInformation: stringArraySchema
            }
          },
          contactAnalysis: {
            type: "object",
            additionalProperties: false,
            required: ["type", "decisionStyle", "salesResistance", "numericalInterest", "comprehensionLevel", "conversationControl", "interestedTopics", "weakReactionTopics", "communicationRecommendations", "avoid", "evidence", "confidence"],
            properties: {
              type: stringArraySchema,
              decisionStyle: { type: "string" },
              salesResistance: { type: "string" },
              numericalInterest: { type: "string" },
              comprehensionLevel: { type: "string" },
              conversationControl: { type: "string" },
              interestedTopics: stringArraySchema,
              weakReactionTopics: stringArraySchema,
              communicationRecommendations: stringArraySchema,
              avoid: stringArraySchema,
              evidence: { type: "array", items: evidenceItemSchema },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            }
          },
          issues: {
            type: "object",
            additionalProperties: false,
            required: ["explicit", "essential", "latent"],
            properties: {
              explicit: { type: "array", items: issueItemSchema },
              essential: { type: "array", items: issueItemSchema },
              latent: { type: "array", items: issueItemSchema }
            }
          },
          proposalStrategy: {
            type: "object",
            additionalProperties: false,
            required: ["mainTheme", "winningApproach", "proposalPriority", "avoidProposals", "recommendedCaseStudies", "recommendedMaterials", "firstFeature", "firstMaterial", "metricsToShow", "cautions"],
            properties: {
              mainTheme: { type: "string" },
              winningApproach: stringArraySchema,
              proposalPriority: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "score", "reason", "talkPoint"],
                  properties: {
                    title: { type: "string" },
                    score: { type: "number", minimum: 1, maximum: 5 },
                    reason: { type: "string" },
                    talkPoint: { type: "string" }
                  }
                }
              },
              avoidProposals: stringArraySchema,
              recommendedCaseStudies: stringArraySchema,
              recommendedMaterials: { type: "array", items: materialItemSchema },
              firstFeature: { type: "string" },
              firstMaterial: { type: "string" },
              metricsToShow: stringArraySchema,
              cautions: stringArraySchema
            }
          },
          schedulingCall: {
            type: "object",
            additionalProperties: false,
            required: ["opening", "previousCallReference", "purposeConfirmation", "dateProposalScript", "durationGuide", "participantConfirmation", "meetingFormatConfirmation", "questionResponses", "voicemail", "retryCall", "closing"],
            properties: {
              opening: { type: "string" },
              previousCallReference: { type: "string" },
              purposeConfirmation: { type: "string" },
              dateProposalScript: { type: "string" },
              durationGuide: { type: "string" },
              participantConfirmation: { type: "string" },
              meetingFormatConfirmation: { type: "string" },
              questionResponses: { type: "array", items: scriptBranchSchema },
              voicemail: { type: "string" },
              retryCall: { type: "string" },
              closing: { type: "string" }
            }
          },
          preparation: {
            type: "object",
            additionalProperties: false,
            required: ["objectives", "requiredResearch", "requiredMaterials", "optionalMaterials", "avoidMaterials", "requiredNumbers", "requiredDemos", "internalChecks", "meetingGoal", "mustDecideByEnd"],
            properties: {
              objectives: stringArraySchema,
              requiredResearch: { type: "array", items: taskItemSchema },
              requiredMaterials: { type: "array", items: materialItemSchema },
              optionalMaterials: { type: "array", items: materialItemSchema },
              avoidMaterials: { type: "array", items: materialItemSchema },
              requiredNumbers: stringArraySchema,
              requiredDemos: stringArraySchema,
              internalChecks: stringArraySchema,
              meetingGoal: { type: "string" },
              mustDecideByEnd: stringArraySchema
            }
          },
          questions: {
            type: "object",
            additionalProperties: false,
            required: ["required", "deepDive", "numerical", "decision", "closing"],
            properties: {
              required: { type: "array", items: questionItemSchema },
              deepDive: { type: "array", items: questionItemSchema },
              numerical: { type: "array", items: questionItemSchema },
              decision: { type: "array", items: questionItemSchema },
              closing: { type: "array", items: questionItemSchema }
            }
          },
          meetingScript: {
            type: "object",
            additionalProperties: false,
            required: ["opening", "hearing", "issueSummary", "proposal", "demo", "pricing", "closing"],
            properties: {
              opening: scriptSectionSchema,
              hearing: scriptSectionSchema,
              issueSummary: scriptSectionSchema,
              proposal: scriptSectionSchema,
              demo: scriptSectionSchema,
              pricing: scriptSectionSchema,
              closing: scriptSectionSchema
            }
          },
          openingTalk: { type: "string" },
          proposalTalk: { type: "string" },
          objections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["objection", "probability", "background", "badResponse", "recommendedResponse", "followUpQuestion"],
              properties: {
                objection: { type: "string" },
                probability: { type: "number", minimum: 0, maximum: 100 },
                background: { type: "string" },
                badResponse: { type: "string" },
                recommendedResponse: { type: "string" },
                followUpQuestion: { type: "string" }
              }
            }
          },
          closingTalk: {
            type: "object",
            additionalProperties: false,
            required: ["high", "middle", "low"],
            properties: {
              high: { type: "string" },
              middle: { type: "string" },
              low: { type: "string" }
            }
          },
          riskPoints: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "reason", "prevention"],
              properties: {
                title: { type: "string" },
                reason: { type: "string" },
                prevention: { type: "string" }
              }
            }
          },
          winningPoints: stringArraySchema,
          nextActions: { type: "array", items: taskItemSchema },
          generatedAt: { type: "string" },
          sources: stringArraySchema
        }
      }
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

    const businessAuth = toBusinessAuth(user);
    const [product, company, recentActivityLogs, calendarEvents] = await Promise.all([
      record?.productId ? getProductById(businessAuth, String(record.productId)).catch(() => null) : Promise.resolve(null),
      record?.companyId ? getCompanyById(businessAuth, String(record.companyId)).catch(() => null) : Promise.resolve(null),
      record?.companyId ? listActivitiesByCompanyId(businessAuth, String(record.companyId), { limit: 20, includeLegacy: true }) : Promise.resolve([]),
      listCalendarEvents(businessAuth, { limit: 100, visibleOnly: false })
    ]);
    const now = new Date();
    const salesRepFamilyName = getUserFamilyNameById(String(record?.userId ?? user.uid), typeof record?.userName === "string" ? record.userName : null);
    const availableScheduleSlots = buildAvailableScheduleSlots(calendarEvents, now);
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
              salesRepFamilyName,
              product,
              company,
              recentActivityLogs,
              currentDateTime: formatDateTimeForPrompt(now),
              timezone: "Asia/Tokyo",
              scheduleRules: {
                allowedHours: "11:00-18:00",
                durationMinutes: 60,
                candidatesMustBe: "availableScheduleSlotsの中からのみ選ぶこと。現在日時より前の日付や、calendarAvailabilitySource内の予定と重なる時間は絶対に出さないこと。",
                outputFormat: "datetimeはISO8601(+09:00)で、labelは「第一候補」「第二候補」「第三候補」のようにすること。"
              },
              availableScheduleSlots,
              calendarAvailabilitySource: calendarEvents,
              prospectRankRule: {
                priority: "prospectScoreよりprospectRankを先に判定し、ランクに合うスコアを付けること。",
                ranks: {
                  A: "契約直前。契約書、見積、申込、開始日、社内稟議、決裁者確認まで進んでいる。次は契約・入金・導入準備に近い。score 85-100",
                  "B+": "高確度。顧客本人の前向きな発言が複数あり、次回アクション日時に加えて予算・決裁者・導入時期のどれかも具体的。score 70-84",
                  B: "通常見込み。検討意思や課題適合を示す顧客発言はあるが、決裁・予算・時期がまだ弱い。score 55-69",
                  "B-": "低め見込み。資料を見る、また連絡ください、訪問予定のみなど、次回接点はあるが顧客の主体的な関心・検討意思が弱い。score 35-54",
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
              temperatureRule: {
                high: "顧客側から導入意欲、課題感、予算、決裁、時期、社内共有、次回商談化などの明確な前向き発言が複数ある場合のみ。営業側が提案しただけ、訪問予定があるだけ、資料送付だけの場合は高めにしない。日本語表示は「高め」。",
                middle: "一定の会話継続や確認意思はあるが、前向き発言・課題・予算・時期・決裁の根拠が不足している。日本語表示は「普通」。",
                low: "反応が薄い、必要性が弱い、拒否や対象外に近い、または営業側の提案に対する明確な賛同がない。日本語表示は「低め」。",
                instruction: "temperatureReasonには、顧客本人の発言だけを主根拠にして短く具体的な日本語で書くこと。根拠が薄い場合は「関心は未確認」「温度感は断定不可」と書き、高め・前向きと断定しないこと。"
              },
              meetingPreparationInstruction: [
                "meetingPreparationは、テレアポで打ち合わせが確定した後に営業担当がそのまま使う案件専用の商談準備資料として作ること。",
                "音声・文字起こし・担当者メモ・会社情報・活動ログ・商材情報・カレンダー候補を使い、薄い一般論ではなく、この案件固有の根拠と提案にすること。",
                "存在しない日程、過去の日付、音声内にない発言、未確認の決裁者・予算・導入時期は断定しない。不明な値は必ず「未確認」と書くこと。",
                "事実とAI推測を分け、推測にはconfidenceまたは文面で信頼度を示すこと。sourceQuoteには音声やログの根拠がなければ「未確認」と書くこと。",
                "overviewには会社名、担当者、役職、電話日時、音声時間、商談ステータス、次回予定、商材、業種、営業担当、会社リンクを入れること。不明なら「未確認」。",
                `トークスクリプト内で営業担当者が名乗る場面は、必ず「${salesRepFamilyName}」という名字を使うこと。フルネーム、メールアドレス、userName、未確認、営業担当者名のような仮名は使わないこと。`,
                "prospectScoreはA/B+/B/B-/Cで判定し、score、成約確率、温度感の日本語表示、打ち合わせ化の強さ、フォロー時期、次回商談時期、根拠、良い要素、悪い要素、足りない情報を出すこと。",
                "contactAnalysisでは担当者タイプ、意思決定スタイル、営業への警戒度、数字への関心、理解度、会話主導権、反応が良い話題/弱い話題、推奨話法/避ける話法を根拠付きで出すこと。",
                "issuesは表面的課題、本質的課題、潜在課題に分け、各課題に根拠、確認質問、提案へのつなげ方、優先度を付けること。",
                "proposalStrategyでは中心テーマ、避ける提案、提案優先順位、最初に見せる機能・資料、事例、見せる数字、注意点、勝ち筋を出すこと。",
                "schedulingCallは日程調整電話でそのまま読める文章にすること。候補日時はavailableScheduleSlotsからのみ選び、候補がない場合は「カレンダー確認後に提示」と書くこと。",
                "preparationでは必須資料、あると良い資料、見せない資料、事前調査、確認ページ、準備する数字、デモ、社内確認、商談ゴール、当日決めるべきことを整理すること。",
                "questionsは必ず聞く質問、深掘り、数字、決裁、クロージングに分け、目的・想定回答・回答別の切り返しを付けること。",
                "meetingScriptは30分商談を想定し、冒頭、ヒアリング、課題整理、提案、デモ、料金、クロージングの時間配分と台本、質問、資料、分岐、注意点を入れること。",
                "objectionsは料金、効果、運用負担、LINE/OTA/既存運用など案件に合う反論を選び、悪い返答と推奨返答を出すこと。",
                "nextActionsはタスク名、担当者、期限、優先度、ステータス、関連資料、完了条件、AI作成可否、手動対応を具体的に入れること。",
                "proposalPriority、requiredMaterials、questions.required、questions.deepDive、objections、nextActionsは空配列にしないこと。根拠が薄い場合でも「未確認」を確認するための質問・資料・反論候補として最低3件ずつ作ること。"
              ].join("\n"),
              instruction:
                record?.salesDomain === "meeting"
                  ? [
                      `トークスクリプト・電話文面で営業担当が名乗る場合は、必ず名字「${salesRepFamilyName}」を使ってください。`,
                      "商談後分析として、prospectRankをA/B+/B/B-/Cで厳密に判定してください。",
                      "summaryは商談内容を2〜3文で要約してください。文字起こし本文、挨拶の全文、会話の長い引用、逐語録の貼り付けは禁止です。要約には「誰と何を話し、何が分かり、次に何をするか」だけを書いてください。顧客の関心度・温度感は、明確な顧客発言がある場合だけ書き、根拠が薄い場合は書かないでください。",
                      "record.diagnosisSheetがある場合は、人間が商談終了後に入力した評価として重視してください。ただし、会話ログと矛盾する場合は矛盾点をrankReasonやmissingInformationに含めてください。",
                      "営業が次に動けるよう、良かった点、ダメだった点・弱かった点、顧客が前向きだった発言、迷っていた発言、決まりそうな条件、足りない情報、成約のために必要なもの、失注リスクを具体的に出してください。",
                      "良かった点は、営業側のヒアリング、提案、切り返し、次回アクション設定ができていたかを評価してください。",
                      "ダメだった点は、決裁者、予算、導入時期、競合、懸念点を聞けていないなどを評価してください。",
                      "決まりそうな条件は、見積、契約書、事例、費用対効果、決裁者同席、導入スケジュール、具体的な運用イメージなどから判断してください。",
                      "フォローアップするべきか、理由、タイミング、方法(phone/email/chat/meeting/none)、電話トーク、メール文面、次回商談で確認すること、次に送る資料を必ず実務的に書いてください。",
                      "followUpReasonには「なぜ今フォローする必要があるか」を、顧客の発言・未確認事項・次回アクションの有無に紐づけて書いてください。",
                      "followupTimingReasonには「なぜその日・そのタイミングなのか」を、商談後の鮮度、顧客の検討状況、送る資料、次に決めたいことと結びつけて書いてください。",
                      "followupCallScriptは単なる挨拶ではなく、目的、確認したいこと、送付/提示する資料、次の合意事項まで含めた実務トークにしてください。",
                      "followupEmailは未確認にせず、電話が不要な場合でも短いメール文面を作ってください。"
                    ].join("\n")
                  : `テレアポ後分析として、日程調整電話の候補日をavailableScheduleSlotsから3つ、5分程度の台本、1時間商談の要点台本、必要資料候補を重視してください。トークスクリプト・電話文面で営業担当が名乗る場合は、必ず名字「${salesRepFamilyName}」を使ってください。商談後専用項目は空配列または最小限で構いません。`
              ,
              summaryRule: "summaryは2〜3文の日本語要約のみ。文字起こし本文、長い引用、挨拶全文、会話ログの貼り付けは禁止。顧客名、商材、分かった事実、次の動きに絞ること。顧客の関心度・温度感・前向きさは、顧客本人の明確な発言がある場合だけ書くこと。訪問予定、資料送付、営業側の提案だけを根拠に「関心は高め」「前向き」と書かないこと。"
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
    await upsertLeadSummaryActivity(businessAuth, recordId, record, advice);

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

async function upsertLeadSummaryActivity(auth: BusinessAuth, recordId: string, record: DocumentData | undefined, advice: unknown) {
  const leadId = typeof record?.leadId === "string" ? record.leadId.trim() : "";
  const summary = readAdviceSummary(advice);
  if (!leadId || !summary) return;

  const isMeeting = record?.salesDomain === "meeting";
  const activityBody = {
    leadId,
    companyId: typeof record?.companyId === "string" ? record.companyId : null,
    type: isMeeting ? "meeting" : "telemarketing",
    title: isMeeting ? "商談音声の要約" : "営業リスト音声の要約",
    content: summary,
    productId: typeof record?.productId === "string" ? record.productId : null,
    productName: typeof record?.productName === "string" ? record.productName : null,
    audioId: recordId,
    transcriptId: recordId,
    analysisId: recordId,
    occurredAt: toDate(record?.recordedAt) ?? new Date(),
    force: true
  };

  const existingSnapshot = await auth.db.collection("activities").where("analysisId", "==", recordId).limit(10).get();
  const existing = existingSnapshot.docs.find((entry) => {
    const data = entry.data();
    return data.leadId === leadId && (data.audioId === recordId || data.transcriptId === recordId || data.analysisId === recordId);
  });

  if (existing) {
    await updateActivity(auth, { id: existing.id, ...activityBody });
    return;
  }

  await createActivity(auth, activityBody);
}

function readAdviceSummary(advice: unknown): string {
  if (!advice || typeof advice !== "object") return "";
  const summary = (advice as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary.trim() : "";
}

type CalendarEventLike = {
  startAt?: { toDate?: () => Date } | Date | string | null;
  endAt?: { toDate?: () => Date } | Date | string | null;
  allDay?: unknown;
};

function buildAvailableScheduleSlots(events: CalendarEventLike[], now: Date): Array<{ label: string; datetime: string; endDatetime: string; display: string }> {
  const busy = events
    .map((event) => {
      const startAt = toDate(event.startAt);
      const endAt = toDate(event.endAt) ?? (startAt ? new Date(startAt.getTime() + 60 * 60 * 1000) : null);
      return startAt && endAt ? { startAt, endAt, allDay: Boolean(event.allDay) } : null;
    })
    .filter((event): event is { startAt: Date; endAt: Date; allDay: boolean } => Boolean(event));

  const slots: Array<{ label: string; datetime: string; endDatetime: string; display: string }> = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 21 && slots.length < 12; dayOffset += 1) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + dayOffset);
    const day = date.getDay();
    if (day === 0 || day === 6) continue;

    for (const hour of [11, 13, 14, 15, 16, 17]) {
      const start = new Date(date);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      if (start <= now) continue;
      if (end.getHours() > 18 || (end.getHours() === 18 && end.getMinutes() > 0)) continue;
      if (busy.some((event) => overlaps(start, end, event.startAt, event.endAt) || (event.allDay && isSameDate(start, event.startAt)))) continue;
      slots.push({
        label: `候補${slots.length + 1}`,
        datetime: toIsoWithTokyoOffset(start),
        endDatetime: toIsoWithTokyoOffset(end),
        display: formatJapaneseSlot(start, end)
      });
    }
  }

  return slots;
}

function toDate(value: CalendarEventLike["startAt"]): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.toDate === "function") return value.toDate();
  return null;
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toIsoWithTokyoOffset(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(" ", "T");
  return `${parts}+09:00`;
}

function formatJapaneseSlot(start: Date, end: Date): string {
  const date = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(start);
  const startTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(start);
  const endTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(end);
  return `${date} ${startTime}-${endTime}`;
}

function formatDateTimeForPrompt(date: Date): string {
  return `${formatJapaneseSlot(date, new Date(date.getTime() + 60 * 60 * 1000)).split("-")[0]} / ${toIsoWithTokyoOffset(date)}`;
}

function toBusinessAuth(user: { uid: string; name?: string }): BusinessAuth {
  return {
    db: getAdminDb(),
    userId: user.uid,
    userName: user.name ?? "",
    source: "web",
    deviceId: null
  };
}
