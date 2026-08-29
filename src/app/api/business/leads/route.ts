import { assertFreshUpdate, authenticateBusinessRequest, businessFailure, businessSuccess, cleanPatchBody, findTimeDuplicates, nullableString, requireString, serializeDoc, updateBusinessFields, withBusinessAudit } from "@/lib/server/business/api";
import { createLeadForUser } from "@/lib/server/leads/repository";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const data = await withBusinessAudit(auth, "business_lead_read", async () => {
      const snapshot = await auth.db.collection("leads").orderBy("updatedAt", "desc").limit(500).get();
      return { leads: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())) };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const companyName = requireString(body.companyName, "見込み客の会社名");
    const force = body.force === true;
    const data = await withBusinessAudit(auth, "business_lead_create", async () => {
      const duplicates = await findTimeDuplicates(auth.db, "leads", { title: companyName, companyId: nullableString(body.companyId) });
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates };
      const result = await createLeadForUser(body, { uid: auth.userId, name: auth.userName });
      return { ...result, leadId: result.id, requiresConfirmation: false };
    });
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const leadId = requireString(body.id ?? body.leadId, "見込み客ID", 160);
    const ref = auth.db.collection("leads").doc(leadId);
    const data = await withBusinessAudit(auth, "business_lead_update", async () => {
      await assertFreshUpdate(ref, body.updatedAt);
      await ref.set({ ...cleanPatchBody(body), ...updateBusinessFields(auth) }, { merge: true });
      const next = await ref.get();
      return { lead: serializeDoc(next.id, next.data() ?? {}) };
    }, leadId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
