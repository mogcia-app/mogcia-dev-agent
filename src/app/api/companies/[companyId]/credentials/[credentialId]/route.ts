import { FieldValue } from "firebase-admin/firestore";
import { auditCredential, credentialMetadataPayload, deleteSecret, requireCompanyAccess, updateSecret, WorkspaceError, workspaceFailure } from "@/lib/server/company-workspace";

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; credentialId: string }> }) {
  try {
    const { companyId, credentialId } = await params; const { db, user } = await requireCompanyAccess(request, companyId, true);
    const ref = db.collection("companyCredentials").doc(credentialId); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.companyId !== companyId) throw new WorkspaceError("アクセス情報が見つかりません。", 404);
    const body = await request.json() as Record<string, unknown>; const secret = typeof body.secret === "string" ? body.secret : "";
    if (secret) { if (secret.length > 20_000) throw new WorkspaceError("秘密情報が長すぎます。"); await updateSecret(String(snapshot.data()?.secretReference), secret); }
    await ref.update({ ...credentialMetadataPayload(body), updatedAt: FieldValue.serverTimestamp() });
    await auditCredential({ credentialId, companyId, action: "update", user });
    return Response.json({ success: true, data: { id: credentialId } });
  } catch (error) { return workspaceFailure(error, "アクセス情報を更新できませんでした。"); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ companyId: string; credentialId: string }> }) {
  try {
    const { companyId, credentialId } = await params; const { db, user } = await requireCompanyAccess(request, companyId, true);
    const ref = db.collection("companyCredentials").doc(credentialId); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.companyId !== companyId) throw new WorkspaceError("アクセス情報が見つかりません。", 404);
    await deleteSecret(String(snapshot.data()?.secretReference)); await ref.delete();
    await auditCredential({ credentialId, companyId, action: "delete", user });
    return Response.json({ success: true, data: { id: credentialId } });
  } catch (error) { return workspaceFailure(error, "アクセス情報を削除できませんでした。"); }
}
