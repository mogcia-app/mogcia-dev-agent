import { FieldValue } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { defaultDesktopPermissions, desktopDevicesCollection, generateDesktopToken, hashDesktopToken, normalizeDesktopDevice, toPublicDevice } from "@/lib/desktop/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const snapshot = await getAdminDb().collection(desktopDevicesCollection).where("userId", "==", user.uid).get();
    return desktopSuccess({
      devices: snapshot.docs
        .map((entry) => toPublicDevice(normalizeDesktopDevice(entry.id, entry.data())))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    });
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const deviceName = requireString(body.deviceName, "端末名", 80);
    const token = generateDesktopToken();
    const ref = await getAdminDb().collection(desktopDevicesCollection).add({
      userId: user.uid,
      deviceName,
      deviceType: "unknown",
      os: null,
      appVersion: null,
      notificationEnabled: false,
      agentEnabled: false,
      tokenHash: hashDesktopToken(token),
      permissions: defaultDesktopPermissions,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
      lastSeenAt: null,
      revokedAt: null
    });

    const snapshot = await ref.get();
    return desktopSuccess(
      {
        device: toPublicDevice(normalizeDesktopDevice(snapshot.id, snapshot.data() ?? {})),
        token
      },
      201
    );
  } catch (error) {
    return desktopFailure(error);
  }
}
