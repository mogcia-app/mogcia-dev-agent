import { FieldValue } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess, optionalString, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const category = requireString(body.category, "カテゴリ", 80);
    const content = requireString(body.content, "内容", 5000);
    const images = Array.isArray(body.images) ? body.images.filter((item) => typeof item === "string").slice(0, 3) : [];
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "feedback_create", async () => {
      const ref = await auth.db.collection("feedback").add({
        userId: auth.userId,
        deviceId: auth.device.id,
        category,
        content,
        images,
        appVersion: optionalString(body.appVersion, "バージョン", 80),
        source: "desktop",
        status: "new",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { feedbackId: ref.id };
    });
    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
