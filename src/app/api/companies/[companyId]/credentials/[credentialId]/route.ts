import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { deleteCompanyCredential, updateCompanyCredential } from "@/lib/server/business/company-detail-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ companyId: string; credentialId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId, credentialId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const itemId = requireString(credentialId, "アクセス情報ID", 160);
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_company_credential_update", () => updateCompanyCredential(auth, id, itemId, body), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId, credentialId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const itemId = requireString(credentialId, "アクセス情報ID", 160);
    const data = await withBusinessAudit(auth, "business_company_credential_delete", () => deleteCompanyCredential(auth, id, itemId), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
