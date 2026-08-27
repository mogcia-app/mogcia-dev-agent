import { NextResponse } from "next/server";
import { registerDevelopmentWorker } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await registerDevelopmentWorker({ uid: user.uid, name: user.name }, body);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Worker登録に失敗しました。" } }, { status: 400 });
  }
}
