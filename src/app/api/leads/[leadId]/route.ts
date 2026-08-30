import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { BusinessApiError } from "@/lib/server/business/api";
import { getLeadById, updateLead } from "@/lib/server/business/lead-service";

export async function GET(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { leadId } = await params;
    const lead = await getLeadById(toBusinessAuth(user), leadId);
    return NextResponse.json({ success: true, data: { lead } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を取得できませんでした。" } }, { status: error instanceof BusinessApiError ? error.status : 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { leadId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await updateLead(toBusinessAuth(user), { ...body, id: leadId });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を更新できませんでした。" } }, { status: error instanceof BusinessApiError ? error.status : 400 });
  }
}

function toBusinessAuth(user: { uid: string; name?: string }) {
  return { db: getAdminDb(), userId: user.uid, userName: user.name ?? "", source: "web" as const, deviceId: null };
}
