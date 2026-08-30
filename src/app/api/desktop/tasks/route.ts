import { DesktopApiError, desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { BusinessApiError, requireString, type BusinessAuth } from "@/lib/server/business/api";
import { changeTaskDueDate, changeTaskPriority, completeTask, createTask, deleteTask, getTaskById, listTasks, reopenTask, searchTasks, toDesktopTaskPayload, updateTask } from "@/lib/server/business/task-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? url.searchParams.get("taskId");
    const q = url.searchParams.get("q") ?? url.searchParams.get("query");
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "task_read", async () => {
      if (id) return { task: toDesktopTaskPayload(await getTaskById(toBusinessAuth(auth), id)) };
      const tasks = q
        ? await searchTasks(toBusinessAuth(auth), q, { limit: readLimit(url.searchParams.get("limit")) ?? undefined })
        : await listTasks(toBusinessAuth(auth), { limit: readLimit(url.searchParams.get("limit")) ?? 120, includeCompleted: true });
      return { tasks: tasks.map(toDesktopTaskPayload) };
    }, id);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "task_create", async () => {
      const created = await createTask(toBusinessAuth(auth), body);
      return { taskId: created.taskId, requiresConfirmation: created.requiresConfirmation, duplicates: created.duplicates };
    });
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const taskId = requireString(body.id ?? body.taskId, "タスクID", 160);
    const action = typeof body.action === "string" ? body.action : "";
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "task_create", async () => {
      if (action === "complete") return completeTask(toBusinessAuth(auth), taskId);
      if (action === "reopen") return reopenTask(toBusinessAuth(auth), taskId);
      if (action === "changeDueDate") return changeTaskDueDate(toBusinessAuth(auth), taskId, body.dueDate);
      if (action === "changePriority") return changeTaskPriority(toBusinessAuth(auth), taskId, body.priority);
      return updateTask(toBusinessAuth(auth), body);
    }, taskId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const taskId = requireString(body.id ?? body.taskId, "タスクID", 160);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "task_create", () => deleteTask(toBusinessAuth(auth), taskId), taskId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(toDesktopError(error));
  }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>): BusinessAuth {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop",
    deviceId: auth.device.id
  };
}

function toDesktopError(error: unknown) {
  if (error instanceof BusinessApiError) return new DesktopApiError(error.code === "CONFLICT" ? "DUPLICATE" : error.code, error.message, error.status);
  return error;
}

function readLimit(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 500) : null;
}
