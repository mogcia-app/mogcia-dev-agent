import { auditCredential, readSecret, requireCompanyAccess, WorkspaceError, workspaceFailure } from "@/lib/server/company-workspace";

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string; credentialId: string }> }) {
  try {
    const { companyId, credentialId } = await params; const { db, user } = await requireCompanyAccess(request, companyId, true);
    const snapshot = await db.collection("companyCredentials").doc(credentialId).get();
    if (!snapshot.exists || snapshot.data()?.companyId !== companyId) throw new WorkspaceError("アクセス情報が見つかりません。", 404);
    const secret = await readSecret(String(snapshot.data()?.secretReference));
    const action = new URL(request.url).searchParams.get("action") === "copy" ? "copy" : "reveal";
    await auditCredential({ credentialId, companyId, action, user });
    return Response.json({ success: true, data: { secret } }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  } catch (error) { return workspaceFailure(error, "秘密情報を取得できませんでした。"); }
}
