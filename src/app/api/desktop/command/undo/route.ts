import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";

const allowedCollections = new Set(["products", "tasks", "companies", "knowledge", "activities", "calendarEvents"]);

export async function POST(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request);
    const body = await request.json() as { undoId?: unknown };
    const undoId = typeof body.undoId === "string" ? body.undoId : "";
    if (!undoId) throw new Error("取り消し情報がありません。");
    const db = getAdminDb(); const operationRef = db.collection("desktopUndoOperations").doc(undoId);
    await db.runTransaction(async (transaction) => {
      const operation = await transaction.get(operationRef); if (!operation.exists) throw new Error("この操作はすでに取り消されています。");
      const data = operation.data() ?? {};
      if (data.userId !== user.uid) throw new Error("この操作は取り消せません。");
      if (!data.expiresAt?.toDate || data.expiresAt.toDate().getTime() < Date.now()) throw new Error("取り消せる時間を過ぎています。");
      if (!allowedCollections.has(String(data.collection))) throw new Error("取り消し対象が正しくありません。");
      const target = db.collection(String(data.collection)).doc(String(data.targetId));
      if (data.mode === "delete") transaction.delete(target);
      else if (data.mode === "restore") transaction.set(target, { ...(data.restoreData ?? {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      else throw new Error("取り消し方法が正しくありません。");
      transaction.delete(operationRef);
    });
    return NextResponse.json({ success: true, data: { message: "直前の操作を元に戻しました。" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "undo_failed" } }, { status: 400 });
  }
}
