import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { revealCompanyCredentialSecret } from "@/lib/server/business/company-detail-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string; credentialId: string }> }) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId, credentialId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const itemId = requireString(credentialId, "アクセス情報ID", 160);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") === "copy" ? "copy" : "reveal";
    const data = await withBusinessAudit(auth, `business_company_credential_${action}`, () => revealCompanyCredentialSecret(auth, id, itemId), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
