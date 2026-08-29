import { NextResponse } from "next/server";
import { getDevelopmentWorkerStatus } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    return NextResponse.json({ success: true, data: await getDevelopmentWorkerStatus() });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Worker状態を取得できませんでした。" } }, { status: 400 });
  }
}
