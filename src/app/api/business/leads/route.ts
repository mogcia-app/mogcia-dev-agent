import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { createLead, deleteLead, listLeads, updateLead } from "@/lib/server/business/lead-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const data = await withBusinessAudit(auth, "business_lead_read", async () => {
      return { leads: await listLeads(auth) };
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
    const companyName = requireString(body.companyName, "見込み客の会社名");
    const data = await withBusinessAudit(auth, "business_lead_create", async () => {
      return createLead(auth, { ...body, companyName });
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
    const leadId = requireString(body.id ?? body.leadId, "見込み客ID", 160);
    const data = await withBusinessAudit(auth, "business_lead_update", async () => {
      return updateLead(auth, body);
    }, leadId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const leadId = requireString(body.id ?? body.leadId, "見込み客ID", 160);
    const data = await withBusinessAudit(auth, "business_lead_delete", () => deleteLead(auth, leadId), leadId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
