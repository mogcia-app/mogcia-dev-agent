import { FieldValue } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const fileName = requireString(body.fileName, "ファイル名", 240).replace(/[^a-zA-Z0-9._-]/g, "-");
    const contentType = body.contentType === "video/mp4" ? "video/mp4" : "audio/mp4";
    const size = typeof body.size === "number" ? body.size : 0;
    if (size <= 0 || size > 250 * 1024 * 1024) throw new Error("音声ファイルは250MB以内にしてください。");
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "analysis_upload_prepare", async () => {
      const record = await auth.db.collection("teleapoRecords").add({ userId: auth.userId, userName: getUserDisplayNameById(auth.userId), salesDomain: "meeting", customerName: "", contactName: "", productName: "", recordedAt: FieldValue.serverTimestamp(), transcriptionStatus: "uploading", aiAdviceStatus: "idle", conversationLogs: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      const storagePath = `teleapoRecords/${auth.userId}/${record.id}/${Date.now()}-${fileName}`;
      const [uploadURL] = await getAdminStorageBucket().file(storagePath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60 * 1000, contentType });
      await record.set({ audioFilePath: storagePath }, { merge: true });
      return { recordId: record.id, uploadURL, storagePath };
    });
    return desktopSuccess(data, 201);
  } catch (error) { return desktopFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const recordId = requireString(body.recordId, "分析ID", 160);
    const durationSec = typeof body.durationSec === "number" ? body.durationSec : 0;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "analysis_upload_complete", async () => {
      const ref = auth.db.collection("teleapoRecords").doc(recordId); const snapshot = await ref.get();
      if (!snapshot.exists || snapshot.data()?.userId !== auth.userId) throw new Error("アップロードした商談が見つかりません。");
      const storagePath = String(snapshot.data()?.audioFilePath ?? "");
      const [audioDownloadUrl] = await getAdminStorageBucket().file(storagePath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      await ref.set({ audioDownloadUrl, audioDurationSec: durationSec, transcriptionStatus: "uploaded", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { recordId, targetURL: `/sales/upload?recordId=${recordId}`, message: "音声を保存しました。解析内容を確認できます。" };
    }, recordId);
    return desktopSuccess(data);
  } catch (error) { return desktopFailure(error); }
}
