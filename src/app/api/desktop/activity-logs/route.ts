import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { createActivity, deleteActivity, listActivities, normalizeActivityType, normalizeLegacyActivityType, toDesktopActivityPayload, updateActivity } from "@/lib/server/business/activity-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const url = new URL(request.url);
    const companyId = optionalId(url.searchParams.get("companyId"));
    const leadId = optionalId(url.searchParams.get("leadId"));
    const limit = readLimit(url.searchParams.get("limit")) ?? 100;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "activity_read", async () => ({
      activities: (await listActivities(toBusinessAuth(auth), { companyId, leadId, limit, includeLegacy: url.searchParams.get("includeLegacy") === "true" })).map(toDesktopActivityPayload)
    }), companyId ?? leadId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = optionalId(body.companyId);
    const leadId = optionalId(body.leadId);
    if (!companyId && !leadId) throw new DesktopApiError("VALIDATION_ERROR", "会社IDまたは営業リストIDを入力してください", 400);
    const title = requireString(body.title, "タイトル", 200);
    const occurredAt = parseIsoDate(body.occurredAt, "発生日") ?? new Date();
    const type = normalizeActivityType(body.type ?? body.activityType);
    const activityType = body.activityType === undefined ? undefined : normalizeLegacyActivityType(body.activityType);

    const data = await withDesktopAudit(context, "activity_create", () => createActivity(toBusinessAuth(auth), {
      ...body,
      companyId,
      leadId,
      title,
      type,
      ...(activityType ? { activityType } : {}),
      content: optionalString(body.content, "内容", 10_000),
      occurredAt: occurredAt.toISOString()
    }), companyId ?? leadId);

    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const activityId = requireString(body.id ?? body.activityId, "活動ログID", 160);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "activity_update", async () => {
      const result = await updateActivity(toBusinessAuth(auth), { ...body, id: activityId });
      return { activity: toDesktopActivityPayload(result.activity) };
    }, activityId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const activityId = requireString(body.id ?? body.activityId, "活動ログID", 160);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "activity_delete", () => deleteActivity(toBusinessAuth(auth), activityId), activityId);
    return desktopSuccess(data);
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

function optionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;
}

function readLimit(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 500) : null;
}
