import { authenticateBusinessRequest, businessFailure, businessSuccess, withBusinessAudit } from "@/lib/server/business/api";
import { getHomeWorkspace, updateHomeWorkspace } from "@/lib/server/business/home-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    return businessSuccess(await getHomeWorkspace(auth));
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = await request.json() as Record<string, unknown>;
    return businessSuccess(await withBusinessAudit(auth, "home_workspace_update", () => updateHomeWorkspace(auth, body), auth.userId));
  } catch (error) {
    return businessFailure(error);
  }
}
