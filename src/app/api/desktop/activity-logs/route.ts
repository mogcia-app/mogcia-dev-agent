import { desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { createActivity, normalizeLegacyActivityType } from "@/lib/server/business/activity-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "会社ID", 120);
    const title = requireString(body.title, "タイトル", 200);
    const occurredAt = parseIsoDate(body.occurredAt, "発生日") ?? new Date();
    const type = normalizeLegacyActivityType(body.type);

    const data = await withDesktopAudit(context, "activity_create", () => createActivity(toBusinessAuth(auth), {
      ...body,
      companyId,
      title,
      activityType: type,
      content: optionalString(body.content, "内容", 10_000),
      occurredAt: occurredAt.toISOString()
    }), companyId);

    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop" as const,
    deviceId: auth.device.id
  };
}
