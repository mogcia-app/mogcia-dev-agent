import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const data = await withDesktopAudit(
      { userId: auth.userId, deviceId: auth.device.id },
      "auth_verify",
      async () => ({
        userId: auth.userId,
        device: {
          id: auth.device.id,
          deviceName: auth.device.deviceName,
          deviceType: auth.device.deviceType ?? "unknown",
          os: auth.device.os ?? null,
          appVersion: auth.device.appVersion ?? null,
          notificationEnabled: auth.device.notificationEnabled ?? false,
          agentEnabled: auth.device.agentEnabled ?? false,
          permissions: auth.device.permissions,
          status: auth.device.status
        }
      })
    );
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
