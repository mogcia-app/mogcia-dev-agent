import { NextResponse } from "next/server";
import { heartbeatDevelopmentWorker } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<unknown> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { workerId } = await params as { workerId?: string };
    const body = await request.json() as Record<string, unknown>;
    const result = await heartbeatDevelopmentWorker({ uid: user.uid, name: user.name }, String(workerId ?? ""), body);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Worker heartbeatに失敗しました。" } }, { status: 400 });
  }
}
