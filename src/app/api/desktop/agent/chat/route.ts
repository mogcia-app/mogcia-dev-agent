import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { executeAgentRequest } from "@/lib/server/agent/executor";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "useAiParser");
    const body = (await request.json()) as Record<string, unknown>;
    const rawMessage = requireString(body.rawMessage, "質問", 2000);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_chat", async () => {
      const result = await executeAgentRequest({
        user: { uid: auth.userId },
        rawMessage,
        projectId: typeof body.projectId === "string" ? body.projectId : null,
        source: "desktop"
      });
      return result;
    });
    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
