import { NextResponse } from "next/server";
import { createAgentNotification, deleteAgentNotifications, listAgentNotifications, markAllAgentNotificationsRead, updateAgentNotificationStatus } from "@/lib/server/agent/repository";
import { authenticateBusinessRequest } from "@/lib/server/business/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const { searchParams } = new URL(request.url);
    const notifications = await listAgentNotifications(auth.userId, 80, { includeTest: searchParams.get("includeTest") === "true" });
    return NextResponse.json({ success: true, data: { notifications } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createAgentNotification({
      userId: auth.userId,
      title: String(body.title ?? ""),
      message: String(body.message ?? ""),
      type: typeof body.type === "string" ? body.type : "info",
      source: auth.source,
      environment: body.environment === "test" || body.environment === "development" ? body.environment : "production",
      runId: typeof body.runId === "string" ? body.runId : null,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : null
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を作成できませんでした。" } }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "mark_all_read") {
      const result = await markAllAgentNotificationsRead(auth.userId);
      return NextResponse.json({ success: true, data: result });
    }
    const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";
    if (!notificationId) throw new Error("通知IDが必要です。");
    const result = await updateAgentNotificationStatus(auth.userId, notificationId, {
      read: typeof body.read === "boolean" ? body.read : undefined,
      completed: typeof body.completed === "boolean" ? body.completed : undefined
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を更新できませんでした。" } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = Array.isArray(body.notificationIds) ? body.notificationIds.filter((id): id is string => typeof id === "string") : undefined;
    const result = await deleteAgentNotifications(auth.userId, ids);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を削除できませんでした。" } }, { status: 400 });
  }
}
