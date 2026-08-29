import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { handleDesktopCommand } from "@/lib/desktop/command";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "useAiParser");
    const body = (await request.json()) as Record<string, unknown>;
    const rawMessage = requireString(body.rawMessage, "質問", 2000);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_chat", async () => {
      const result = await handleDesktopCommand(auth, { ...body, rawMessage });
      return {
        requestId: "",
        runId: "",
        answer: result.message,
        handled: result.handled,
        kind: result.kind,
        items: result.items,
        draft: result.draft
      };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
