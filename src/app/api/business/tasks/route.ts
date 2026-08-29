import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  arrayOfStrings,
  assertFreshUpdate,
  authenticateBusinessRequest,
  businessFailure,
  businessSuccess,
  defaultBusinessFields,
  findTimeDuplicates,
  nullableString,
  optionalString,
  parseDate,
  requireString,
  serializeDoc,
  updateBusinessFields,
  withBusinessAudit,
  type BusinessAuth
} from "@/lib/server/business/api";

const taskStatuses = ["todo", "in_progress", "waiting", "completed", "cancelled"];
const priorities = ["high", "medium", "low"];

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const data = await withBusinessAudit(auth, "business_task_read", async () => {
      const snapshot = await auth.db.collection("tasks").orderBy("createdAt", "desc").limit(500).get();
      return { tasks: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())) };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "タスクタイトル");
    const force = body.force === true;
    const dueDate = parseDate(body.dueDate);
    const data = await withBusinessAudit(auth, "business_task_create", async () => {
      const duplicates = await findTimeDuplicates(auth.db, "tasks", { title, companyId: nullableString(body.companyId), dueDate: dueDate?.toDate() ?? null });
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates };
      const ref = await auth.db.collection("tasks").add(taskPayload(auth, body, title, dueDate));
      return { id: ref.id, taskId: ref.id, requiresConfirmation: false };
    });
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const taskId = requireString(body.id ?? body.taskId, "タスクID", 160);
    const ref = auth.db.collection("tasks").doc(taskId);
    const data = await withBusinessAudit(auth, "business_task_update", async () => {
      const snapshot = await assertFreshUpdate(ref, body.updatedAt);
      const previous = snapshot.data() ?? {};
      const status = validStatus(body.status, previous.status);
      const patch = {
        title: typeof body.title === "string" ? body.title.trim() : previous.title,
        description: optionalString(body.description ?? previous.description, 3000),
        status,
        priority: validPriority(body.priority, previous.priority),
        assigneeId: nullableString(body.assigneeId) ?? previous.assigneeId ?? auth.userId,
        assigneeName: nullableString(body.assigneeName) ?? previous.assigneeName ?? auth.userName,
        collaboratorIds: arrayOfStrings(body.collaboratorIds ?? previous.collaboratorIds),
        collaboratorNames: arrayOfStrings(body.collaboratorNames ?? previous.collaboratorNames),
        companyId: nullableString(body.companyId) ?? previous.companyId ?? null,
        companyName: nullableString(body.companyName) ?? previous.companyName ?? null,
        leadId: nullableString(body.leadId) ?? previous.leadId ?? null,
        leadName: nullableString(body.leadName) ?? previous.leadName ?? null,
        productId: nullableString(body.productId) ?? previous.productId ?? null,
        productName: nullableString(body.productName) ?? previous.productName ?? null,
        dueDate: body.dueDate === undefined ? previous.dueDate ?? null : parseDate(body.dueDate),
        comments: optionalString(body.comments ?? previous.comments, 3000),
        completedAt: status === "completed" ? previous.completedAt ?? FieldValue.serverTimestamp() : null,
        id: FieldValue.delete(),
        taskId: FieldValue.delete(),
        ...updateBusinessFields(auth)
      };
      await ref.set(patch, { merge: true });
      const next = await ref.get();
      return { task: serializeDoc(next.id, next.data() ?? {}) };
    }, taskId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function taskPayload(auth: BusinessAuth, body: Record<string, unknown>, title: string, dueDate: Timestamp | null) {
  return {
    title,
    description: optionalString(body.description, 3000),
    status: validStatus(body.status, "todo"),
    priority: validPriority(body.priority, "medium"),
    source: "manual",
    aiGenerated: false,
    aiReason: optionalString(body.aiReason, 1000),
    sourceType: nullableString(body.sourceType, 80),
    sourceId: nullableString(body.sourceId, 160),
    assigneeId: nullableString(body.assigneeId, 160) ?? auth.userId,
    assigneeName: nullableString(body.assigneeName, 160) ?? auth.userName,
    collaboratorIds: arrayOfStrings(body.collaboratorIds),
    collaboratorNames: arrayOfStrings(body.collaboratorNames),
    companyId: nullableString(body.companyId, 160),
    companyName: nullableString(body.companyName, 200),
    leadId: nullableString(body.leadId, 160),
    leadName: nullableString(body.leadName, 200),
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 200),
    projectId: nullableString(body.projectId, 160),
    projectName: nullableString(body.projectName, 200),
    meetingId: nullableString(body.meetingId, 160),
    meetingTitle: nullableString(body.meetingTitle, 200),
    dueDate,
    completedAt: null,
    checklist: [],
    comments: optionalString(body.comments, 3000),
    progressLogs: [],
    ...defaultBusinessFields(auth)
  };
}

function validStatus(value: unknown, fallback: unknown): string {
  return typeof value === "string" && taskStatuses.includes(value) ? value : typeof fallback === "string" && taskStatuses.includes(fallback) ? fallback : "todo";
}

function validPriority(value: unknown, fallback: unknown): string {
  return typeof value === "string" && priorities.includes(value) ? value : typeof fallback === "string" && priorities.includes(fallback) ? fallback : "medium";
}
