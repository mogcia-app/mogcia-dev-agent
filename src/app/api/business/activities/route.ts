import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { createActivity, deleteActivity, listActivities, updateActivity } from "@/lib/server/business/activity-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { searchParams } = new URL(request.url);
    const data = await withBusinessAudit(auth, "business_activity_read", async () => ({
      activities: await listActivities(auth, {
        leadId: searchParams.get("leadId"),
        companyId: searchParams.get("companyId"),
        includeLegacy: searchParams.get("includeLegacy") === "true"
      })
    }));
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_activity_create", () => createActivity(auth, body));
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const activityId = requireString(body.id ?? body.activityId, "活動ログID", 160);
    const data = await withBusinessAudit(auth, "business_activity_update", () => updateActivity(auth, body), activityId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const activityId = requireString(body.id ?? body.activityId, "活動ログID", 160);
    const data = await withBusinessAudit(auth, "business_activity_delete", () => deleteActivity(auth, activityId), activityId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
