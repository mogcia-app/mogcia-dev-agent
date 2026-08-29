import { FieldValue } from "firebase-admin/firestore";
import { auditCredential, createSecret, credentialMetadataPayload, deleteSecret, requireCompanyAccess, serializeDocument, WorkspaceError, workspaceFailure } from "@/lib/server/company-workspace";

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await params; const { db } = await requireCompanyAccess(request, companyId, true);
    const snapshot = await db.collection("companyCredentials").where("companyId", "==", companyId).get();
    const credentials = snapshot.docs.map((doc) => { const value = serializeDocument(doc.id, doc.data()); delete value.secretReference; return value; }).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return Response.json({ success: true, data: { credentials } });
  } catch (error) { return workspaceFailure(error, "アクセス情報を取得できませんでした。"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  let secretReference: string | null = null;
  try {
    const { companyId } = await params; const { db, user } = await requireCompanyAccess(request, companyId, true);
    const body = await request.json() as Record<string, unknown>; const secret = typeof body.secret === "string" ? body.secret : "";
    if (!secret || secret.length > 20_000) throw new WorkspaceError("パスワードまたは秘密情報を入力してください。");
    const ref = db.collection("companyCredentials").doc();
    secretReference = await createSecret(ref.id, secret);
    await ref.set({ companyId, ...credentialMetadataPayload(body), secretReference, createdBy: user.uid, createdByName: user.name ?? user.email ?? "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await auditCredential({ credentialId: ref.id, companyId, action: "create", user });
    return Response.json({ success: true, data: { id: ref.id } }, { status: 201 });
  } catch (error) {
    if (secretReference) await deleteSecret(secretReference).catch(() => undefined);
    return workspaceFailure(error, "アクセス情報を作成できませんでした。");
  }
}
