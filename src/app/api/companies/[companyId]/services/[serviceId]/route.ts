import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { deleteCompanyService, updateCompanyService } from "@/lib/server/business/company-detail-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ companyId: string; serviceId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId, serviceId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const itemId = requireString(serviceId, "サービスID", 160);
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_company_service_update", () => updateCompanyService(auth, id, itemId, body), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId, serviceId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const itemId = requireString(serviceId, "サービスID", 160);
    const data = await withBusinessAudit(auth, "business_company_service_delete", () => deleteCompanyService(auth, id, itemId), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
