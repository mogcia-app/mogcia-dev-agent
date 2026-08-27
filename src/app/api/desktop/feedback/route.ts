import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

const allowedImageTypes = new Set(["image/png", "image/jpeg"]);
const maxImageBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const message = stringValue(body.message).slice(0, 10_000);
    if (message.length < 3) throw new Error("フィードバックを3文字以上入力してください。");
    const category = normalizeCategory(body.category);
    const image = decodeImage(body.imageBase64, body.imageContentType);
    const feedbackId = randomUUID();
    let imageStoragePath: string | null = null;

    if (image) {
      const extension = image.contentType === "image/png" ? "png" : "jpg";
      imageStoragePath = `desktop-feedback/${user.uid}/${feedbackId}.${extension}`;
      await getAdminStorageBucket().file(imageStoragePath).save(image.buffer, {
        contentType: image.contentType,
        resumable: false,
        metadata: { cacheControl: "private, no-store" }
      });
    }

    await getAdminDb().collection("desktopFeedback").doc(feedbackId).set({
      userId: user.uid,
      userEmail: user.email ?? null,
      category,
      message,
      appVersion: stringValue(body.appVersion).slice(0, 40) || null,
      systemVersion: stringValue(body.systemVersion).slice(0, 120) || null,
      imageStoragePath,
      status: "new",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return Response.json({ success: true, data: { feedbackId } });
  } catch (error) {
    return Response.json({ success: false, error: { message: error instanceof Error ? error.message : "送信できませんでした。" } }, { status: 400 });
  }
}

function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function normalizeCategory(value: unknown): string {
  const category = stringValue(value);
  return ["ui", "bug", "request", "other"].includes(category) ? category : "other";
}
function decodeImage(base64: unknown, contentTypeValue: unknown): { buffer: Buffer; contentType: string } | null {
  if (!base64) return null;
  const contentType = stringValue(contentTypeValue);
  if (!allowedImageTypes.has(contentType)) throw new Error("画像はPNGまたはJPEGを選択してください。");
  const encoded = stringValue(base64);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("画像データが不正です。");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > maxImageBytes) throw new Error("画像は5MB以下にしてください。");
  return { buffer, contentType };
}
