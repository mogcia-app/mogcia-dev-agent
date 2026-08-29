import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { assertFreshUpdate, authenticateBusinessRequest, businessFailure, businessSuccess, cleanPatchBody, defaultBusinessFields, findTimeDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, updateBusinessFields, withBusinessAudit, type BusinessAuth } from "@/lib/server/business/api";

const activityTypes = ["call", "email", "document", "meeting", "telemarketing", "note", "status_change", "other"];

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");
    const companyId = searchParams.get("companyId");
    const data = await withBusinessAudit(auth, "business_activity_read", async () => {
      let query: FirebaseFirestore.Query = auth.db.collection("activities");
      if (leadId) query = query.where("leadId", "==", leadId);
      if (companyId) query = query.where("companyId", "==", companyId);
      const snapshot = await query.orderBy("occurredAt", "desc").limit(500).get();
      return { activities: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())) };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "活動タイトル");
    const occurredAt = parseDate(body.occurredAt) ?? Timestamp.now();
    const force = body.force === true;
    const data = await withBusinessAudit(auth, "business_activity_create", async () => {
      const duplicates = await findTimeDuplicates(auth.db, "activities", {
        title,
        companyId: nullableString(body.companyId),
        occurredAt: occurredAt.toDate()
      });
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates };
      const ref = await auth.db.collection("activities").add(activityPayload(auth, body, title, occurredAt));
      await updateRelatedLastActivity(auth, body, occurredAt);
      return { id: ref.id, activityId: ref.id, requiresConfirmation: false };
    });
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createActivityLogs");
    const body = (await request.json()) as Record<string, unknown>;
    const activityId = requireString(body.id ?? body.activityId, "活動ログID", 160);
    const ref = auth.db.collection("activities").doc(activityId);
    const data = await withBusinessAudit(auth, "business_activity_update", async () => {
      const snapshot = await assertFreshUpdate(ref, body.updatedAt);
      const previous = snapshot.data() ?? {};
      await ref.set({
        ...cleanPatchBody(body),
        occurredAt: body.occurredAt === undefined ? previous.occurredAt ?? Timestamp.now() : parseDate(body.occurredAt),
        ...updateBusinessFields(auth)
      }, { merge: true });
      const next = await ref.get();
      return { activity: serializeDoc(next.id, next.data() ?? {}) };
    }, activityId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function activityPayload(auth: BusinessAuth, body: Record<string, unknown>, title: string, occurredAt: FirebaseFirestore.Timestamp) {
  const type = typeof body.type === "string" && activityTypes.includes(body.type) ? body.type : "note";
  return {
    leadId: nullableString(body.leadId, 160),
    companyId: nullableString(body.companyId, 160),
    dealId: nullableString(body.dealId, 160),
    type,
    title,
    content: optionalString(body.content, 5000),
    productId: nullableString(body.productId, 160),
    productName: nullableString(body.productName, 200),
    audioId: nullableString(body.audioId, 160),
    transcriptId: nullableString(body.transcriptId, 160),
    analysisId: nullableString(body.analysisId, 160),
    legacyCompanyActivityLogId: nullableString(body.legacyCompanyActivityLogId, 160),
    nextActionAt: parseDate(body.nextActionAt),
    nextActionTitle: nullableString(body.nextActionTitle, 200),
    occurredAt,
    ...defaultBusinessFields(auth)
  };
}

async function updateRelatedLastActivity(auth: BusinessAuth, body: Record<string, unknown>, occurredAt: FirebaseFirestore.Timestamp) {
  const nextActionAt = parseDate(body.nextActionAt);
  const nextActionTitle = nullableString(body.nextActionTitle, 200);
  const patch = { lastActivityAt: occurredAt, nextActionAt, nextActionTitle, updatedAt: FieldValue.serverTimestamp() };
  const leadId = nullableString(body.leadId, 160);
  const companyId = nullableString(body.companyId, 160);
  if (leadId) await auth.db.collection("leads").doc(leadId).set(patch, { merge: true });
  if (companyId) await auth.db.collection("companies").doc(companyId).set({ lastContactAt: occurredAt, nextActionAt, nextActionTitle, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
