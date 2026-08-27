import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { importMailActivity } from "@/lib/server/mail-sync";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await importMailActivity(body, { uid: user.uid, name: user.name });
    return NextResponse.json({ success: true, data: result }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "メールActivityを保存できませんでした。" } }, { status: 400 });
  }
}

