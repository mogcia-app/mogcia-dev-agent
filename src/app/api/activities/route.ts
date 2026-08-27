import { NextResponse } from "next/server";
import { createActivityForUser, listLeadActivities } from "@/lib/server/leads/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const leadId = new URL(request.url).searchParams.get("leadId");
    const activities = leadId ? await listLeadActivities(leadId) : [];
    return NextResponse.json({ success: true, data: { activities } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "活動ログを取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createActivityForUser(body, { uid: user.uid, name: user.name });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "活動ログを作成できませんでした。" } }, { status: 400 });
  }
}
