import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { searchCompanies, toDesktopCompanyPayload } from "@/lib/server/business/company-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  let context: { userId: string; deviceId: string } | null = null;
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    context = { userId: auth.userId, deviceId: auth.device.id };
    const url = new URL(request.url);
    const keyword = requireString(url.searchParams.get("q"), "検索キーワード", 100).toLowerCase();

    const data = await withDesktopAudit(context, "company_search", async () => {
      const companies = (await searchCompanies(toBusinessAuth(auth), keyword, { limit: 20 })).map(toDesktopCompanyPayload);
      return { companies };
    });

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
