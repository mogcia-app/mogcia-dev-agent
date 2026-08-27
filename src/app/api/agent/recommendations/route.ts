import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { listRecommendations, updateRecommendationState, type RecommendationStatus } from "@/lib/server/recommendations";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    return NextResponse.json({ success: true, data: { recommendations: await listRecommendations(user.uid) } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "提案を取得できませんでした。" } }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUserFromRequest(request); const body = await request.json() as Record<string, unknown>;
    const status = String(body.status ?? "") as RecommendationStatus;
    if (!["read", "dismissed", "done"].includes(status)) throw new Error("状態が不正です。");
    const result = await updateRecommendationState(user.uid, String(body.id ?? ""), status, typeof body.snoozedUntil === "string" ? body.snoozedUntil : null);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "提案を更新できませんでした。" } }, { status: 400 });
  }
}

