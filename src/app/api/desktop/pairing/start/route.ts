import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>; const pairingId = randomUUID(); const secret = randomBytes(32).toString("base64url"); const machineName = typeof body.machineName === "string" ? body.machineName.trim().slice(0, 100) : "Mac";
    await getAdminDb().collection("desktopPairings").doc(pairingId).set({ secretHash: hash(secret), machineName, status: "pending", expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), createdAt: FieldValue.serverTimestamp() });
    const origin = new URL(request.url).origin; return NextResponse.json({ success: true, data: { pairingId, secret, connectURL: `${origin}/desktop/connect?id=${encodeURIComponent(pairingId)}&secret=${encodeURIComponent(secret)}` } });
  } catch (error) { return failure(error); }
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function failure(error: unknown) { return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "pairing_start_failed" } }, { status: 400 }); }
