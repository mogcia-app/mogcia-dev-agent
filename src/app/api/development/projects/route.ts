import { NextResponse } from "next/server";
import { listDevelopmentProjectsForWorker } from "@/lib/server/development/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const projects = await listDevelopmentProjectsForWorker();
    return NextResponse.json({ success: true, data: { projects } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Project一覧を取得できませんでした。" } }, { status: 400 });
  }
}
