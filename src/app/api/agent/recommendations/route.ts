import { FieldValue } from "firebase-admin/firestore";
import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, serializeDoc } from "@/lib/server/business/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readTasks");
    const snapshot = await auth.db.collection("tasks").where("assigneeId", "==", auth.userId).orderBy("createdAt", "desc").limit(20).get();
    const recommendations = snapshot.docs
      .map((entry) => serializeDoc(entry.id, entry.data()))
      .filter((task) => task.status !== "completed" && task.status !== "cancelled")
      .slice(0, 6)
      .map((task) => ({
        id: `task:${task.id}`,
        type: "task_follow_up",
        title: task.title,
        message: task.companyName ? `${task.companyName} の次回対応を確認してください。` : "未完了タスクを確認してください。",
        targetId: task.id,
        targetURL: "/tasks",
        status: "active"
      }));
    return businessSuccess({ recommendations });
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const recommendationId = requireString(body.recommendationId ?? body.id, "提案ID", 200);
    const status = body.status === "dismissed" || body.status === "completed" ? body.status : "read";
    await auth.db.collection("agentRecommendations").doc(recommendationId.replaceAll("/", ":")).set({
      userId: auth.userId,
      recommendationId,
      status,
      source: auth.source,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return businessSuccess({ id: recommendationId, status });
  } catch (error) {
    return businessFailure(error);
  }
}
