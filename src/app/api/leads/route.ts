import { NextResponse } from "next/server";
import { createLeadForUser, listLeads } from "@/lib/server/leads/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const leads = await listLeads();
    return NextResponse.json({ success: true, data: { leads } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createLeadForUser(body, { uid: user.uid, name: user.name });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "見込み客を作成できませんでした。" } }, { status: 400 });
  }
}
