import { NextResponse } from "next/server";
import { getAgentRun, updateAgentRunForUser } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { runId } = await params;
    const run = await getAgentRun(user.uid, runId);
    if (!run) return NextResponse.json({ success: false, error: { message: "Agent Runが見つかりません。" } }, { status: 404 });
    return NextResponse.json({ success: true, data: { run } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agent Runを取得できませんでした。" } }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { runId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const run = await updateAgentRunForUser(user.uid, runId, body);
    return NextResponse.json({ success: true, data: { run } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agent Runを更新できませんでした。" } }, { status: 400 });
  }
}
