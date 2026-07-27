import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { getUserDisplayNameById } from "@/lib/user-display";

const priorities = ["high", "medium", "low"] as const;

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "タスクタイトル", 200);
    const description = optionalString(body.description, "説明", 2000);
    const companyId = optionalString(body.companyId, "会社ID", 120) || null;
    const dueDate = parseIsoDate(body.dueDate, "期限");
    const priority = typeof body.priority === "string" && priorities.includes(body.priority as (typeof priorities)[number]) ? body.priority : "medium";
    const userName = getUserDisplayNameById(auth.userId);

    const data = await withDesktopAudit(context, "task_create", async () => {
      const companySnapshot = companyId ? await auth.db.collection("companies").doc(companyId).get() : null;
      if (companyId && !companySnapshot?.exists) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
      const companyName = companySnapshot?.data()?.name ?? null;
      const ref = await auth.db.collection("tasks").add({
        title,
        description,
        status: "todo",
        priority,
        source: "manual",
        aiGenerated: false,
        aiReason: "",
        sourceType: null,
        sourceId: null,
        assigneeId: auth.userId,
        assigneeName: userName,
        createdBy: auth.userId,
        createdByName: userName,
        companyId,
        companyName,
        projectId: null,
        projectName: null,
        meetingId: null,
        meetingTitle: null,
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        completedAt: null,
        checklist: [],
        comments: "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { taskId: ref.id };
    });

    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
