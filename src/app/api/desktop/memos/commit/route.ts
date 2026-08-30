import { FieldValue } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { createActivity, type LegacyActivityLogType } from "@/lib/server/business/activity-service";
import { getCompanyById } from "@/lib/server/business/company-service";
import { createTask } from "@/lib/server/business/task-service";
import { getUserDisplayNameById } from "@/lib/user-display";

const priorities = ["high", "medium", "low"] as const;
const activityTypes = ["phone", "email", "visit", "meeting", "memo", "other"] as const;

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    if (!auth.device.permissions.createTasks) throw new DesktopApiError("FORBIDDEN", "タスク作成権限がありません", 403);
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "会社ID", 120);
    const originalText = requireString(body.originalText, "元メモ", 10_000);
    const memoId = optionalString(body.memoId, "メモID", 120) || null;
    const activityLog = normalizeActivity(body.activityLog);
    const tasks = normalizeTasks(body.tasks);
    const companyNotes = normalizeNotes(body.companyNotes);
    const userName = getUserDisplayNameById(auth.userId);

    const data = await withDesktopAudit(context, "memo_commit", async () => {
      const company = await getCompanyById(toBusinessAuth(auth), companyId).catch(() => null);
      if (!company) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
      const companyName = String(company.name ?? "");
      const companyRef = auth.db.collection("companies").doc(companyId);
      const batch = auth.db.batch();
      const noteRefs = companyNotes.map(() => companyRef.collection("memos").doc());
      const memoRef = memoId ? auth.db.collection("desktopMemos").doc(memoId) : auth.db.collection("desktopMemos").doc();
      const committedActivity = activityLog
        ? await createActivity(toBusinessAuth(auth), {
          companyId,
          companyName,
          activityType: activityLog.type,
          title: activityLog.title,
          content: activityLog.content,
          occurredAt: (activityLog.occurredAt ?? new Date()).toISOString(),
          force: true
        })
        : null;

      const taskResults = await Promise.all(tasks.map((task) =>
        createTask(toBusinessAuth(auth), {
          title: task.title,
          description: task.description,
          status: "todo",
          priority: task.priority,
          source: "manual",
          aiGenerated: false,
          aiReason: "",
          sourceType: "memo",
          sourceId: memoRef.id,
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
          dueDate: task.dueDate ? task.dueDate.toISOString() : null,
          completedAt: null,
          checklist: [],
          collaboratorIds: [],
          collaboratorNames: [],
          leadId: null,
          leadName: null,
          productId: null,
          productName: null,
          comments: task.reason,
          progressLogs: [],
          force: true
        })
      ));
      const taskIds = taskResults.map((result) => String(result.taskId ?? result.id ?? "")).filter(Boolean);

      companyNotes.forEach((note, index) => {
        batch.set(noteRefs[index], {
          title: "デスクトップメモ",
          content: note.content,
          pinned: false,
          createdBy: auth.userId,
          createdByName: userName,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });

      batch.set(
        memoRef,
        {
          userId: auth.userId,
          text: originalText,
          companyId,
          status: "committed",
          committedActivityId: committedActivity?.activityId ?? null,
          committedActivityLogId: committedActivity?.activityLogId ?? null,
          committedTaskIds: taskIds,
          committedCompanyNoteIds: noteRefs.map((ref) => ref.id),
          createdFrom: body.createdFrom === "menubar" || body.createdFrom === "floating_window" ? body.createdFrom : "cli",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();
      return {
        memoId: memoRef.id,
        activityId: committedActivity?.activityId ?? null,
        activityLogId: committedActivity?.activityLogId ?? null,
        taskIds,
        companyNoteIds: noteRefs.map((ref) => ref.id)
      };
    }, companyId);

    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}

function normalizeActivity(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.selected === false) return null;
  const type: LegacyActivityLogType = typeof source.type === "string" && activityTypes.includes(source.type as (typeof activityTypes)[number]) ? source.type as LegacyActivityLogType : "other";
  return {
    type,
    title: requireString(source.title, "活動ログタイトル", 200),
    content: optionalString(source.content, "活動ログ本文", 10_000),
    occurredAt: parseIsoDate(source.occurredAt, "活動日時")
  };
}

function normalizeTasks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).selected !== false)
    .slice(0, 8)
    .map((item) => {
      const source = item as Record<string, unknown>;
      return {
        title: requireString(source.title, "タスクタイトル", 200),
        description: optionalString(source.description, "タスク説明", 2000),
        dueDate: parseIsoDate(source.dueDate, "期限"),
        priority: typeof source.priority === "string" && priorities.includes(source.priority as (typeof priorities)[number]) ? source.priority : "medium",
        reason: optionalString(source.reason, "理由", 1000)
      };
    });
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).selected !== false)
    .slice(0, 8)
    .map((item) => ({ content: requireString((item as Record<string, unknown>).content, "会社メモ", 10_000) }));
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop" as const,
    deviceId: auth.device.id
  };
}
