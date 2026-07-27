import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { endOfTokyoToday, priorityWeight, startOfTokyoToday, toDesktopTask } from "@/lib/desktop/format";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "task_read", async () => {
      const snapshot = await auth.db.collection("tasks").where("assigneeId", "==", auth.userId).get();
      const start = startOfTokyoToday().getTime();
      const end = endOfTokyoToday().getTime();
      const tasks = snapshot.docs
        .map((entry) => ({ id: entry.id, data: entry.data() }))
        .filter(({ data }) => data.status !== "completed" && data.status !== "cancelled")
        .filter(({ data }) => {
          const due = data.dueDate?.toDate?.();
          if (!due) return false;
          return due.getTime() <= end || due.getTime() < start;
        })
        .sort((left, right) => {
          const leftDue = left.data.dueDate?.toDate?.()?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const rightDue = right.data.dueDate?.toDate?.()?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const leftOverdue = leftDue < start;
          const rightOverdue = rightDue < start;
          if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
          const priorityDiff = priorityWeight(String(right.data.priority ?? "medium")) - priorityWeight(String(left.data.priority ?? "medium"));
          return priorityDiff || leftDue - rightDue;
        })
        .map(({ id, data }) => toDesktopTask(id, data));
      return { tasks };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
