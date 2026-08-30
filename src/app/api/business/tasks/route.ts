import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { changeTaskDueDate, changeTaskPriority, completeTask, createTask, deleteTask, getTaskById, listTasks, reopenTask, searchTasks, updateTask } from "@/lib/server/business/task-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? url.searchParams.get("taskId");
    const q = url.searchParams.get("q") ?? url.searchParams.get("query");
    const data = await withBusinessAudit(auth, "business_task_read", async () => {
      if (id) return { task: await getTaskById(auth, id) };
      if (q) return { tasks: await searchTasks(auth, q, { limit: readLimit(url.searchParams.get("limit")) ?? undefined }) };
      return { tasks: await listTasks(auth, { limit: readLimit(url.searchParams.get("limit")) ?? 500, includeCompleted: true }) };
    }, id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_task_create", () => createTask(auth, body));
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
    const action = typeof body.action === "string" ? body.action : "";
    const data = await withBusinessAudit(auth, "business_task_update", async () => {
      if (action === "complete") return completeTask(auth, taskId);
      if (action === "reopen") return reopenTask(auth, taskId);
      if (action === "changeDueDate") return changeTaskDueDate(auth, taskId, body.dueDate);
      if (action === "changePriority") return changeTaskPriority(auth, taskId, body.priority);
      return updateTask(auth, body);
    }, taskId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const taskId = requireString(body.id ?? body.taskId, "タスクID", 160);
    const data = await withBusinessAudit(auth, "business_task_delete", () => deleteTask(auth, taskId), taskId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function readLimit(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 500) : null;
}
