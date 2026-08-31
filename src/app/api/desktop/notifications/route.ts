import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { deleteAgentNotifications, listAgentNotifications, markAllAgentNotificationsRead, updateAgentNotificationStatus } from "@/lib/server/agent/repository";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "notification_read", async () => {
      const notifications = await listAgentNotifications(auth.userId, 40);
      return { notifications };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "notification_update", async () => {
      if (body.action === "mark_all_read") return markAllAgentNotificationsRead(auth.userId);
      const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";
      if (!notificationId) throw new Error("通知IDが必要です。");
      const handlingStatus = body.handlingStatus === "read" || body.handlingStatus === "done" || body.handlingStatus === "snoozed"
        ? body.handlingStatus
        : body.handlingStatus === null ? null : undefined;
      const handlingMemo = typeof body.handlingMemo === "string" ? body.handlingMemo.trim().slice(0, 2000) : undefined;
      const snoozedUntil = parseOptionalDate(body.snoozedUntil);
      return updateAgentNotificationStatus(auth.userId, notificationId, {
        read: typeof body.read === "boolean" ? body.read : undefined,
        completed: typeof body.completed === "boolean" ? body.completed : undefined,
        handlingStatus,
        handlingMemo,
        snoozedUntil
      });
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("延期日時の形式が正しくありません。");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("延期日時の形式が正しくありません。");
  return date;
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = Array.isArray(body.notificationIds) ? body.notificationIds.filter((id): id is string => typeof id === "string") : undefined;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "notification_delete", async () => deleteAgentNotifications(auth.userId, ids));
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
