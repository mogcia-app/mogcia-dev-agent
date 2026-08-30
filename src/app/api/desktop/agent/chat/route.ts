import { DesktopApiError, desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { handleDesktopConversation } from "@/lib/desktop/conversation";
import { type BusinessAuth } from "@/lib/server/business/api";
import { listActivities } from "@/lib/server/business/activity-service";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { listCompanies } from "@/lib/server/business/company-service";
import { listLeads } from "@/lib/server/business/lead-service";
import { listProducts } from "@/lib/server/business/product-service";
import { listTasks } from "@/lib/server/business/task-service";
import { getUserDisplayNameById } from "@/lib/user-display";

type DesktopAuth = Awaited<ReturnType<typeof authenticateDesktopRequest>>;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "useAiParser");
    const body = (await request.json()) as Record<string, unknown>;
    const rawMessage = requireString(body.message ?? body.rawMessage, "質問", 2000);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_chat", async () => {
      const result = await handleDesktopConversation(auth, { ...body, rawMessage });
      if (shouldGenerateAnswer(rawMessage, result.kind)) {
        const answer = await generateBusinessAnswer(auth, rawMessage, result.items ?? []);
        return {
          requestId: "",
          runId: "",
          answer,
          handled: true,
          kind: result.kind,
          items: result.items,
          draft: null,
          conversationId: result.conversationId ?? null,
          conversationStatus: result.conversationStatus ?? "completed",
          missingFields: result.missingFields ?? [],
          candidateEntities: result.candidateEntities ?? [],
          confirmationRequired: result.confirmationRequired ?? false,
          confirmationPayload: result.confirmationPayload ?? null,
          executedAction: result.executedAction ?? null,
          refreshRequired: result.refreshRequired ?? false,
          error: result.error ?? null
        };
      }
      return {
        requestId: "",
        runId: "",
        answer: result.message,
        handled: result.handled,
        kind: result.kind,
        items: result.items,
        draft: result.draft,
        conversationId: result.conversationId ?? null,
        conversationStatus: result.conversationStatus ?? "completed",
        missingFields: result.missingFields ?? [],
        candidateEntities: result.candidateEntities ?? [],
        confirmationRequired: result.confirmationRequired ?? false,
        confirmationPayload: result.confirmationPayload ?? null,
        executedAction: result.executedAction ?? null,
        refreshRequired: result.refreshRequired ?? false,
        error: result.error ?? null
      };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function shouldGenerateAnswer(rawMessage: string, kind: string) {
  if (kind === "business_query") return true;
  if (/(登録|追加|作成|保存|更新|変更|削除|既読|完了|入れて|設定して)/.test(rawMessage)) return false;
  return /(\?|？|どう|なに|何|どれ|どこ|いつ|教えて|確認|状況|一覧|ある|ありますか|未完了|未設定)/.test(rawMessage);
}

async function generateBusinessAnswer(auth: DesktopAuth, rawMessage: string, searchItems: unknown[]) {
  if (!process.env.OPENAI_API_KEY) {
    throw new DesktopApiError("AI_ERROR", "AI回答に必要な設定が未完了です。管理者に確認してください。", 503);
  }

  const context = await loadRelevantBusinessContext(auth, rawMessage, searchItems);
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
            "あなたはMOGCIAの業務アシスタントです。渡されたFirestore業務データ要約だけを根拠に、日本語で簡潔に回答してください。未登録・不明な情報は推測せず、不明または未登録と伝えてください。登録、更新、削除を実行したと勝手に断定しないでください。DevelopmentJob、Dev Agent Run、agentRequestsの話題は出さないでください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            now: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            timezone: "Asia/Tokyo",
            question: rawMessage,
            businessData: context
          })
        }
      ]
    })
  });

  const text = await response.text();
  const data = parseOpenAiJson(text);
  if (!response.ok) {
    throw new DesktopApiError("AI_ERROR", `AI回答の生成に失敗しました。時間をおいて再送してください。（HTTP ${response.status}）`, 502);
  }

  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new DesktopApiError("AI_ERROR", "AI回答が空でした。もう一度送信してください。", 502);
  return answer;
}

async function loadRelevantBusinessContext(auth: DesktopAuth, rawMessage: string, searchItems: unknown[]) {
  const keywords = extractKeywords(rawMessage);
  const targetDateKey = extractTargetDateKey(rawMessage);
  const [companies, leads, products, tasks] = await Promise.all([
    listCompanies(toBusinessAuth(auth), { limit: 120 }),
    listLeads(toBusinessAuth(auth), { limit: 120 }),
    listProducts(toBusinessAuth(auth), { limit: 80 }),
    listTasks(toBusinessAuth(auth), { limit: 120, includeCompleted: true })
  ]);

  const matchedCompanies = companies
    .map((entry) => ({ id: String(entry.id ?? ""), data: entry }))
    .filter((entry) => matchesKeywords(entry.data, keywords))
    .slice(0, 8);
  const matchedCompanyIds = new Set(matchedCompanies.map((entry) => entry.id));
  const matchedCompanyNames = new Set(matchedCompanies.map((entry) => String(entry.data.name ?? entry.data.companyName ?? "")).filter(Boolean));

  const matchedLeads = leads
    .map((entry) => ({ id: String(entry.id ?? ""), data: entry }))
    .filter((entry) => matchesKeywords(entry.data, keywords) || matchedCompanyNames.has(String(entry.data.companyName ?? "")))
    .slice(0, 8);
  matchedLeads.forEach((entry) => {
    const companyId = textField(entry.data, "companyId");
    if (companyId) matchedCompanyIds.add(companyId);
  });

  const matchedProducts = products
    .map((entry) => ({ id: String(entry.id ?? ""), data: entry }))
    .filter((entry) => matchesKeywords(entry.data, keywords))
    .slice(0, 6);
  const relevantTasks = tasks
    .map((entry) => ({ id: String(entry.id ?? ""), data: entry }))
    .filter((entry) => matchesKeywords(entry.data, keywords) || matchesDate(entry.data, targetDateKey, "dueDate", "deadline") || matchedCompanyIds.has(String(entry.data.companyId ?? "")) || matchedCompanyNames.has(String(entry.data.companyName ?? "")))
    .slice(0, 10);

  const [calendarEvents, activities] = await Promise.all([
    listCalendarEvents(toBusinessAuth(auth), { limit: 160 }),
    listActivities(toBusinessAuth(auth), { limit: 160 })
  ]);
  const relevantEvents = calendarEvents
    .map((entry) => ({ id: String(entry.id ?? ""), data: entry }))
    .filter((entry) => matchesKeywords(entry.data, keywords) || matchesDate(entry.data, targetDateKey, "startAt", "startsAt") || matchedCompanyIds.has(String(entry.data.companyId ?? "")) || matchedCompanyNames.has(String(entry.data.companyName ?? "")))
    .slice(0, 10);
  const relevantActivities = activities
    .map((entry) => ({ id: String(entry.id ?? ""), data: entry }))
    .filter((entry) => matchesKeywords(entry.data, keywords) || matchedCompanyIds.has(String(entry.data.companyId ?? "")) || matchedCompanyNames.has(String(entry.data.companyName ?? "")))
    .slice(0, 12);

  return {
    searchResults: sanitizeSearchItems(searchItems).slice(0, 8),
    companies: matchedCompanies.map((entry) => pickCompany(entry.id, entry.data)),
    leads: matchedLeads.map((entry) => pickLead(entry.id, entry.data)),
    products: matchedProducts.map((entry) => pickProduct(entry.id, entry.data)),
    tasks: relevantTasks.map((entry) => pickTask(entry.id, entry.data)),
    calendarEvents: relevantEvents.map((entry) => pickCalendarEvent(entry.id, entry.data)),
    activities: relevantActivities.map((entry) => pickActivity(entry.id, entry.data))
  };
}

function pickCompany(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    name: textField(data, "name", "companyName"),
    status: textField(data, "status"),
    owner: textField(data, "internalOwnerName", "ownerName", "assigneeName"),
    contactName: textField(data, "primaryContactName", "contactName"),
    products: listField(data, "productNames", "serviceNames"),
    nextAction: textField(data, "nextAction", "nextActionTitle"),
    nextActionAt: dateField(data, "nextActionAt", "nextScheduleAt"),
    lastContactAt: dateField(data, "lastContactAt", "lastActivityAt"),
    memo: textField(data, "notes", "memo", "description"),
    updatedAt: dateField(data, "updatedAt")
  };
}

function pickLead(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    name: textField(data, "name", "companyName"),
    companyName: textField(data, "companyName"),
    contactName: textField(data, "contactName", "personName"),
    status: textField(data, "status"),
    productName: textField(data, "productName"),
    handoffMemo: textField(data, "initialMemo", "notes", "memo"),
    latestActivityMemo: textField(data, "latestActivityMemo"),
    updatedAt: dateField(data, "updatedAt")
  };
}

function pickProduct(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    name: textField(data, "name", "displayName"),
    status: textField(data, "status"),
    category: textField(data, "categoryName", "category"),
    summary: textField(data, "summary", "description"),
    targetIndustries: Array.isArray(data.target?.industries) ? data.target.industries : listField(data, "targetIndustries", "targetIndustryNames"),
    targetRegions: Array.isArray(data.target?.regions) ? data.target.regions : [],
    companySizes: Array.isArray(data.target?.companySizes) ? data.target.companySizes : [],
    roles: Array.isArray(data.target?.roles) ? data.target.roles : [],
    decisionMakerRoles: Array.isArray(data.target?.decisionMakerRoles) ? data.target.decisionMakerRoles : [],
    values: listField(data, "values", "providedValues"),
    problems: listField(data, "problems", "customerProblems")
  };
}

function pickTask(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: textField(data, "title", "name"),
    status: textField(data, "status"),
    priority: textField(data, "priority"),
    dueDate: dateField(data, "dueDate", "deadline"),
    companyName: textField(data, "companyName"),
    assigneeName: textField(data, "assigneeName", "ownerName"),
    description: textField(data, "description", "memo")
  };
}

function pickCalendarEvent(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: textField(data, "title", "name"),
    type: textField(data, "eventType"),
    meetingMethod: textField(data, "meetingMethod"),
    startAt: dateField(data, "startAt", "startsAt"),
    endAt: dateField(data, "endAt", "endsAt"),
    companyName: textField(data, "companyName", "relatedName"),
    contactName: textField(data, "contactName"),
    attendees: listField(data, "attendeeNames"),
    productName: textField(data, "productName"),
    description: textField(data, "description", "memo")
  };
}

function pickActivity(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: textField(data, "title", "name"),
    type: textField(data, "activityType", "type", "kind"),
    leadStatus: textField(data, "leadStatus"),
    occurredAt: dateField(data, "occurredAt", "createdAt"),
    companyName: textField(data, "companyName"),
    productName: textField(data, "productName"),
    content: textField(data, "content", "memo", "description"),
    createdByName: textField(data, "createdByName", "ownerName")
  };
}

function sanitizeSearchItems(items: unknown[]) {
  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      type: textField(item, "type"),
      id: textField(item, "id"),
      name: textField(item, "name", "title", "companyName"),
      status: textField(item, "status"),
      companyName: textField(item, "companyName"),
      dueDate: dateField(item, "dueDate"),
      updatedAt: dateField(item, "updatedAt")
    }));
}

function extractKeywords(rawMessage: string) {
  const cleaned = rawMessage.replace(/[「」『』（）()[\]、。,.!?！？]/g, " ");
  const words = cleaned
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 2)
    .filter((word) => !["この会社", "どうなってる", "教えて", "確認", "状況", "予定", "タスク", "会社", "商材", "商品"].includes(word));
  return words.length ? words.slice(0, 8) : [cleaned.trim().toLowerCase()].filter(Boolean);
}

function matchesKeywords(data: FirebaseFirestore.DocumentData, keywords: string[]) {
  if (!keywords.length) return false;
  const haystack = [
    data.name,
    data.companyName,
    data.title,
    data.displayName,
    data.primaryContactName,
    data.contactName,
    data.productName,
    data.status,
    data.notes,
    data.memo,
    data.description,
    data.content
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return keywords.some((keyword) => haystack.includes(keyword));
}

function extractTargetDateKey(rawMessage: string) {
  const base = new Date();
  if (/明後日/.test(rawMessage)) base.setDate(base.getDate() + 2);
  else if (/明日/.test(rawMessage)) base.setDate(base.getDate() + 1);
  else if (!/今日|本日/.test(rawMessage)) {
    const monthDay = rawMessage.match(/(\d{1,2})月(\d{1,2})日/);
    if (!monthDay) return null;
    base.setMonth(Number(monthDay[1]) - 1);
    base.setDate(Number(monthDay[2]));
  }
  return base.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function matchesDate(data: FirebaseFirestore.DocumentData, targetDateKey: string | null, ...keys: string[]) {
  if (!targetDateKey) return false;
  return keys.some((key) => {
    const date = toDate(data[key]);
    if (!date) return false;
    return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === targetDateKey;
  });
}

function parseOpenAiJson(text: string): ChatCompletionResponse {
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new DesktopApiError("AI_ERROR", "AI回答サーバーから正しいJSONが返りませんでした。時間をおいて再送してください。", 502);
  }
}

function toBusinessAuth(auth: DesktopAuth): BusinessAuth {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop",
    deviceId: auth.device.id
  };
}

function textField(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string") return trimText(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

function listField(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (!Array.isArray(value)) continue;
    return value.map((item) => trimText(String(item))).filter(Boolean).slice(0, 12);
  }
  return [];
}

function dateField(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    const date = toDate(value);
    if (date) return date.toISOString();
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toDate(value: unknown) {
  if (!value || typeof value !== "object") return null;
  if ("toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function trimText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}
