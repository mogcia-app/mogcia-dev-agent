import { createAgentNotification, deleteAgentNotifications, listAgentNotifications, markAllAgentNotificationsRead, updateAgentNotificationStatus } from "@/lib/server/agent/repository";
import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const { searchParams } = new URL(request.url);
    const data = await withBusinessAudit(auth, "business_notification_read", async () => ({
      notifications: await listAgentNotifications(auth.userId, 100, { includeTest: searchParams.get("includeTest") === "true" })
    }));
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const environment = body.environment === "test" ? "test" : body.environment === "development" ? "development" : "production";
    const data = await withBusinessAudit(auth, "business_notification_create", async () => createAgentNotification({
      userId: auth.userId,
      title: requireString(body.title, "通知タイトル"),
      message: typeof body.message === "string" ? body.message : "",
      type: typeof body.type === "string" ? body.type : "info",
      source: auth.source,
      environment,
      runId: typeof body.runId === "string" ? body.runId : null,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : null
    }));
    return businessSuccess(data, 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_notification_update", async () => {
      if (body.action === "mark_all_read") return markAllAgentNotificationsRead(auth.userId);
      const notificationId = requireString(body.notificationId, "通知ID", 160);
      return updateAgentNotificationStatus(auth.userId, notificationId, {
        read: typeof body.read === "boolean" ? body.read : undefined,
        completed: typeof body.completed === "boolean" ? body.completed : undefined
      });
    }, typeof body.notificationId === "string" ? body.notificationId : null);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = Array.isArray(body.notificationIds) ? body.notificationIds.filter((id): id is string => typeof id === "string") : undefined;
    const data = await withBusinessAudit(auth, "business_notification_delete", async () => deleteAgentNotifications(auth.userId, ids));
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
