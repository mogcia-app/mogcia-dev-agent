import { NextResponse } from "next/server";
import { getLead, updateLeadForUser } from "@/lib/server/leads/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    await requireUserFromRequest(request);
    const { leadId } = await params;
    const lead = await getLead(leadId);
    if (!lead) return NextResponse.json({ success: false, error: { message: "見込み客が見つかりません。" } }, { status: 404 });
    return NextResponse.json({ success: true, data: { lead } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を取得できませんでした。" } }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    await requireUserFromRequest(request);
    const { leadId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const lead = await updateLeadForUser(leadId, body);
    return NextResponse.json({ success: true, data: { lead } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を更新できませんでした。" } }, { status: 400 });
  }
}
