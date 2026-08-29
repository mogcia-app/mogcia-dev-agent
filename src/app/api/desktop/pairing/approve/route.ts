import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { defaultDesktopPermissions, desktopDevicesCollection, generateDesktopToken, hashDesktopToken } from "@/lib/desktop/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";
import { getUserFamilyNameById } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request); const body = await request.json() as Record<string, unknown>; const pairingId = String(body.pairingId || ""); const secret = String(body.secret || ""); if (!pairingId || !secret) throw new Error("連携情報が不足しています。");
    const db = getAdminDb(); const pairingRef = db.collection("desktopPairings").doc(pairingId); const pairing = await pairingRef.get(); const data = pairing.data();
    if (!pairing.exists || data?.status !== "pending" || data.secretHash !== hash(secret) || !data.expiresAt?.toDate || data.expiresAt.toDate().getTime() < Date.now()) throw new Error("連携URLの有効期限が切れています。");
    const familyName = getUserFamilyNameById(user.uid, user.name || user.email || null); const token = generateDesktopToken();
    const deviceRef = await db.collection(desktopDevicesCollection).add({ userId: user.uid, deviceName: familyName, machineName: String(data.machineName || "Mac"), deviceType: "desktop_agent", os: "macOS", appVersion: null, notificationEnabled: true, agentEnabled: true, tokenHash: hashDesktopToken(token), permissions: defaultDesktopPermissions, status: "active", createdAt: FieldValue.serverTimestamp(), lastUsedAt: null, lastSeenAt: null, revokedAt: null });
    await pairingRef.set({ status: "approved", userId: user.uid, familyName, deviceId: deviceRef.id, token, approvedAt: FieldValue.serverTimestamp() }, { merge: true }); return NextResponse.json({ success: true, data: { familyName, message: `${familyName}を連携しました。` } });
  } catch (error) { return failure(error); }
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function failure(error: unknown) { return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "pairing_approve_failed" } }, { status: 400 }); }
