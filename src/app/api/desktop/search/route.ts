import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { searchBusiness } from "@/lib/desktop/command";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const url = new URL(request.url);
    const q = requireString(url.searchParams.get("q"), "検索キーワード", 100);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "company_search", () => searchBusiness(auth, q));
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
