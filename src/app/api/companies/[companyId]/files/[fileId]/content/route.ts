import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { authenticateBusinessRequest, businessFailure } from "@/lib/server/business/api";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string; fileId: string }> }) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { companyId, fileId } = await context.params;
    const snapshot = await auth.db.collection("companies").doc(companyId).collection("files").doc(fileId).get();
    if (!snapshot.exists) throw new Error("ファイルが見つかりません。");
    const data = snapshot.data() ?? {};
    const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";
    if (!storagePath.startsWith(`companies/${companyId}/files/`)) throw new Error("ファイルの保存先が正しくありません。");
    const file = getAdminStorageBucket().file(storagePath);
    const [[content], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
    return new Response(new Blob([new Uint8Array(content)]), {
      headers: {
        "content-type": metadata.contentType || "application/octet-stream",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(data.name ?? "file"))}`,
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    return businessFailure(error);
  }
}
