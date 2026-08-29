import { FieldValue } from "firebase-admin/firestore";
import { companyServicePayload, requireCompanyAccess, requireCompanyManager, serializeDocument, workspaceFailure } from "@/lib/server/company-workspace";

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await params;
    const { db } = await requireCompanyAccess(request, companyId);
    const snapshot = await db.collection("companyServices").where("companyId", "==", companyId).get();
    const services = snapshot.docs.map((doc) => serializeDocument(doc.id, doc.data())).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return Response.json({ success: true, data: { services } });
  } catch (error) { return workspaceFailure(error, "サービスを取得できませんでした。"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await params;
    const { db, user } = await requireCompanyManager(request, companyId);
    const payload = companyServicePayload(await request.json() as Record<string, unknown>);
    const ref = await db.collection("companyServices").add({ companyId, ...payload, createdBy: user.uid, createdByName: user.name ?? user.email ?? "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ success: true, data: { id: ref.id } }, { status: 201 });
  } catch (error) { return workspaceFailure(error, "サービスを追加できませんでした。"); }
}
