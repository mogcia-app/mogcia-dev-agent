import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const pairingId = String(body.pairingId || ""); const secret = String(body.secret || ""); const ref = getAdminDb().collection("desktopPairings").doc(pairingId); const snapshot = await ref.get(); const data = snapshot.data();
    if (!snapshot.exists || data?.secretHash !== hash(secret)) throw new Error("連携情報が正しくありません。"); if (!data.expiresAt?.toDate || data.expiresAt.toDate().getTime() < Date.now()) { await ref.delete(); throw new Error("連携の有効期限が切れました。"); }
    if (data.status !== "approved" || typeof data.token !== "string") return NextResponse.json({ success: true, data: { status: "pending" } }, { status: 202 });
    const result = { status: "approved", token: data.token, familyName: String(data.familyName || "社員") }; await ref.delete(); return NextResponse.json({ success: true, data: result });
  } catch (error) { return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "pairing_claim_failed" } }, { status: 400 }); }
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
