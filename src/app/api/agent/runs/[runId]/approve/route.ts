import { NextResponse } from "next/server";
import { approvePendingAgentAction } from "@/lib/server/agent/executor";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<unknown> }) {
  try {
    const user = await requireUserFromRequest(request);
    const resolvedParams = await params as { runId?: string };
    const runId = String(resolvedParams.runId ?? "");
    const body = (await request.json()) as Record<string, unknown>;
    const decision = body.decision === "cancel" ? "cancel" : "approve";
    const result = await approvePendingAgentAction({ user: { uid: user.uid, name: user.name }, runId, decision });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agent操作を実行できませんでした。" } }, { status: 400 });
  }
}
