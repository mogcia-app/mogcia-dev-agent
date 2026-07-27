import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
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
      const companyRef = auth.db.collection("companies").doc(companyId);
      const companySnapshot = await companyRef.get();
      if (!companySnapshot.exists) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
      const companyName = String(companySnapshot.data()?.name ?? "");
      const batch = auth.db.batch();
      const activityLogRef = activityLog ? companyRef.collection("activityLogs").doc() : null;
      const taskRefs = tasks.map(() => auth.db.collection("tasks").doc());
      const noteRefs = companyNotes.map(() => companyRef.collection("memos").doc());
      const memoRef = memoId ? auth.db.collection("desktopMemos").doc(memoId) : auth.db.collection("desktopMemos").doc();

      if (activityLog && activityLogRef) {
        batch.set(activityLogRef, {
          companyId,
          type: activityLog.type,
          title: activityLog.title,
          content: activityLog.content,
          occurredAt: Timestamp.fromDate(activityLog.occurredAt ?? new Date()),
          userId: auth.userId,
          userName,
          attachments: [],
          nextAction: null,
          aiTaskRequested: false,
          aiTaskGeneratedIds: [],
          source: "manual",
          createdBy: auth.userId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        batch.update(companyRef, {
          lastContactAt: Timestamp.fromDate(activityLog.occurredAt ?? new Date()),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      tasks.forEach((task, index) => {
        batch.set(taskRefs[index], {
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
          dueDate: task.dueDate ? Timestamp.fromDate(task.dueDate) : null,
          completedAt: null,
          checklist: [],
          comments: task.reason,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });

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
          committedActivityLogId: activityLogRef?.id ?? null,
          committedTaskIds: taskRefs.map((ref) => ref.id),
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
        activityLogId: activityLogRef?.id ?? null,
        taskIds: taskRefs.map((ref) => ref.id),
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
  const type = typeof source.type === "string" && activityTypes.includes(source.type as (typeof activityTypes)[number]) ? source.type : "other";
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
