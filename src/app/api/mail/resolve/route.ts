import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/server/auth";
import { resolveMailAddresses } from "@/lib/server/mail-sync";

export async function POST(request: Request) {
  try {
    await requireUserFromRequest(request);
    const body = await request.json() as { emailAddresses?: unknown };
    const addresses = Array.isArray(body.emailAddresses) ? body.emailAddresses.filter((value): value is string => typeof value === "string").slice(0, 100) : [];
    return NextResponse.json({ success: true, data: { matches: await resolveMailAddresses(addresses) } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "メールアドレスを照合できませんでした。" } }, { status: 400 });
  }
}

