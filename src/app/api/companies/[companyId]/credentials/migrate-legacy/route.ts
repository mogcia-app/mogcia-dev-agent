import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { migrateLegacyCompanyCredentials } from "@/lib/server/business/company-detail-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const data = await withBusinessAudit(auth, "business_company_credential_migrate_legacy", () => migrateLegacyCompanyCredentials(auth, id), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
