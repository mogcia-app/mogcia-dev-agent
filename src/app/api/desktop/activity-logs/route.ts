import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { ActivityLogType } from "@/types/company";

const activityTypes: ActivityLogType[] = ["phone", "email", "visit", "meeting", "memo", "other"];

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "会社ID", 120);
    const type = typeof body.type === "string" && activityTypes.includes(body.type as ActivityLogType) ? body.type as ActivityLogType : "other";
    const title = requireString(body.title, "タイトル", 200);
    const content = optionalString(body.content, "内容", 10_000);
    const occurredAt = parseIsoDate(body.occurredAt, "発生日") ?? new Date();
    const userName = getUserDisplayNameById(auth.userId);

    const data = await withDesktopAudit(context, "activity_create", async () => {
      const companyRef = auth.db.collection("companies").doc(companyId);
      const companySnapshot = await companyRef.get();
      if (!companySnapshot.exists) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
      const logRef = companyRef.collection("activityLogs").doc();
      await auth.db.runTransaction(async (transaction) => {
        transaction.set(logRef, {
          companyId,
          type,
          title,
          content,
          occurredAt: Timestamp.fromDate(occurredAt),
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
        transaction.update(companyRef, {
          lastContactAt: Timestamp.fromDate(occurredAt),
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      return { activityLogId: logRef.id };
    }, companyId);

    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
