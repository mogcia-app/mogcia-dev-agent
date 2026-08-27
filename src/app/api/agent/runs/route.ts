import { NextResponse } from "next/server";
import { listAgentRuns } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const runs = await listAgentRuns(user.uid);
    return NextResponse.json({ success: true, data: { runs } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agent Runを取得できませんでした。" } }, { status: 400 });
  }
}
