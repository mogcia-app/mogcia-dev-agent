import { NextResponse } from "next/server";
import { claimDevelopmentJob } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await claimDevelopmentJob({
      uid: user.uid,
      name: user.name
    }, {
      workerId: String(body.workerId ?? ""),
      capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((item): item is string => typeof item === "string") : []
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Job取得に失敗しました。" } }, { status: 400 });
  }
}
