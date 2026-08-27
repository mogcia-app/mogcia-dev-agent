import { NextResponse } from "next/server";
import { createAgentRequestForUser } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createAgentRequestForUser({
      userId: user.uid,
      rawMessage: String(body.rawMessage ?? ""),
      source: "web",
      intent: typeof body.intent === "string" ? body.intent : null,
      targetType: typeof body.targetType === "string" ? body.targetType : null,
      targetId: typeof body.targetId === "string" ? body.targetId : null,
      projectId: typeof body.projectId === "string" ? body.projectId : null
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agent Requestを作成できませんでした。" } }, { status: 400 });
  }
}
