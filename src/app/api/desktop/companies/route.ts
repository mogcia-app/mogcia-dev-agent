import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { createCompany } from "@/lib/server/business/company-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireString(body.name, "会社名", 200);
    const data = await withDesktopAudit(context, "company_create", async () => {
      const result = await createCompany(toBusinessAuth(auth), { ...body, name });
      return result.requiresConfirmation ? { ...result, duplicates: (result.duplicates ?? []).map((item) => ({ id: item.id, name: item.name })) } : result;
    });
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
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
