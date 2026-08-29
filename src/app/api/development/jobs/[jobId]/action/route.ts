import { NextResponse } from "next/server";
import { actOnLostDevelopmentJob } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUserFromRequest(request); const { jobId } = await params;
    const body = await request.json() as Record<string, unknown>; const action = body.action === "retry" ? "retry" : body.action === "cancel" ? "cancel" : null;
    if (!action) throw new Error("操作が不正です。");
    return NextResponse.json({ success: true, data: await actOnLostDevelopmentJob({ uid: user.uid, name: user.name }, jobId, action) });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Jobを操作できませんでした。" } }, { status: 400 });
  }
}
