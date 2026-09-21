import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { deleteRecentKnowledgeNode, listRecentKnowledgeNodes, recordRecentKnowledgeNode } from "@/lib/server/agent-knowledge";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const limitValue = Number(new URL(request.url).searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.floor(limitValue), 1), 100) : 20;
    return NextResponse.json({ data: { items: await listRecentKnowledgeNodes(user.uid, limit) } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json({ data: await recordRecentKnowledgeNode(user.uid, nodeId(body.nodeId)) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json({ data: await deleteRecentKnowledgeNode(user.uid, nodeId(body.nodeId)) });
  } catch (error) {
    return failure(error);
  }
}

function nodeId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("ページIDが必要です。");
  return value.trim().slice(0, 160);
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "最近開いたページを処理できませんでした。" }, { status: 400 });
}
