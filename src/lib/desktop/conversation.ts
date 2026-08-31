import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { DesktopApiError, requireString } from "@/lib/desktop/api";
import { commitCalendarDraft, handleDesktopCommand, type CalendarDraft, type CommandKind, type DesktopCommandResult } from "@/lib/desktop/command";
import { searchCompanies, toDesktopCompanyPayload } from "@/lib/server/business/company-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { getUserDisplayNameById } from "@/lib/user-display";

type DesktopAuth = {
  db: FirebaseFirestore.Firestore;
  userId: string;
  device: { id: string };
};

type ConversationStatus = "pending_input" | "pending_candidate" | "pending_confirmation" | "completed" | "failed" | "expired" | "cancelled";
type StoredConversationStatus = ConversationStatus | "pending" | "confirming";
type DesktopConversationResponse = DesktopCommandResult & {
  conversationId?: string | null;
  conversationStatus?: ConversationStatus;
  missingFields?: string[];
  candidateEntities?: unknown[];
  confirmationRequired?: boolean;
  confirmationPayload?: Record<string, unknown> | null;
  executedAction?: string | null;
  refreshRequired?: boolean;
  error?: Record<string, unknown> | null;
};

type DesktopConversation = {
  id: string;
  conversationId: string;
  userId: string;
  desktopDeviceId: string;
  intent: CommandKind;
  action: string;
  entityType: string;
  targetEntityId: string | null;
  collectedFields: Record<string, unknown>;
  missingFields: string[];
  candidateEntities: Array<Record<string, unknown>>;
  selectedEntity: Record<string, unknown> | null;
  confirmationRequired: boolean;
  confirmationPayload: Record<string, unknown> | null;
  lastUserMessage: string;
  lastAssistantMessage: string;
  status: StoredConversationStatus;
  expiresAt: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const COLLECTION = "desktopConversations";
const TTL_MS = 30 * 60 * 1000;

export async function handleDesktopConversation(auth: DesktopAuth, body: Record<string, unknown>): Promise<DesktopConversationResponse> {
  const rawMessage = requireString(body.message ?? body.rawMessage ?? body.text ?? body.input ?? body.query, "質問", 2000);
  const requestedConversationId = stringValue(body.conversationId);
  const active = requestedConversationId ? await getConversationById(auth, requestedConversationId) : await getActiveConversation(auth);
  if (active) {
    const resumed = await resumeConversation(auth, active, rawMessage, body);
    if (resumed) return resumed;
  }

  const result = await handleDesktopCommand(auth, { ...body, rawMessage });
  if (result.kind === "calendar" && isMutationMessage(rawMessage)) {
    let draft = result.draft as CalendarDraft | null;
    if (draft && !hasExplicitTime(rawMessage)) {
      const resolved = await resolveCalendarCompany(auth, draft);
      draft = resolved.draft;
      const candidates = resolved.candidates;
      if (candidates.length > 1) {
        return saveAndReturn(auth, {
          result: withMessage({ ...result, items: candidates, draft }, "どの会社との予定ですか？番号で選んでください。"),
          rawMessage,
          action: "create_calendar",
          missingFields: ["companyId", "startAtTime"],
          candidateEntities: candidates,
          collectedFields: { draft },
          status: "pending_candidate"
        });
      }
      return saveAndReturn(auth, {
        result: withMessage(result, "何時にしますか？"),
        rawMessage,
        action: "create_calendar",
        missingFields: ["startAtTime"],
        collectedFields: { draft },
        status: "pending_input"
      });
    }
    if (draft) {
      const resolved = await resolveCalendarCompany(auth, draft);
      draft = resolved.draft;
      const candidates = resolved.candidates;
      if (candidates.length > 1) {
        return saveAndReturn(auth, {
          result: withMessage({ ...result, items: candidates, draft }, "どの会社との予定ですか？番号で選んでください。"),
          rawMessage,
          action: "create_calendar",
          missingFields: ["companyId"],
          candidateEntities: candidates,
          collectedFields: { draft },
          status: "pending_candidate"
        });
      }
      return saveAndReturn(auth, {
        result: withMessage(result, calendarConfirmationMessage(draft)),
        rawMessage,
        action: "create_calendar",
        confirmationRequired: true,
        confirmationPayload: { draft },
        collectedFields: { draft },
        status: "pending_confirmation"
      });
    }
  }

  const pending = pendingStateFromResult(result);
  if (pending) {
    return saveAndReturn(auth, { result, rawMessage, ...pending });
  }
  await completeActiveConversations(auth);
  return result;
}

async function resumeConversation(auth: DesktopAuth, conversation: DesktopConversation, rawMessage: string, body: Record<string, unknown>) {
  const confirmation = readConfirmation(body.confirmation, rawMessage);
  if (confirmation === "cancel" || isCancel(rawMessage)) {
    const cancelled = { ...conversation, confirmationRequired: false, confirmationPayload: null, missingFields: [], candidateEntities: [] };
    await updateConversation(auth, conversation.id, { status: "cancelled", confirmationRequired: false, confirmationPayload: null, missingFields: [], candidateEntities: [], lastUserMessage: rawMessage, lastAssistantMessage: "操作をキャンセルしました。" });
    return envelope(cancelled, { handled: true, kind: conversation.intent, message: "操作をキャンセルしました。", items: [], draft: null }, "cancelled");
  }

  if (conversation.confirmationRequired && confirmation === "confirm") {
    return executeConfirmed(auth, conversation, rawMessage, body);
  }
  if (conversation.confirmationRequired && confirmation === "reject") {
    const cancelled = { ...conversation, confirmationRequired: false, confirmationPayload: null, missingFields: [], candidateEntities: [] };
    await updateConversation(auth, conversation.id, { status: "cancelled", confirmationRequired: false, confirmationPayload: null, missingFields: [], candidateEntities: [], lastUserMessage: rawMessage, lastAssistantMessage: "実行せずにキャンセルしました。" });
    return envelope(cancelled, { handled: true, kind: conversation.intent, message: "実行せずにキャンセルしました。", items: [], draft: null }, "cancelled");
  }
  if (confirmation === "confirm" && !conversation.confirmationRequired) {
    throw new DesktopApiError("CONFIRMATION_REQUIRED", "確認待ちの操作がありません。", 409, { retryable: false });
  }

  const selected = resolveCandidate(conversation.candidateEntities, body, rawMessage);
  if (selected) {
    if (conversation.action === "create_calendar") {
      const draft = {
        ...(valueObject(conversation.collectedFields.draft) ?? {}),
        companyId: stringValue(selected.id) ?? "",
        companyName: stringValue(selected.name ?? selected.companyName) ?? ""
      } as CalendarDraft;
      const remainingMissing = conversation.missingFields.filter((field) => field !== "companyId");
      if (remainingMissing.includes("startAtTime")) {
        return saveAndReturn(auth, {
          result: { handled: true, kind: "calendar", message: "何時にしますか？", items: [], draft },
          rawMessage,
          existingId: conversation.id,
          action: "create_calendar",
          missingFields: remainingMissing,
          collectedFields: { draft },
          selectedEntity: selected,
          status: "pending_input"
        });
      }
      return saveAndReturn(auth, {
        result: { handled: true, kind: "calendar", message: calendarConfirmationMessage(draft), items: [], draft },
        rawMessage,
        existingId: conversation.id,
        action: "create_calendar",
        confirmationRequired: true,
        confirmationPayload: { draft },
        collectedFields: { draft },
        selectedEntity: selected,
        status: "pending_confirmation"
      });
    }
    const nextBody = {
      ...conversation.collectedFields,
      ...body,
      rawMessage: conversation.lastUserMessage,
      ...selectedEntityFields(conversation, selected)
    };
    const result = await handleDesktopCommand(auth, nextBody);
    const pending = pendingStateFromResult(result);
    if (pending) return saveAndReturn(auth, { result, rawMessage, existingId: conversation.id, ...pending });
    await updateConversation(auth, conversation.id, { status: "completed", selectedEntity: selected, lastUserMessage: rawMessage, lastAssistantMessage: result.message });
    return envelope(conversation, result, "completed");
  }
  if (hasStructuredCandidateSelection(body)) {
    throw new DesktopApiError("CANDIDATE_INVALID", "選択された候補が見つかりません。もう一度候補を選んでください。", 400, {
      retryable: false,
      field: body.selectedCandidateId ? "selectedCandidateId" : "selectedCandidateIndex",
      details: { conversationId: conversation.conversationId }
    });
  }

  if (conversation.missingFields.length) {
    const merged = mergeMissingFieldInput(conversation, rawMessage);
    if (merged) {
      if (conversation.action === "create_calendar") {
        const draft = merged.draft as CalendarDraft;
        return saveAndReturn(auth, {
          result: { handled: true, kind: "calendar", message: calendarConfirmationMessage(draft), items: [], draft },
          rawMessage,
          existingId: conversation.id,
          action: "create_calendar",
          confirmationRequired: true,
          confirmationPayload: { draft },
          collectedFields: { draft },
          missingFields: [],
          status: "pending_confirmation"
        });
      }
      const result = await handleDesktopCommand(auth, { ...conversation.collectedFields, ...merged, rawMessage: conversation.lastUserMessage });
      const pending = pendingStateFromResult(result);
      if (pending) return saveAndReturn(auth, { result, rawMessage, existingId: conversation.id, ...pending });
      await updateConversation(auth, conversation.id, { status: "completed", lastUserMessage: rawMessage, lastAssistantMessage: result.message });
      return envelope(conversation, result, "completed");
    }
    const message = missingFieldPrompt(conversation.missingFields);
    await updateConversation(auth, conversation.id, { lastUserMessage: rawMessage, lastAssistantMessage: message });
    return envelope(conversation, { handled: true, kind: conversation.intent, message, items: conversation.candidateEntities, draft: conversation.collectedFields }, conversation.status);
  }

  const reminder = conversation.confirmationRequired ? "実行する場合は「はい」、やめる場合は「キャンセル」と送ってください。" : "続ける内容をもう少し具体的に入力してください。";
  await updateConversation(auth, conversation.id, { lastUserMessage: rawMessage, lastAssistantMessage: reminder });
  return envelope(conversation, { handled: true, kind: conversation.intent, message: reminder, items: conversation.candidateEntities, draft: conversation.collectedFields }, conversation.status);
}

async function executeConfirmed(auth: DesktopAuth, conversation: DesktopConversation, rawMessage: string, body: Record<string, unknown>) {
  try {
    if (conversation.action === "create_calendar") {
      const draft = valueObject(conversation.confirmationPayload?.draft) ?? valueObject(conversation.collectedFields.draft);
      const committed = await commitCalendarDraft(auth, { draft });
      const result: DesktopCommandResult = {
        handled: true,
        kind: "calendar",
        message: committed.message,
        items: [{ type: "calendar", id: committed.eventId, title: typeof draft?.title === "string" ? draft.title : "", targetURL: committed.targetURL }],
        draft: null,
        executedAction: committed.executedAction,
        refreshRequired: committed.refreshRequired
      };
      await updateConversation(auth, conversation.id, { status: "completed", lastUserMessage: rawMessage, lastAssistantMessage: result.message, confirmationRequired: false });
      return envelope(conversation, result, "completed");
    }

    const result = await handleDesktopCommand(auth, { ...conversation.collectedFields, ...body, ...confirmationActionFields(conversation), rawMessage: conversation.lastUserMessage, confirmed: true });
    await updateConversation(auth, conversation.id, { status: "completed", lastUserMessage: rawMessage, lastAssistantMessage: result.message, confirmationRequired: false });
    return envelope(conversation, result, "completed");
  } catch (error) {
    const message = error instanceof DesktopApiError
      ? `実行に失敗しました。もう一度「はい」で再試行できます。${error.message}`
      : "実行に失敗しました。もう一度「はい」で再試行できます。";
    await updateConversation(auth, conversation.id, { lastUserMessage: rawMessage, lastAssistantMessage: message });
    return envelope(conversation, { handled: true, kind: conversation.intent, message, items: conversation.candidateEntities, draft: conversation.collectedFields }, conversation.status);
  }
}

function pendingStateFromResult(result: DesktopCommandResult) {
  const draft = valueObject(result.draft);
  if (!draft) return null;
  const missingFields = arrayOfStrings(draft.missingFields);
  const candidateEntities = candidateEntitiesFromResult(result, draft);
  const confirmationRequired = draft.confirmationRequired === true || isDestructiveAction(String(draft.action ?? ""));
  if (!missingFields.length && !candidateEntities.length && !confirmationRequired) return null;
  return {
    action: String(draft.action ?? inferAction(result.kind)),
    entityType: String(draft.entityType ?? result.kind),
    targetEntityId: stringValue(draft.targetEntityId ?? draft.companyId ?? draft.leadId ?? draft.productId ?? draft.taskId ?? draft.activityId),
    missingFields,
    candidateEntities,
    confirmationRequired,
    confirmationPayload: valueObject(draft.confirmationPayload) ?? draft,
    collectedFields: draft,
    status: confirmationRequired ? "pending_confirmation" as ConversationStatus : candidateEntities.length ? "pending_candidate" as ConversationStatus : "pending_input" as ConversationStatus
  };
}

async function saveAndReturn(auth: DesktopAuth, input: {
  result: DesktopCommandResult;
  rawMessage: string;
  existingId?: string;
  action: string;
  entityType?: string;
  targetEntityId?: string | null;
  collectedFields?: Record<string, unknown>;
  missingFields?: string[];
  candidateEntities?: Array<Record<string, unknown>>;
  selectedEntity?: Record<string, unknown> | null;
  confirmationRequired?: boolean;
  confirmationPayload?: Record<string, unknown> | null;
  status?: StoredConversationStatus;
}) {
  const ref = input.existingId ? auth.db.collection(COLLECTION).doc(input.existingId) : auth.db.collection(COLLECTION).doc();
  const conversation: Omit<DesktopConversation, "createdAt" | "updatedAt"> = {
    id: ref.id,
    conversationId: ref.id,
    userId: auth.userId,
    desktopDeviceId: auth.device.id,
    intent: input.result.kind,
    action: input.action,
    entityType: input.entityType ?? input.result.kind,
    targetEntityId: input.targetEntityId ?? null,
    collectedFields: input.collectedFields ?? valueObject(input.result.draft) ?? {},
    missingFields: input.missingFields ?? [],
    candidateEntities: input.candidateEntities ?? [],
    selectedEntity: input.selectedEntity ?? null,
    confirmationRequired: input.confirmationRequired === true,
    confirmationPayload: input.confirmationPayload ?? null,
    lastUserMessage: input.rawMessage,
    lastAssistantMessage: input.result.message,
    status: input.status ?? "pending_input",
    expiresAt: Timestamp.fromMillis(Date.now() + TTL_MS)
  };
  await ref.set({ ...conversation, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return envelope({ ...conversation, id: ref.id }, input.result, conversation.status);
}

async function getActiveConversation(auth: DesktopAuth): Promise<DesktopConversation | null> {
  const snapshot = await auth.db.collection(COLLECTION)
    .where("userId", "==", auth.userId)
    .where("desktopDeviceId", "==", auth.device.id)
    .where("status", "in", activeConversationStatuses())
    .limit(10)
    .get();
  const now = Date.now();
  const docs = snapshot.docs
    .map((doc) => ({ doc, data: normalizeConversation(doc.id, doc.data()) }))
    .sort((a, b) => (b.data.updatedAt?.toMillis() ?? 0) - (a.data.updatedAt?.toMillis() ?? 0));
  for (const { doc, data } of docs) {
    if (data.expiresAt.toMillis() > now) return data;
    await doc.ref.set({ status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return null;
}

async function getConversationById(auth: DesktopAuth, conversationId: string): Promise<DesktopConversation | null> {
  const snapshot = await auth.db.collection(COLLECTION).doc(conversationId).get();
  if (!snapshot.exists) {
    throw new DesktopApiError("NOT_FOUND", "会話状態が見つかりません。もう一度最初から指示してください。", 404, {
      retryable: false,
      field: "conversationId"
    });
  }
  const conversation = normalizeConversation(snapshot.id, snapshot.data() ?? {});
  if (conversation.userId !== auth.userId || conversation.desktopDeviceId !== auth.device.id) {
    throw new DesktopApiError("FORBIDDEN", "この会話状態にはアクセスできません。", 403, {
      retryable: false,
      field: "conversationId"
    });
  }
  if (conversation.expiresAt.toMillis() <= Date.now()) {
    await snapshot.ref.set({ status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new DesktopApiError("CONVERSATION_EXPIRED", "前回の操作は期限切れです。もう一度最初から指示してください。", 410, {
      retryable: false,
      field: "conversationId",
      details: { conversationId }
    });
  }
  if (!isActiveConversationStatus(conversation.status)) {
    throw new DesktopApiError("VALIDATION_ERROR", "この会話はすでに完了またはキャンセルされています。もう一度最初から指示してください。", 409, {
      retryable: false,
      field: "conversationId",
      details: { conversationId, status: normalizeResponseStatus(conversation.status) }
    });
  }
  return conversation;
}

async function completeActiveConversations(auth: DesktopAuth) {
  const snapshot = await auth.db.collection(COLLECTION)
    .where("userId", "==", auth.userId)
    .where("desktopDeviceId", "==", auth.device.id)
    .where("status", "in", activeConversationStatuses())
    .limit(10)
    .get();
  const batch = auth.db.batch();
  snapshot.docs.forEach((doc) => batch.set(doc.ref, { status: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  if (!snapshot.empty) await batch.commit();
}

async function updateConversation(auth: DesktopAuth, id: string, patch: Partial<DesktopConversation>) {
  await auth.db.collection(COLLECTION).doc(id).set({ ...patch, updatedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + TTL_MS) }, { merge: true });
}

function normalizeConversation(id: string, data: DocumentData): DesktopConversation {
  return {
    id,
    conversationId: String(data.conversationId ?? id),
    userId: String(data.userId ?? ""),
    desktopDeviceId: String(data.desktopDeviceId ?? ""),
    intent: isCommandKind(data.intent) ? data.intent : "business_query",
    action: String(data.action ?? ""),
    entityType: String(data.entityType ?? ""),
    targetEntityId: typeof data.targetEntityId === "string" ? data.targetEntityId : null,
    collectedFields: valueObject(data.collectedFields) ?? {},
    missingFields: arrayOfStrings(data.missingFields),
    candidateEntities: Array.isArray(data.candidateEntities) ? data.candidateEntities.filter(valueObject) : [],
    selectedEntity: valueObject(data.selectedEntity),
    confirmationRequired: data.confirmationRequired === true,
    confirmationPayload: valueObject(data.confirmationPayload),
    lastUserMessage: String(data.lastUserMessage ?? ""),
    lastAssistantMessage: String(data.lastAssistantMessage ?? ""),
    status: isStoredConversationStatus(data.status) ? data.status : "pending_input",
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt : Timestamp.fromMillis(0),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : undefined
  };
}

function envelope(conversation: Pick<DesktopConversation, "conversationId" | "missingFields" | "candidateEntities" | "confirmationRequired" | "confirmationPayload"> & { id?: string }, result: DesktopCommandResult, status: StoredConversationStatus) {
  return {
    ...result,
    answer: result.message,
    conversationId: conversation.conversationId,
    conversationStatus: normalizeResponseStatus(status),
    missingFields: conversation.missingFields,
    candidateEntities: conversation.candidateEntities,
    confirmationRequired: conversation.confirmationRequired,
    confirmationPayload: conversation.confirmationRequired ? conversation.confirmationPayload ?? valueObject(result.draft) : null,
    executedAction: result.executedAction ?? null,
    refreshRequired: result.refreshRequired ?? false,
    error: result.error ?? null
  };
}

function candidateEntitiesFromResult(result: DesktopCommandResult, draft: Record<string, unknown>) {
  const fromDraft = Array.isArray(draft.candidateEntities) ? draft.candidateEntities.filter(valueObject) : [];
  if (fromDraft.length) return fromDraft;
  if (Array.isArray(result.items) && result.items.length > 1) return result.items.filter(valueObject) as Array<Record<string, unknown>>;
  return [];
}

function selectedEntityFields(conversation: DesktopConversation, selected: Record<string, unknown>) {
  const id = stringValue(selected.id);
  const name = stringValue(selected.name ?? selected.title ?? selected.companyName);
  if (conversation.intent === "company") return { companyId: id, companyName: name, action: actionForCommand(conversation.action) };
  if (conversation.intent === "lead") return { leadId: id, companyName: stringValue(selected.companyName ?? name), action: actionForCommand(conversation.action) };
  if (conversation.intent === "product") return { productId: id, productName: name, action: actionForCommand(conversation.action) };
  if (conversation.intent === "task") return { taskId: id, title: name, action: actionForCommand(conversation.action) };
  if (conversation.intent === "activity") return { activityId: id, title: name, action: actionForCommand(conversation.action) };
  return { id, action: actionForCommand(conversation.action) };
}

function confirmationActionFields(conversation: DesktopConversation) {
  const fields: Record<string, unknown> = { action: actionForCommand(conversation.action) };
  const source = { ...conversation.collectedFields, ...conversation.confirmationPayload };
  for (const key of ["companyId", "leadId", "productId", "taskId", "activityId", "id"]) {
    if (source[key]) fields[key] = source[key];
  }
  return fields;
}

function actionForCommand(action: string) {
  if (action.includes("delete")) return "delete";
  if (action.includes("status")) return "status";
  if (action.includes("website")) return "website";
  if (action.includes("link")) return "linkCompany";
  if (action.includes("complete")) return "complete";
  if (action.includes("reopen")) return "reopen";
  if (action.includes("due")) return "dueDate";
  if (action.includes("priority")) return "priority";
  if (action.includes("update")) return "update";
  return action || undefined;
}

function mergeMissingFieldInput(conversation: DesktopConversation, rawMessage: string) {
  const fields: Record<string, unknown> = {};
  if (conversation.missingFields.includes("startAtTime")) {
    const draft = valueObject(conversation.collectedFields.draft);
    const startAt = typeof draft?.startAt === "string" ? mergeTimeIntoIso(draft.startAt, rawMessage) : null;
    if (!draft || !startAt) return null;
    const durationMinutes = typeof draft.durationMinutes === "number" ? draft.durationMinutes : 60;
    fields.draft = { ...draft, startAt, endAt: new Date(new Date(startAt).getTime() + durationMinutes * 60 * 1000).toISOString(), durationMinutes };
  }
  if (conversation.missingFields.includes("dueDate")) {
    const dueDate = parseDateFromText(rawMessage);
    if (dueDate) fields.dueDate = dueDate.toISOString();
  }
  if (conversation.missingFields.includes("websiteUrl")) {
    const url = rawMessage.match(/https?:\/\/[^\s　]+/)?.[0];
    if (url) fields.websiteUrl = url;
  }
  if (conversation.missingFields.includes("patch")) {
    fields.summary = rawMessage;
  }
  return Object.keys(fields).length ? fields : null;
}

function mergeTimeIntoIso(iso: string, rawMessage: string) {
  const time = rawMessage.match(/(\d{1,2})[:時](\d{2})?/);
  if (!time) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const tokyoDate = tokyoDatePartsFromDate(date);
  return fromTokyoWallClock(tokyoDate.year, tokyoDate.month, tokyoDate.day, Number(time[1]), time[2] ? Number(time[2]) : 0).toISOString();
}

function parseDateFromText(rawMessage: string): Date | null {
  const time = rawMessage.match(/(\d{1,2})[:時](\d{2})?/);
  const hour = time?.[1] ? Number(time[1]) : 10;
  const minute = time?.[2] ? Number(time[2]) : 0;
  const base = tokyoDateParts();
  if (/明後日/.test(rawMessage)) base.day += 2;
  else if (/明日/.test(rawMessage)) base.day += 1;
  const md = rawMessage.match(/(\d{1,2})月(\d{1,2})日/);
  if (md) {
    base.month = Number(md[1]);
    base.day = Number(md[2]);
  }
  if (!time && !/(今日|明日|明後日|\d{1,2}月\d{1,2}日)/.test(rawMessage)) return null;
  return fromTokyoWallClock(base.year, base.month, base.day, hour, minute);
}

function calendarConfirmationMessage(draft: CalendarDraft) {
  const startsAt = new Date(draft.startAt);
  const dateLabel = Number.isNaN(startsAt.getTime()) ? "" : startsAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const method = draft.meetingMethod === "online" ? "オンライン" : draft.meetingMethod === "visit" ? "訪問" : draft.meetingMethod === "phone" ? "電話" : draft.meetingMethod === "in_person" ? "対面" : "その他";
  return `${dateLabel}から60分、${method}で登録しますか？`;
}

async function resolveCalendarCompany(auth: DesktopAuth, draft: CalendarDraft) {
  if (!draft.companyName || draft.companyId) return { draft, candidates: [] };
  const companies = await searchCompanies(toBusinessAuth(auth), draft.companyName, { limit: 5 });
  if (companies.length === 1) {
    const company = companies[0];
    return {
      draft: { ...draft, companyId: String(company.id ?? ""), companyName: String(company.name ?? draft.companyName) },
      candidates: []
    };
  }
  return {
    draft,
    candidates: companies.length > 1 ? companies.map((company) => ({ type: "company", ...toDesktopCompanyPayload(company) })) : []
  };
}

function missingFieldPrompt(fields: string[]) {
  if (fields.includes("startAtTime")) return "何時にしますか？";
  if (fields.includes("dueDate")) return "期限はいつにしますか？";
  if (fields.includes("websiteUrl")) return "設定するURLを送ってください。";
  if (fields.includes("companyId")) return "対象の会社を選んでください。";
  return "不足している情報を入力してください。";
}

function hasExplicitTime(rawMessage: string) {
  return /\d{1,2}[:時](\d{2})?/.test(rawMessage);
}

function isMutationMessage(rawMessage: string) {
  return /(登録|追加|作成|保存|入れて|予定して|設定して|変更|更新|削除|消して|完了|戻して)/.test(rawMessage);
}

function isDestructiveAction(action: string) {
  return /delete|削除/.test(action);
}

function readConfirmation(value: unknown, rawMessage: string): "confirm" | "cancel" | "reject" | null {
  if (value === "confirm") return "confirm";
  if (value === "cancel") return "cancel";
  if (value === "reject") return "reject";
  if (isAffirmative(rawMessage)) return "confirm";
  if (isNegative(rawMessage)) return "reject";
  return null;
}

function isAffirmative(rawMessage: string) {
  return /^(はい|うん|お願いします|お願い|実行|実行して|登録して|保存して|削除して|OK|ok|yes|y)$/i.test(rawMessage.trim());
}

function isNegative(rawMessage: string) {
  return /^(いいえ|いや|やめて|キャンセル|中止|no|n)$/i.test(rawMessage.trim());
}

function isCancel(rawMessage: string) {
  return /^(キャンセル|中止|やめて|取り消し)$/i.test(rawMessage.trim());
}

function resolveCandidate(candidates: Array<Record<string, unknown>>, body: Record<string, unknown>, rawMessage: string) {
  if (!candidates.length) return null;
  const selectedId = stringValue(body.selectedCandidateId);
  if (selectedId) return candidates.find((candidate) => stringValue(candidate.id) === selectedId) ?? null;
  const selectedIndex = numberValue(body.selectedCandidateIndex);
  if (selectedIndex) return candidates[selectedIndex - 1] ?? null;
  const trimmed = rawMessage.trim();
  if (/^(それ|上|上の方|最初|一番上)$/.test(trimmed)) return candidates[0];
  const numeric = trimmed.match(/^(\d+)$/);
  if (numeric) return candidates[Number(numeric[1]) - 1] ?? null;
  const normalized = normalizeText(trimmed);
  return candidates.find((candidate) => [candidate.name, candidate.title, candidate.companyName].some((value) => typeof value === "string" && normalizeText(value).includes(normalized))) ?? null;
}

function hasStructuredCandidateSelection(body: Record<string, unknown>) {
  return Boolean(stringValue(body.selectedCandidateId) || numberValue(body.selectedCandidateIndex));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/株式会社|有限会社|合同会社|社$/g, "");
}

function tokyoDateParts() {
  return tokyoDatePartsFromDate(new Date());
}

function tokyoDatePartsFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month"), day: value("day") };
}

function fromTokyoWallClock(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
}

function withMessage(result: DesktopCommandResult, message: string): DesktopCommandResult {
  return { ...result, message };
}

function valueObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function inferAction(kind: CommandKind) {
  return kind === "business_query" ? "search" : kind;
}

function isCommandKind(value: unknown): value is CommandKind {
  return value === "calendar" || value === "task" || value === "company" || value === "lead" || value === "activity" || value === "product" || value === "notification" || value === "business_query";
}

function isConversationStatus(value: unknown): value is ConversationStatus {
  return value === "pending_input" || value === "pending_candidate" || value === "pending_confirmation" || value === "completed" || value === "failed" || value === "expired" || value === "cancelled";
}

function isStoredConversationStatus(value: unknown): value is StoredConversationStatus {
  return isConversationStatus(value) || value === "pending" || value === "confirming";
}

function normalizeResponseStatus(status: StoredConversationStatus): ConversationStatus {
  if (status === "pending") return "pending_input";
  if (status === "confirming") return "pending_confirmation";
  return status;
}

function isActiveConversationStatus(status: StoredConversationStatus) {
  return status === "pending" || status === "confirming" || status === "pending_input" || status === "pending_candidate" || status === "pending_confirmation";
}

function activeConversationStatuses() {
  return ["pending", "confirming", "pending_input", "pending_candidate", "pending_confirmation"];
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
