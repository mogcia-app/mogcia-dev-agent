import { NextResponse } from "next/server";
import { getProjectMemory, saveProjectMemory } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await requireUserFromRequest(request);
    const { projectId } = await params;
    const memory = await getProjectMemory(projectId);
    return NextResponse.json({ success: true, data: { memory } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Project Memoryを取得できませんでした。" } }, { status: 400 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await requireUserFromRequest(request);
    const { projectId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const memory = await saveProjectMemory(projectId, body);
    return NextResponse.json({ success: true, data: { memory } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Project Memoryを保存できませんでした。" } }, { status: 400 });
  }
}
