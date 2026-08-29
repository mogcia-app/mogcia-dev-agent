import { FieldValue } from "firebase-admin/firestore";
import { companyServicePayload, requireCompanyManager, workspaceFailure } from "@/lib/server/company-workspace";

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; serviceId: string }> }) {
  try {
    const { companyId, serviceId } = await params; const { db } = await requireCompanyManager(request, companyId);
    const ref = db.collection("companyServices").doc(serviceId); const doc = await ref.get();
    if (!doc.exists || doc.data()?.companyId !== companyId) return Response.json({ success: false, error: { message: "サービスが見つかりません。" } }, { status: 404 });
    await ref.update({ ...companyServicePayload(await request.json() as Record<string, unknown>), updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ success: true, data: { id: serviceId } });
  } catch (error) { return workspaceFailure(error, "サービスを更新できませんでした。"); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ companyId: string; serviceId: string }> }) {
  try {
    const { companyId, serviceId } = await params; const { db } = await requireCompanyManager(request, companyId);
    const ref = db.collection("companyServices").doc(serviceId); const doc = await ref.get();
    if (!doc.exists || doc.data()?.companyId !== companyId) return Response.json({ success: false, error: { message: "サービスが見つかりません。" } }, { status: 404 });
    await ref.delete(); return Response.json({ success: true, data: { id: serviceId } });
  } catch (error) { return workspaceFailure(error, "サービスを削除できませんでした。"); }
}
