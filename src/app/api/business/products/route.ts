import { assertFreshUpdate, authenticateBusinessRequest, businessFailure, businessSuccess, cleanPatchBody, defaultBusinessFields, findCollectionNameDuplicates, nullableString, optionalString, requireString, serializeDoc, slugFromName, updateBusinessFields, withBusinessAudit, type BusinessAuth } from "@/lib/server/business/api";

const productTypes = ["own_product", "operation_service", "web_production", "custom_development", "sales_package", "other"];
const statuses = ["active", "draft", "paused", "archived"];

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const data = await withBusinessAudit(auth, "business_product_read", async () => {
      const snapshot = await auth.db.collection("products").orderBy("updatedAt", "desc").limit(500).get();
      return { products: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())).filter((product) => product.status !== "archived") };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireString(body.name, "商品名");
    const force = body.force === true;
    const data = await withBusinessAudit(auth, "business_product_create", async () => {
      const duplicates = await findCollectionNameDuplicates(auth.db, "products", name, ["name", "displayName"]);
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates };
      const ref = await auth.db.collection("products").add(productPayload(auth, body, name));
      return { id: ref.id, productId: ref.id, requiresConfirmation: false };
    });
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const productId = requireString(body.id ?? body.productId, "商品ID", 160);
    const ref = auth.db.collection("products").doc(productId);
    const data = await withBusinessAudit(auth, "business_product_update", async () => {
      await assertFreshUpdate(ref, body.updatedAt);
      await ref.set({ ...cleanPatchBody(body), ...updateBusinessFields(auth) }, { merge: true });
      const next = await ref.get();
      return { product: serializeDoc(next.id, next.data() ?? {}) };
    }, productId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function productPayload(auth: BusinessAuth, body: Record<string, unknown>, name: string) {
  return {
    name,
    displayName: optionalString(body.displayName, 200) || name,
    slug: optionalString(body.slug, 200) || slugFromName(name),
    productType: typeof body.productType === "string" && productTypes.includes(body.productType) ? body.productType : "other",
    categoryIds: [],
    categoryNames: Array.isArray(body.categoryNames) ? body.categoryNames : [],
    tagline: optionalString(body.tagline, 300),
    summary: optionalString(body.summary, 5000),
    status: typeof body.status === "string" && statuses.includes(body.status) ? body.status : "draft",
    target: { industries: [], regions: [], companySizes: [], facilitySizes: [], roles: [], decisionMakerRoles: [], suitableConditions: [], unsuitableConditions: [], requiredConditions: [], disqualificationConditions: [], idealCustomerConditions: [], lowPotentialConditions: [], winningPatterns: [], losingPatterns: [], effectivePhrases: [], avoidPhrases: [], industryProposalAngles: [] },
    pricing: { displayType: "estimate", plans: [], options: [], paymentTerms: "", renewalTerms: "", cancellationTerms: "", notes: "" },
    features: [],
    implementation: { flowSteps: [], initialSetup: [], clientRequirements: [], mogciaResponsibilities: [], supportDetails: [], deliverables: [], operationFlow: [], notes: [] },
    objectionHandbook: [],
    salesSettings: { salesStages: [], objectionCategories: [], lossReasonCategories: [], leadTemperatureOptions: [], disqualificationConditions: [], requiredHearingItems: [], salesPlaybooks: { teleapo: { new: emptyPlaybook(), existing: emptyPlaybook() }, meeting: { new: emptyPlaybook(), existing: emptyPlaybook() } }, notes: [] },
    resources: [],
    ownerId: nullableString(body.ownerId, 160) ?? auth.userId,
    ownerName: nullableString(body.ownerName, 160) ?? auth.userName,
    favoriteUserIds: [],
    ...defaultBusinessFields(auth)
  };
}

function emptyPlaybook() {
  return { proposalDirection: "", process: "", keyQuestions: [], talkScript: "", materials: [], cautions: [] };
}
