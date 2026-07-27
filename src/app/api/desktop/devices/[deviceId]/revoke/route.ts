import { FieldValue } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { desktopDevicesCollection } from "@/lib/desktop/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const user = await requireUserFromRequest(request);
    const { deviceId } = await params;
    const ref = getAdminDb().collection(desktopDevicesCollection).doc(deviceId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new DesktopApiError("NOT_FOUND", "端末が見つかりません", 404);
    if (snapshot.data()?.userId !== user.uid) throw new DesktopApiError("FORBIDDEN", "この端末を操作できません", 403);
    await ref.update({ status: "revoked", revokedAt: FieldValue.serverTimestamp() });
    return desktopSuccess({ id: deviceId, status: "revoked" });
  } catch (error) {
    return desktopFailure(error);
  }
}
