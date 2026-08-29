import { NextResponse } from "next/server";
import { getFirebaseAdminDiagnostics } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET() {
  const diagnostics = await getFirebaseAdminDiagnostics();
  return NextResponse.json({ success: diagnostics.ok, data: diagnostics }, { status: diagnostics.ok ? 200 : 500 });
}
