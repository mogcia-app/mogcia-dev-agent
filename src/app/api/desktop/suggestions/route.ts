import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request); const db = getAdminDb();
    const [companies, states] = await Promise.all([db.collection("companies").orderBy("updatedAt", "desc").limit(150).get(), db.collection("desktopSuggestionStates").where("userId", "==", user.uid).limit(300).get()]);
    const hidden = new Set(states.docs.filter((entry) => ["dismissed", "done"].includes(String(entry.data().status))).map((entry) => String(entry.data().suggestionId)));
    const dismissedByType = states.docs.filter((entry) => entry.data().status === "dismissed").reduce<Record<string, number>>((counts, entry) => { const type = String(entry.data().suggestionId || "").split("-")[0]; counts[type] = (counts[type] || 0) + 1; return counts; }, {});
    const suggestions = companies.docs.flatMap((entry) => {
      const data = entry.data(); const name = String(data.name || "会社"); const result: Array<Record<string, unknown>> = [];
      if (!data.nextActionTitle) result.push({ id: `next-${entry.id}`, companyId: entry.id, companyName: name, priority: "high", title: "次回対応を設定", reason: `${name}の次回アクションが未設定です。`, suggestedAction: `${name}へ次回連絡する` });
      const last = data.lastContactAt?.toDate?.(); const days = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null;
      if (days !== null && days >= 7) result.push({ id: `stale-${entry.id}`, companyId: entry.id, companyName: name, priority: days >= 14 ? "high" : "medium", title: "フォロー連絡", reason: `最終接触から${days}日経過しています。`, suggestedAction: `${name}へ状況確認の連絡をする` });
      return result;
    }).filter((entry) => !hidden.has(String(entry.id)) && (dismissedByType[String(entry.id).split("-")[0]] || 0) < 3).slice(0, 8);
    return NextResponse.json({ success: true, data: { suggestions } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request); const body = await request.json() as Record<string, unknown>;
    const suggestionId = String(body.suggestionId || ""); const action = String(body.action || "");
    if (!suggestionId || !["create_task", "done", "dismiss"].includes(action)) throw new Error("提案操作が正しくありません。");
    const db = getAdminDb();
    if (action === "create_task") {
      const title = String(body.suggestedAction || body.title || "フォロー対応").slice(0, 200); const companyId = String(body.companyId || "") || null; const companyName = String(body.companyName || "") || null; const userName = getUserDisplayNameById(user.uid, user.name || user.email || null);
      await db.collection("tasks").add({ title, description: String(body.reason || "AI提案から作成"), status: "todo", priority: body.priority === "high" ? "high" : "medium", source: "manual", aiGenerated: true, aiReason: String(body.reason || ""), assigneeId: user.uid, assigneeName: userName, createdBy: user.uid, createdByName: userName, companyId, companyName, dueDate: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000), completedAt: null, checklist: [], comments: "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    await db.collection("desktopSuggestionStates").doc(`${user.uid}_${suggestionId}`).set({ userId: user.uid, suggestionId, status: action === "dismiss" ? "dismissed" : "done", lastAction: action, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ success: true, data: { message: action === "create_task" ? "提案をタスクにしました。" : action === "done" ? "対応済みにしました。" : "提案を表示しないようにしました。" } });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) { return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "suggestion_failed" } }, { status: 400 }); }
