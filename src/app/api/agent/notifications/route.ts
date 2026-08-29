import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAgentNotification, listAgentNotifications } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const notifications = await listAgentNotifications(user.uid);
    return NextResponse.json({ success: true, data: { notifications } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createAgentNotification({
      userId: user.uid,
      title: String(body.title ?? ""),
      message: String(body.message ?? ""),
      type: typeof body.type === "string" ? body.type : "info",
      runId: typeof body.runId === "string" ? body.runId : null,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : null,
      source: body.source === "business" || body.source === "development" || body.source === "e2e" ? body.source : "system"
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を作成できませんでした。" } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 100) : [];
    const scope = String(body.scope ?? "selected");
    const db = getAdminDb();
    const querySnapshot = ids.length
      ? null
      : await db.collection("agentNotifications").where("userId", "==", user.uid).limit(200).get();
    const snapshots = ids.length
      ? await Promise.all(ids.map((id) => db.collection("agentNotifications").doc(id).get()))
      : querySnapshot?.docs.filter((snapshot) => matchesScope(snapshot.data(), scope)) ?? [];
    if (!snapshots.length) return NextResponse.json({ success: true, data: { deleted: 0 } });
    if (snapshots.some((snapshot) => !snapshot.exists || snapshot.data()?.userId !== user.uid)) throw new Error("操作できない通知が含まれています。");
    const batch = db.batch();
    snapshots.forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
    return NextResponse.json({ success: true, data: { deleted: snapshots.length } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を削除できませんでした。" } }, { status: 400 });
  }
}

function matchesScope(data: FirebaseFirestore.DocumentData, scope: string): boolean {
  if (scope === "all") return true;
  if (scope === "e2e") return data.source === "e2e";
  if (scope === "done") return data.handlingStatus === "done";
  if (scope === "unread") return !data.read && (!data.handlingStatus || data.handlingStatus === "unread");
  return false;
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 40) : [];
    const status = String(body.status ?? "");
    if (!ids.length || !["read", "done", "snoozed"].includes(status)) throw new Error("通知の操作内容が不正です。");
    const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 2000) : "";
    const snoozedUntil = status === "snoozed" && typeof body.snoozedUntil === "string" ? new Date(body.snoozedUntil) : null;
    if (status === "snoozed" && (!snoozedUntil || !Number.isFinite(snoozedUntil.getTime()))) throw new Error("延期日時を確認してください。");
    const db = getAdminDb();
    const snapshots = await Promise.all(ids.map((id) => db.collection("agentNotifications").doc(id).get()));
    if (snapshots.some((snapshot) => !snapshot.exists || snapshot.data()?.userId !== user.uid)) throw new Error("操作できない通知が含まれています。");
    const batch = db.batch();
    snapshots.forEach((snapshot) => batch.set(snapshot.ref, {
      handlingStatus: status,
      read: true,
      handlingMemo: memo || null,
      snoozedUntil: snoozedUntil ? Timestamp.fromDate(snoozedUntil) : null,
      handledAt: FieldValue.serverTimestamp(),
      handledBy: user.uid,
    }, { merge: true }));
    await batch.commit();
    return NextResponse.json({ success: true, data: { ids, status } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "通知を更新できませんでした。" } }, { status: 400 });
  }
}
