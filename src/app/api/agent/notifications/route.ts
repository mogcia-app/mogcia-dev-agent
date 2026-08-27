import { NextResponse } from "next/server";
import { createAgentNotification, listAgentNotifications } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const notifications = await listAgentNotifications(user.uid);
    return NextResponse.json({ success: true, data: { notifications } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createAgentNotification({
      userId: user.uid,
      title: String(body.title ?? ""),
      message: String(body.message ?? ""),
      type: typeof body.type === "string" ? body.type : "info",
      runId: typeof body.runId === "string" ? body.runId : null,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : null
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を作成できませんでした。" } }, { status: 400 });
  }
}
