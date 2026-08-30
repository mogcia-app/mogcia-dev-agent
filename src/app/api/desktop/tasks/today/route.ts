import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { endOfTokyoToday, startOfTokyoToday } from "@/lib/desktop/format";
import { type BusinessAuth } from "@/lib/server/business/api";
import { listTodayActionTasks, toDesktopTaskPayload } from "@/lib/server/business/task-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "task_read", async () => {
      const tasks = (await listTodayActionTasks(toBusinessAuth(auth), startOfTokyoToday(), endOfTokyoToday())).map(toDesktopTaskPayload);
      return { tasks };
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
