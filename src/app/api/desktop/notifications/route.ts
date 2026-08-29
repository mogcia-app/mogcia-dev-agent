import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";

export async function GET(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request);
    const snapshot = await getAdminDb().collection("agentNotifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(100).get();
    const notifications = snapshot.docs.map((entry) => {
      const data = entry.data();
      const priority = data.priority === "high" || data.priority === "medium" || data.priority === "low" ? data.priority : inferPriority(String(data.type ?? ""), String(data.title ?? ""), String(data.message ?? ""));
      return {
        id: entry.id,
        title: String(data.title ?? ""),
        message: String(data.message ?? ""),
        type: String(data.type ?? "info"),
        source: String(data.source ?? "system"),
        handlingStatus: String(data.handlingStatus ?? (data.read ? "read" : "unread")),
        read: Boolean(data.read),
        targetUrl: typeof data.targetUrl === "string" ? data.targetUrl : null,
        createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
        priority
      };
    }).sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));
    return Response.json({ success: true, data: { notifications } });
  } catch (error) {
    return Response.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を取得できませんでした。" } }, { status: 400 });
  }
}

function inferPriority(type: string, title: string, message: string) {
  const text = `${title} ${message}`;
  if (["error", "urgent"].includes(type) || /至急|期限切れ|今日中|失敗|エラー/.test(text)) return "high";
  if (["warning", "task", "reminder"].includes(type) || /期限|予定|対応/.test(text)) return "medium";
  return "low";
}
function priorityScore(value: string) { return value === "high" ? 3 : value === "medium" ? 2 : 1; }

export async function PATCH(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (!["mark_all_read", "mark_read", "mark_done"].includes(action)) throw new Error("通知の操作内容が不正です。");
    const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";
    const snapshot = await getAdminDb().collection("agentNotifications").where("userId", "==", user.uid).limit(200).get();
    const targets = snapshot.docs.filter((entry) => action === "mark_all_read" ? !entry.data().read && entry.data().handlingStatus !== "done" : entry.id === notificationId);
    const batch = getAdminDb().batch();
    targets.forEach((entry) => batch.set(entry.ref, { read: true, handlingStatus: action === "mark_done" ? "done" : "read", handledAt: FieldValue.serverTimestamp(), handledBy: user.uid }, { merge: true }));
    if (targets.length) await batch.commit();
    return Response.json({ success: true, data: { updated: targets.length } });
  } catch (error) {
    return Response.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を更新できませんでした。" } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const scope = String(body.scope ?? "all");
    const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";
    if (!["all", "unread", "done", "e2e", "single"].includes(scope)) throw new Error("削除対象が不正です。");
    const snapshot = await getAdminDb().collection("agentNotifications").where("userId", "==", user.uid).limit(200).get();
    const targets = snapshot.docs.filter((entry) => {
      const data = entry.data();
      if (scope === "all") return true;
      if (scope === "single") return entry.id === notificationId;
      if (scope === "e2e") return data.source === "e2e";
      if (scope === "done") return data.handlingStatus === "done";
      return !data.read && (!data.handlingStatus || data.handlingStatus === "unread");
    });
    const batch = getAdminDb().batch();
    targets.forEach((entry) => batch.delete(entry.ref));
    if (targets.length) await batch.commit();
    return Response.json({ success: true, data: { deleted: targets.length } });
  } catch (error) {
    return Response.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を削除できませんでした。" } }, { status: 400 });
  }
}
