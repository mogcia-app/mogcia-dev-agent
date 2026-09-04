import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { createCompanyCredential, listCompanyCredentials } from "@/lib/server/business/company-detail-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const data = await withBusinessAudit(auth, "business_company_credential_read", async () => ({ credentials: await listCompanyCredentials(auth, id) }), id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId } = await context.params;
    const id = requireString(companyId, "会社ID", 160);
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_company_credential_create", () => createCompanyCredential(auth, id, body), id);
    return businessSuccess(data, 201);
  } catch (error) {
    return businessFailure(error);
  }
}
