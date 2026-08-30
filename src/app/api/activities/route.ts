import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { createActivity, listActivitiesByLeadId } from "@/lib/server/business/activity-service";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const leadId = new URL(request.url).searchParams.get("leadId");
    const activities = leadId ? await listActivitiesByLeadId(toBusinessAuth(user), leadId, { limit: 100 }) : [];
    return NextResponse.json({ success: true, data: { activities } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "活動ログを取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createActivity(toBusinessAuth(user), body);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "活動ログを作成できませんでした。" } }, { status: 400 });
  }
}

function toBusinessAuth(user: { uid: string; name?: string }) {
  return { db: getAdminDb(), userId: user.uid, userName: user.name ?? "", source: "web" as const, deviceId: null };
}
