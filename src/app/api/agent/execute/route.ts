import { NextResponse } from "next/server";
import { executeAgentRequest } from "@/lib/server/agent/executor";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await executeAgentRequest({
      user: { uid: user.uid, name: user.name },
      rawMessage: String(body.rawMessage ?? ""),
      projectId: typeof body.projectId === "string" ? body.projectId : null
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agentを実行できませんでした。" } }, { status: 400 });
  }
}
