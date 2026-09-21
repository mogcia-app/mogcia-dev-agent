import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { listKnowledgeNodes } from "@/lib/server/agent-knowledge";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_knowledge_read", async () => ({ nodes: await listKnowledgeNodes() }));
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
