import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { createKnowledgeNode, createKnowledgePaths, createKnowledgeTree, deleteKnowledgeNode, listKnowledgeNodes, updateKnowledgeNode } from "@/lib/server/agent-knowledge";
import type { TreeDraftNode } from "@/lib/agent-knowledge/types";

async function handle(request: Request, action: (uid: string, body: Record<string, unknown>) => Promise<unknown>) {
  try {
    const user = await requireUserFromRequest(request);
    const body = request.method === "GET" ? {} : await request.json() as Record<string, unknown>;
    return NextResponse.json({ data: await action(user.uid, body) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Knowledgeを処理できませんでした。" }, { status: 400 });
  }
}

export const GET = (request: Request) => handle(request, () => listKnowledgeNodes());
export const POST = (request: Request) => handle(request, async (uid, body) => {
  if (body.action === "bulk") return { count: await createKnowledgeTree(body.roots as TreeDraftNode[], uid, typeof body.parentId === "string" ? body.parentId : null) };
  if (body.action === "paths") return { count: await createKnowledgePaths(body.paths, uid) };
  return { id: await createKnowledgeNode(body, uid) };
});
export const PATCH = (request: Request) => handle(request, async (uid, body) => {
  if (typeof body.id !== "string") throw new Error("項目IDが必要です。");
  await updateKnowledgeNode(body.id, body, uid);
  return { ok: true };
});
export const DELETE = (request: Request) => handle(request, async (_uid, body) => {
  if (typeof body.id !== "string") throw new Error("項目IDが必要です。");
  return { count: await deleteKnowledgeNode(body.id) };
});
