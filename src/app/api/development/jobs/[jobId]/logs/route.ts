import { NextResponse } from "next/server";
import { appendDevelopmentJobLog } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<unknown> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { jobId } = await params as { jobId?: string };
    const body = await request.json() as Record<string, unknown>;
    const result = await appendDevelopmentJobLog({ uid: user.uid, name: user.name }, String(jobId ?? ""), String(body.workerId ?? ""), body);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Jobログ保存に失敗しました。" } }, { status: 400 });
  }
}
