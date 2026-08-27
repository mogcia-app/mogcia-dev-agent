import { NextResponse } from "next/server";
import { markDevelopmentJobRunning } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<unknown> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { jobId } = await params as { jobId?: string };
    const body = await request.json() as Record<string, unknown>;
    const result = await markDevelopmentJobRunning({ uid: user.uid, name: user.name }, String(jobId ?? ""), String(body.workerId ?? ""), body);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Job状態更新に失敗しました。" } }, { status: 400 });
  }
}
