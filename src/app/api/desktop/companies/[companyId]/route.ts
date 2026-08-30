import { desktopFailure, desktopSuccess, optionalString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { getCompanyDetailAggregate, toDesktopCompanyAggregatePayload } from "@/lib/server/business/company-aggregate-service";
import { updateCompany } from "@/lib/server/business/company-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const { companyId } = await params;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "company_search", async () => {
      return toDesktopCompanyAggregatePayload(await getCompanyDetailAggregate(toBusinessAuth(auth), companyId));
    }, companyId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const { companyId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "company_create", async () => {
      return updateCompany(toBusinessAuth(auth), {
        id: companyId,
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(body.industry !== undefined ? { industry: optionalString(body.industry, "業種", 120) } : {}),
        ...(body.status !== undefined ? { status: optionalString(body.status, "状態", 80) } : {}),
        ...(body.primaryContactName !== undefined ? { primaryContactName: optionalString(body.primaryContactName, "担当者名", 120) || null } : {}),
        ...(body.phone !== undefined ? { phone: optionalString(body.phone, "電話番号", 80) } : {}),
        ...(body.email !== undefined ? { email: optionalString(body.email, "メールアドレス", 160) } : {}),
        ...(body.notes !== undefined ? { notes: optionalString(body.notes, "メモ", 5000) } : {})
      });
    }, companyId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>): BusinessAuth {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop",
    deviceId: auth.device.id
  };
}
