import {
  authenticateBusinessRequest,
  businessFailure,
  businessSuccess,
  requireString,
  withBusinessAudit,
} from "@/lib/server/business/api";
import { createCompany, deleteCompany, listCompanies, setCompanyFavorite, updateCompany } from "@/lib/server/business/company-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const data = await withBusinessAudit(auth, "business_company_read", async () => {
      return { companies: await listCompanies(auth) };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireString(body.name, "会社名");
    const data = await withBusinessAudit(auth, "business_company_create", async () => {
      return createCompany(auth, { ...body, name });
    });
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = requireString(body.id ?? body.companyId, "会社ID", 160);
    const data = await withBusinessAudit(auth, "business_company_update", async () => {
      if (body.action === "favorite") return setCompanyFavorite(auth, companyId, body.favorite !== false);
      return updateCompany(auth, body);
    }, companyId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = requireString(body.id ?? body.companyId, "会社ID", 160);
    const data = await withBusinessAudit(auth, "business_company_delete", () => deleteCompany(auth, companyId), companyId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
