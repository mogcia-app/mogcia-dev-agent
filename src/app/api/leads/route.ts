import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { createLead, listLeads } from "@/lib/server/business/lead-service";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const leads = await listLeads(toBusinessAuth(user));
    return NextResponse.json({ success: true, data: { leads } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createLead(toBusinessAuth(user), body);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を作成できませんでした。" } }, { status: 400 });
  }
}

function toBusinessAuth(user: { uid: string; name?: string }) {
  return { db: getAdminDb(), userId: user.uid, userName: user.name ?? "", source: "web" as const, deviceId: null };
}
