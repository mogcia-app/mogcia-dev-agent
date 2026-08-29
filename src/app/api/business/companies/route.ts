import {
  authenticateBusinessRequest,
  businessFailure,
  businessSuccess,
  defaultBusinessFields,
  cleanPatchBody,
  findCollectionNameDuplicates,
  nullableString,
  optionalString,
  requireString,
  serializeDoc,
  updateBusinessFields,
  withBusinessAudit,
  assertFreshUpdate,
  type BusinessAuth
} from "@/lib/server/business/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const data = await withBusinessAudit(auth, "business_company_read", async () => {
      const snapshot = await auth.db.collection("companies").orderBy("updatedAt", "desc").limit(500).get();
      return { companies: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())).filter((company) => company.status !== "archived") };
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
    const name = requireString(body.name, "会社名");
    const force = body.force === true;
    const data = await withBusinessAudit(auth, "business_company_create", async () => {
      const duplicates = await findCollectionNameDuplicates(auth.db, "companies", name, ["name", "nameKana"]);
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates };
      const ref = await auth.db.collection("companies").add(companyPayload(auth, body, name));
      return { id: ref.id, companyId: ref.id, requiresConfirmation: false };
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
    const companyId = requireString(body.id ?? body.companyId, "会社ID", 160);
    const ref = auth.db.collection("companies").doc(companyId);
    const data = await withBusinessAudit(auth, "business_company_update", async () => {
      await assertFreshUpdate(ref, body.updatedAt);
      const name = typeof body.name === "string" ? body.name.trim() : undefined;
      await ref.set({ ...cleanPatchBody(body), ...(name ? { name } : {}), ...updateBusinessFields(auth) }, { merge: true });
      const next = await ref.get();
      return { company: serializeDoc(next.id, next.data() ?? {}) };
    }, companyId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function companyPayload(auth: BusinessAuth, body: Record<string, unknown>, name: string) {
  return {
    name,
    nameKana: optionalString(body.nameKana, 200),
    industry: optionalString(body.industry, 120),
    companyType: optionalString(body.companyType, 120),
    postalCode: optionalString(body.postalCode, 40),
    prefecture: optionalString(body.prefecture, 120),
    city: optionalString(body.city, 120),
    region: optionalString(body.region, 120),
    address: optionalString(body.address, 500),
    phone: optionalString(body.phone, 80),
    email: optionalString(body.email, 160),
    website: optionalString(body.website, 300),
    status: optionalString(body.status, 40) || "lead",
    customerRank: optionalString(body.customerRank, 20) || "C",
    contacts: Array.isArray(body.contacts) ? body.contacts : [],
    primaryContactId: nullableString(body.primaryContactId, 160),
    primaryContactName: nullableString(body.primaryContactName, 120),
    internalOwnerId: nullableString(body.internalOwnerId, 160) ?? auth.userId,
    internalOwnerName: nullableString(body.internalOwnerName, 160) ?? auth.userName,
    companionUserIds: Array.isArray(body.companionUserIds) ? body.companionUserIds : [],
    companionNames: Array.isArray(body.companionNames) ? body.companionNames : [],
    productIds: Array.isArray(body.productIds) ? body.productIds : [],
    productNames: Array.isArray(body.productNames) ? body.productNames : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    favoriteUserIds: [],
    notes: optionalString(body.notes, 5000),
    ...defaultBusinessFields(auth)
  };
}
