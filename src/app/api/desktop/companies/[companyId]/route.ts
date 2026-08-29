import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireDesktopCompanyAccess } from "@/lib/desktop/auth";
import { getUserDisplayNameById } from "@/lib/user-display";

const openStatuses = new Set(["todo", "open", "pending", "in_progress", "waiting"]);

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await params;
    const { db, company } = await requireDesktopCompanyAccess(request, companyId);
    const data = company.data() ?? {};
    const [activities, legacyActivities, tasks, events, services] = await Promise.all([
      db.collection("activities").where("companyId", "==", companyId).orderBy("occurredAt", "desc").limit(5).get(),
      db.collection("companies").doc(companyId).collection("activityLogs").orderBy("occurredAt", "desc").limit(5).get(),
      db.collection("tasks").where("companyId", "==", companyId).limit(100).get(),
      db.collection("calendarEvents").orderBy("startAt", "asc").limit(300).get(),
      db.collection("companyServices").where("companyId", "==", companyId).limit(20).get(),
    ]);
    const canonicalIds = new Set(activities.docs.map((entry) => entry.id));
    const logs = [...activities.docs, ...legacyActivities.docs.filter((entry) => !canonicalIds.has(entry.id))]
      .map((entry): DocumentData & { id: string } => ({ id: entry.id, ...entry.data() }))
      .sort((a, b) => dateMillis(b.occurredAt) - dateMillis(a.occurredAt))
      .slice(0, 5)
      .map((entry) => ({ id: entry.id, title: String(entry.title || "活動ログ"), detail: String(entry.content || ""), at: isoDate(entry.occurredAt) }));
    const openTasks = tasks.docs.map((entry): DocumentData & { id: string } => ({ id: entry.id, ...entry.data() }))
      .filter((entry) => openStatuses.has(String(entry.status ?? "")))
      .sort((a, b) => dateMillis(a.dueDate) - dateMillis(b.dueDate))
      .slice(0, 5)
      .map((entry) => ({ id: entry.id, title: String(entry.title || "タスク"), dueAt: isoDate(entry.dueDate) }));
    const now = Date.now();
    const nextEvent = events.docs.map((entry): DocumentData & { id: string } => ({ id: entry.id, ...entry.data() }))
      .find((entry) => entry.companyId === companyId && dateMillis(entry.startAt) >= now);
    const productNames = new Set<string>(Array.isArray(data.productNames) ? data.productNames.filter((value): value is string => typeof value === "string" && value.length > 0) : []);
    services.docs.forEach((entry) => { const value = entry.data(); if (value.serviceName) productNames.add(String(value.serviceName)); });
    return ok({
      id: company.id,
      name: String(data.name || "会社名未設定"),
      subtitle: [data.industry, data.prefecture || data.city].filter(Boolean).join(" / "),
      status: String(data.status || ""),
      ownerName: String(data.internalOwnerName || ""),
      products: Array.from(productNames),
      logs,
      tasks: openTasks,
      nextEvent: nextEvent ? { id: nextEvent.id, title: String(nextEvent.title || "予定"), startAt: isoDate(nextEvent.startAt), productName: String(nextEvent.productName || "") } : null,
      targetURL: `/sales/companies?id=${encodeURIComponent(company.id)}`,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await params;
    const { db, company, user } = await requireDesktopCompanyAccess(request, companyId);
    const body = await request.json() as { kind?: unknown; title?: unknown; content?: unknown; dueAt?: unknown };
    const kind = body.kind === "log" ? "log" : body.kind === "task" ? "task" : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 5000) : "";
    if (!kind || !title) throw new Error("入力内容を確認してください。");
    const companyName = String(company.data()?.name || "");
    const userName = getUserDisplayNameById(user.uid, user.name || user.email || null);
    if (kind === "log") {
      const occurredAt = Timestamp.now();
      const ref = await db.collection("activities").add({ leadId: null, companyId, dealId: null, type: "note", title, content, productId: null, productName: null, audioId: null, transcriptId: null, analysisId: null, legacyCompanyActivityLogId: null, nextActionAt: null, nextActionTitle: null, occurredAt, createdBy: user.uid, createdByName: userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await company.ref.set({ lastContactAt: occurredAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return ok({ id: ref.id, message: `${companyName}のログを追加しました。` }, 201);
    }
    const dueDate = typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
    if (dueDate && !Number.isFinite(dueDate.getTime())) throw new Error("期限を確認してください。");
    const ref = await db.collection("tasks").add({ title, description: content, status: "todo", priority: "medium", source: "manual", aiGenerated: false, aiReason: "", sourceType: null, sourceId: null, assigneeId: user.uid, assigneeName: userName, collaboratorIds: [], collaboratorNames: [], createdBy: user.uid, createdByName: userName, companyId, companyName, leadId: null, leadName: null, productId: null, productName: null, projectId: null, projectName: null, meetingId: null, meetingTitle: null, dueDate: dueDate ? Timestamp.fromDate(dueDate) : null, completedAt: null, checklist: [], comments: "", progressLogs: [{ id: `log-${crypto.randomUUID()}`, type: "created", title: "タスクを作成しました", content: "", userId: user.uid, userName, createdAt: Timestamp.now() }], sortOrder: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return ok({ id: ref.id, message: `${companyName}のタスクを追加しました。` }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await params; const { db, company } = await requireDesktopCompanyAccess(request, companyId);
    const body = await request.json() as Record<string, unknown>; const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : ""; const force = body.force === true;
    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(company.ref); const data = latest.data() ?? {}; const currentUpdatedAt = isoDate(data.updatedAt) ?? "";
      if (!force && expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) throw new CompanyConflictError();
      const contactName = typeof body.contactName === "string" ? body.contactName.trim().slice(0, 120) : String(data.primaryContactName || ""); const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 50) : String(data.phone || ""); const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : String(data.email || "");
      const nextActionTitle = typeof body.nextAction === "string" && body.nextAction.trim() ? body.nextAction.trim().slice(0, 200) : null; const productNames = Array.isArray(body.products) ? body.products.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 30) : (Array.isArray(data.productNames) ? data.productNames : []);
      const contacts = Array.isArray(data.contacts) ? [...data.contacts] : []; const primaryIndex = contacts.findIndex((entry) => entry?.id === data.primaryContactId); const primary = { ...(primaryIndex >= 0 ? contacts[primaryIndex] : {}), id: primaryIndex >= 0 ? contacts[primaryIndex].id : `contact-${crypto.randomUUID()}`, name: contactName, phone, email };
      if (primaryIndex >= 0) contacts[primaryIndex] = primary; else if (contactName || phone || email) contacts.unshift(primary);
      transaction.set(company.ref, { primaryContactId: contacts.length ? primary.id : null, primaryContactName: contactName || null, phone, email, contacts, productNames, nextActionTitle, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return ok({ message: force ? "自分の変更内容で上書きしました。" : "会社情報を更新しました。" });
  } catch (error) { return failure(error); }
}

class CompanyConflictError extends Error { status = 409; constructor() { super("他のユーザーが会社情報を更新しています。"); } }

function dateMillis(value: unknown) { const date = toDate(value); return date?.getTime() ?? Number.MAX_SAFE_INTEGER; }
function isoDate(value: unknown) { return toDate(value)?.toISOString() ?? null; }
function toDate(value: unknown): Date | null { if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate(); if (typeof value === "string") { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; } return null; }
function ok(data: unknown, status = 200) { return NextResponse.json({ success: true, data }, { status }); }
function failure(error: unknown) { const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400; return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "company_card_failed" } }, { status }); }
