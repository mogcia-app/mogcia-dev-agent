import { DesktopApiError, desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { searchKnowledgeNodes } from "@/lib/server/agent-knowledge";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (!query) throw new DesktopApiError("VALIDATION_ERROR", "検索キーワードを入力してください", 400);
    const limitValue = Number(url.searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.floor(limitValue), 1), 100) : 30;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_knowledge_search", async () => ({ results: await searchKnowledgeNodes(query, limit) }));
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
