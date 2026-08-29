import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await import("@/lib/firebase/admin");
    const diagnostics = await admin.getFirebaseAdminDiagnostics();
    return NextResponse.json({ success: diagnostics.ok, data: diagnostics }, { status: diagnostics.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Firebase Adminの読み込みに失敗しました。"
      }
    }, { status: 500 });
  }
}
