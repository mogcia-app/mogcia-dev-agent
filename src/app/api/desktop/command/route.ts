import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { commitCalendarDraft } from "@/lib/desktop/command";
import { handleDesktopConversation } from "@/lib/desktop/conversation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "useAiParser");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "command", () => handleDesktopConversation(auth, body));
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "calendar_create", () => commitCalendarDraft(auth, body));
    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
