import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { listKnowledgeFavoriteIds, setKnowledgeFavorite } from "@/lib/server/agent-knowledge";

export async function GET(request: Request) {
  try { const user = await requireUserFromRequest(request); return NextResponse.json({ data: { ids: await listKnowledgeFavoriteIds(user.uid) } }); }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try { const user = await requireUserFromRequest(request); const body = await request.json() as Record<string, unknown>; return NextResponse.json({ data: await setKnowledgeFavorite(user.uid, nodeId(body.nodeId), body.favorite === true) }); }
  catch (error) { return failure(error); }
}

function nodeId(value: unknown) { if (typeof value !== "string" || !value.trim()) throw new Error("ページIDが必要です。"); return value.trim().slice(0, 160); }
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "お気に入りを処理できませんでした。" }, { status: 400 }); }
