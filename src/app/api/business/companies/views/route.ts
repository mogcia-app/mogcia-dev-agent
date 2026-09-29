import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { listCompanyViews, markCompanyViewed } from "@/lib/server/business/company-view-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    return businessSuccess({ views: await listCompanyViews(auth) });
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = await request.json() as Record<string, unknown>;
    const companyId = requireString(body.companyId, "会社ID", 160);
    const data = await withBusinessAudit(auth, "business_company_view", () => markCompanyViewed(auth, companyId), companyId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
