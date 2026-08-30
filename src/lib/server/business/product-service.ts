import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { timestampToIso } from "@/lib/desktop/format";
import { arrayOfStrings, assertFreshUpdate, BusinessApiError, cleanPatchBody, defaultBusinessFields, findCollectionNameDuplicates, nullableString, optionalString, parseDate, requireString, serializeDoc, slugFromName, updateBusinessFields, type BusinessAuth } from "@/lib/server/business/api";
import type { ProductStatus, ProductType } from "@/types/product";

const COLLECTION = "products";
const productTypes = ["own_product", "operation_service", "web_production", "custom_development", "sales_package", "other"] as const;
const statuses = ["active", "draft", "paused", "archived"] as const;

export type ProductListOptions = {
  limit?: number;
  includeArchived?: boolean;
};

export async function listProducts(auth: BusinessAuth, options: ProductListOptions = {}) {
  const snapshot = await auth.db.collection(COLLECTION).orderBy("updatedAt", "desc").limit(options.limit ?? 500).get();
  return snapshot.docs
    .map((entry) => serializeProduct(entry.id, entry.data()))
    .filter((product) => options.includeArchived || product.status !== "archived");
}

export async function searchProducts(auth: BusinessAuth, query: string, options: ProductListOptions = {}) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];
  return (await listProducts(auth, { ...options, limit: Math.max(options.limit ?? 20, 200) }))
    .filter((product) => matchesProduct(product, keyword))
    .slice(0, options.limit ?? 20);
}

export async function getProductById(auth: BusinessAuth, productId: string) {
  const snapshot = await auth.db.collection(COLLECTION).doc(productId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "商材が見つかりません。", 404);
  return serializeProduct(snapshot.id, snapshot.data() ?? {});
}

export async function createProduct(auth: BusinessAuth, body: Record<string, unknown>) {
  const name = requireString(body.name, "商品名");
  const force = body.force === true;
  const duplicates = await findCollectionNameDuplicates(auth.db, COLLECTION, name, ["name", "displayName"]);
  if (duplicates.length && !force) return { id: null, productId: null, requiresConfirmation: true, duplicates };
  const ref = await auth.db.collection(COLLECTION).add(buildProductPayload(auth, body, name));
  return { id: ref.id, productId: ref.id, requiresConfirmation: false };
}

export async function updateProduct(auth: BusinessAuth, body: Record<string, unknown>) {
  const productId = requireString(body.id ?? body.productId, "商品ID", 160);
  const ref = auth.db.collection(COLLECTION).doc(productId);
  const snapshot = await assertFreshUpdate(ref, body.updatedAt);
  const previous = snapshot.data() ?? {};
  await ref.set(buildProductUpdatePayload(auth, body, previous), { merge: true });
  const next = await ref.get();
  return { product: serializeProduct(next.id, next.data() ?? {}) };
}

export async function updateProductProfile(auth: BusinessAuth, productId: string, profile: Record<string, unknown>) {
  return updateProduct(auth, { ...profile, id: productId });
}

export async function setProductFavorite(auth: BusinessAuth, productId: string, favorite: boolean) {
  const product = await getProductById(auth, productId);
  const currentIds = Array.isArray(product.favoriteUserIds) ? product.favoriteUserIds.map(String) : [];
  const favoriteUserIds = favorite ? Array.from(new Set([...currentIds, auth.userId])) : currentIds.filter((id) => id !== auth.userId);
  const ref = auth.db.collection(COLLECTION).doc(productId);
  await ref.set({ favoriteUserIds, ...updateBusinessFields(auth) }, { merge: true });
  const next = await ref.get();
  return { product: serializeProduct(next.id, next.data() ?? {}) };
}

export async function reorderProducts(auth: BusinessAuth, products: Array<{ id?: unknown; productId?: unknown }>) {
  const batch = auth.db.batch();
  const ids = products.map((product) => nullableString(product.id ?? product.productId, 160)).filter((id): id is string => Boolean(id));
  ids.forEach((id, index) => {
    batch.set(auth.db.collection(COLLECTION).doc(id), { sortOrder: index + 1, ...updateBusinessFields(auth) }, { merge: true });
  });
  if (ids.length) await batch.commit();
  return { ids, updated: ids.length };
}

export async function deleteProduct(auth: BusinessAuth, productId: string) {
  const ref = auth.db.collection(COLLECTION).doc(productId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "商材が見つかりません。", 404);
  await ref.delete();
  return { id: productId, deleted: true };
}

export async function getProductDeletionImpact(auth: BusinessAuth, productId: string) {
  await getProductById(auth, productId);
  const [leads, calendarEvents, tasks, activities] = await Promise.all([
    auth.db.collection("leads").where("productId", "==", productId).limit(1000).get(),
    auth.db.collection("calendarEvents").where("productId", "==", productId).limit(1000).get(),
    auth.db.collection("tasks").where("productId", "==", productId).limit(1000).get(),
    auth.db.collection("activities").where("productId", "==", productId).limit(1000).get()
  ]);
  return {
    productId,
    leadsCount: leads.size,
    calendarEventsCount: calendarEvents.size,
    tasksCount: tasks.size,
    activitiesCount: activities.size
  };
}

export function normalizeProductStatus(value: unknown, fallback: unknown = "draft"): ProductStatus {
  if (statuses.includes(value as ProductStatus)) return value as ProductStatus;
  if (statuses.includes(fallback as ProductStatus)) return fallback as ProductStatus;
  return "draft";
}

export function normalizeProductType(value: unknown, fallback: unknown = "other"): ProductType {
  if (productTypes.includes(value as ProductType)) return value as ProductType;
  if (productTypes.includes(fallback as ProductType)) return fallback as ProductType;
  return "other";
}

export function buildProductPayload(auth: BusinessAuth, body: Record<string, unknown>, name = requireString(body.name, "商品名")) {
  return {
    ...productDefaults(),
    name,
    displayName: optionalString(body.displayName, 200) || name,
    iconUrl: nullableString(body.iconUrl, 500),
    iconStoragePath: nullableString(body.iconStoragePath, 500),
    slug: optionalString(body.slug, 200) || slugFromName(name),
    categoryIds: arrayOfStrings(body.categoryIds),
    categoryNames: arrayOfStrings(body.categoryNames),
    productType: normalizeProductType(body.productType),
    tagline: optionalString(body.tagline, 300),
    summary: optionalString(body.summary ?? body.description, 5000),
    values: arrayOrExisting(body.values, []),
    problems: arrayOrExisting(body.problems, []),
    ...(isObject(body.target) ? { target: normalizeTarget(body.target) } : {}),
    ...(isObject(body.pricing) ? { pricing: normalizePricing(body.pricing) } : {}),
    features: arrayOrExisting(body.features, []),
    ...(isObject(body.implementation) ? { implementation: normalizeImplementation(body.implementation) } : {}),
    objectionHandbook: arrayOrExisting(body.objectionHandbook, []),
    ...(isObject(body.salesSettings) ? { salesSettings: normalizeSalesSettings(body.salesSettings) } : {}),
    resources: arrayOrExisting(body.resources, []),
    ownerId: nullableString(body.ownerId, 160) ?? auth.userId,
    ownerName: nullableString(body.ownerName, 160) ?? auth.userName,
    status: normalizeProductStatus(body.status),
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : Date.now(),
    favoriteUserIds: arrayOfStrings(body.favoriteUserIds),
    archivedAt: parseDate(body.archivedAt),
    ...defaultBusinessFields(auth)
  };
}

export function serializeProduct(id: string, data: DocumentData): DocumentData {
  return {
    ...serializeDoc(id, data),
    name: String(data.name ?? ""),
    displayName: String(data.displayName ?? data.name ?? ""),
    slug: String(data.slug ?? slugFromName(String(data.name ?? ""))),
    categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds : [],
    categoryNames: Array.isArray(data.categoryNames) ? data.categoryNames : [],
    productType: normalizeProductType(data.productType),
    tagline: String(data.tagline ?? ""),
    summary: String(data.summary ?? data.overview ?? data.description ?? ""),
    values: Array.isArray(data.values) ? data.values : [],
    problems: Array.isArray(data.problems) ? data.problems : [],
    target: normalizeTarget(data.target),
    pricing: normalizePricing(data.pricing),
    features: Array.isArray(data.features) ? data.features : [],
    implementation: normalizeImplementation(data.implementation),
    objectionHandbook: Array.isArray(data.objectionHandbook) ? data.objectionHandbook : [],
    salesSettings: normalizeSalesSettings(data.salesSettings),
    resources: Array.isArray(data.resources) ? data.resources : [],
    ownerId: String(data.ownerId ?? data.createdBy ?? ""),
    ownerName: data.ownerName ?? data.createdByName ?? "",
    status: normalizeProductStatus(data.status),
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    favoriteUserIds: Array.isArray(data.favoriteUserIds) ? data.favoriteUserIds : []
  };
}

export function toDesktopProductPayload(product: DocumentData) {
  return {
    id: String(product.id ?? ""),
    name: String(product.name ?? product.displayName ?? ""),
    displayName: String(product.displayName ?? product.name ?? ""),
    status: String(product.status ?? "draft"),
    summary: String(product.summary ?? ""),
    tagline: String(product.tagline ?? ""),
    targetIndustries: Array.isArray(product.target?.industries) ? product.target.industries : [],
    targetRegions: Array.isArray(product.target?.regions) ? product.target.regions : [],
    companySizes: Array.isArray(product.target?.companySizes) ? product.target.companySizes : [],
    roles: Array.isArray(product.target?.roles) ? product.target.roles : [],
    decisionMakerRoles: Array.isArray(product.target?.decisionMakerRoles) ? product.target.decisionMakerRoles : [],
    pricingNotes: String(product.pricing?.notes ?? ""),
    updatedAt: timestampToIso(product.updatedAt)
  };
}

function buildProductUpdatePayload(auth: BusinessAuth, body: Record<string, unknown>, previous: DocumentData) {
  return {
    ...cleanPatchBody(body, ["action"]),
    ...(body.name !== undefined ? { name: requireString(body.name, "商品名") } : {}),
    ...(body.displayName !== undefined ? { displayName: optionalString(body.displayName, 200) || String(previous.displayName ?? previous.name ?? "") } : {}),
    ...(body.iconUrl !== undefined ? { iconUrl: nullableString(body.iconUrl, 500) } : {}),
    ...(body.iconStoragePath !== undefined ? { iconStoragePath: nullableString(body.iconStoragePath, 500) } : {}),
    ...(body.slug !== undefined ? { slug: optionalString(body.slug, 200) || slugFromName(String(previous.name ?? "")) } : {}),
    ...(body.categoryIds !== undefined ? { categoryIds: arrayOfStrings(body.categoryIds) } : {}),
    ...(body.categoryNames !== undefined ? { categoryNames: arrayOfStrings(body.categoryNames) } : {}),
    ...(body.productType !== undefined ? { productType: normalizeProductType(body.productType, previous.productType) } : {}),
    ...(body.tagline !== undefined ? { tagline: optionalString(body.tagline, 300) } : {}),
    ...(body.summary !== undefined || body.description !== undefined ? { summary: optionalString(body.summary ?? body.description, 5000) } : {}),
    ...(body.values !== undefined ? { values: arrayOrExisting(body.values, []) } : {}),
    ...(body.problems !== undefined ? { problems: arrayOrExisting(body.problems, []) } : {}),
    ...(body.target !== undefined ? { target: normalizeTarget(body.target) } : {}),
    ...(body.pricing !== undefined ? { pricing: normalizePricing(body.pricing) } : {}),
    ...(body.features !== undefined ? { features: arrayOrExisting(body.features, []) } : {}),
    ...(body.implementation !== undefined ? { implementation: normalizeImplementation(body.implementation) } : {}),
    ...(body.objectionHandbook !== undefined ? { objectionHandbook: arrayOrExisting(body.objectionHandbook, []) } : {}),
    ...(body.salesSettings !== undefined ? { salesSettings: normalizeSalesSettings(body.salesSettings) } : {}),
    ...(body.resources !== undefined ? { resources: arrayOrExisting(body.resources, []) } : {}),
    ...(body.ownerId !== undefined ? { ownerId: nullableString(body.ownerId, 160) ?? auth.userId } : {}),
    ...(body.ownerName !== undefined ? { ownerName: nullableString(body.ownerName, 160) ?? auth.userName } : {}),
    ...(body.status !== undefined ? { status: normalizeProductStatus(body.status, previous.status) } : {}),
    ...(body.sortOrder !== undefined ? { sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : previous.sortOrder ?? Date.now() } : {}),
    ...(body.favoriteUserIds !== undefined ? { favoriteUserIds: arrayOfStrings(body.favoriteUserIds) } : {}),
    ...(body.archivedAt !== undefined ? { archivedAt: parseDate(body.archivedAt) } : {}),
    id: FieldValue.delete(),
    productId: FieldValue.delete(),
    ...updateBusinessFields(auth)
  };
}

function productDefaults() {
  return {
    target: normalizeTarget(null),
    pricing: normalizePricing(null),
    features: [],
    implementation: normalizeImplementation(null),
    objectionHandbook: [],
    salesSettings: normalizeSalesSettings(null),
    resources: []
  };
}

function normalizeTarget(value: unknown) {
  const source = isObject(value) ? value : {};
  return {
    industries: arrayOfStrings(source.industries),
    regions: arrayOfStrings(source.regions),
    companySizes: arrayOfStrings(source.companySizes),
    facilitySizes: arrayOfStrings(source.facilitySizes),
    roles: arrayOfStrings(source.roles),
    decisionMakerRoles: arrayOfStrings(source.decisionMakerRoles),
    suitableConditions: arrayOfStrings(source.suitableConditions),
    unsuitableConditions: arrayOfStrings(source.unsuitableConditions),
    requiredConditions: arrayOfStrings(source.requiredConditions),
    disqualificationConditions: arrayOfStrings(source.disqualificationConditions),
    idealCustomerConditions: arrayOfStrings(source.idealCustomerConditions),
    lowPotentialConditions: arrayOfStrings(source.lowPotentialConditions),
    winningPatterns: arrayOfStrings(source.winningPatterns),
    losingPatterns: arrayOfStrings(source.losingPatterns),
    effectivePhrases: arrayOfStrings(source.effectivePhrases),
    avoidPhrases: arrayOfStrings(source.avoidPhrases),
    industryProposalAngles: Array.isArray(source.industryProposalAngles) ? source.industryProposalAngles : []
  };
}

function normalizePricing(value: unknown) {
  const source = isObject(value) ? value : {};
  const displayType = ["fixed", "from", "range", "estimate", "hidden"].includes(String(source.displayType ?? "")) ? source.displayType : "estimate";
  return {
    displayType,
    initialFee: nullableNumber(source.initialFee),
    monthlyFee: nullableNumber(source.monthlyFee),
    minimumFee: nullableNumber(source.minimumFee),
    maximumFee: nullableNumber(source.maximumFee),
    plans: Array.isArray(source.plans) ? source.plans : [],
    options: Array.isArray(source.options) ? source.options : [],
    minimumContractMonths: nullableNumber(source.minimumContractMonths),
    paymentTerms: optionalString(source.paymentTerms, 1000),
    renewalTerms: optionalString(source.renewalTerms, 1000),
    cancellationTerms: optionalString(source.cancellationTerms, 1000),
    cost: nullableNumber(source.cost),
    grossMarginRate: nullableNumber(source.grossMarginRate),
    notes: optionalString(source.notes, 3000)
  };
}

function normalizeImplementation(value: unknown) {
  const source = isObject(value) ? value : {};
  return {
    estimatedDays: nullableNumber(source.estimatedDays),
    flowSteps: Array.isArray(source.flowSteps) ? source.flowSteps : [],
    initialSetup: arrayOfStrings(source.initialSetup),
    clientRequirements: arrayOfStrings(source.clientRequirements),
    mogciaResponsibilities: arrayOfStrings(source.mogciaResponsibilities),
    supportDetails: arrayOfStrings(source.supportDetails),
    deliverables: arrayOfStrings(source.deliverables),
    operationFlow: arrayOfStrings(source.operationFlow),
    notes: arrayOfStrings(source.notes)
  };
}

function normalizeSalesSettings(value: unknown) {
  const source = isObject(value) ? value : {};
  return {
    targetMonthlyDeals: nullableNumber(source.targetMonthlyDeals),
    defaultPlanId: nullableString(source.defaultPlanId, 160),
    expectedMeetingMinutes: nullableNumber(source.expectedMeetingMinutes),
    expectedSalesCycleDays: nullableNumber(source.expectedSalesCycleDays),
    salesStages: arrayOfStrings(source.salesStages),
    objectionCategories: arrayOfStrings(source.objectionCategories),
    lossReasonCategories: arrayOfStrings(source.lossReasonCategories),
    leadTemperatureOptions: arrayOfStrings(source.leadTemperatureOptions),
    disqualificationConditions: arrayOfStrings(source.disqualificationConditions),
    requiredHearingItems: Array.isArray(source.requiredHearingItems) ? source.requiredHearingItems : [],
    salesPlaybooks: normalizeSalesPlaybooks(source.salesPlaybooks),
    notes: arrayOfStrings(source.notes)
  };
}

function normalizeSalesPlaybooks(value: unknown) {
  const source = isObject(value) ? value : {};
  return {
    teleapo: {
      new: normalizeSalesPlaybookEntry(isObject(source.teleapo) ? source.teleapo.new : null),
      existing: normalizeSalesPlaybookEntry(isObject(source.teleapo) ? source.teleapo.existing : null)
    },
    meeting: {
      new: normalizeSalesPlaybookEntry(isObject(source.meeting) ? source.meeting.new : null),
      existing: normalizeSalesPlaybookEntry(isObject(source.meeting) ? source.meeting.existing : null)
    }
  };
}

function normalizeSalesPlaybookEntry(value: unknown) {
  const source = isObject(value) ? value : {};
  return {
    proposalDirection: optionalString(source.proposalDirection, 3000),
    process: optionalString(source.process, 3000),
    keyQuestions: arrayOfStrings(source.keyQuestions),
    talkScript: optionalString(source.talkScript, 5000),
    materials: arrayOfStrings(source.materials),
    cautions: arrayOfStrings(source.cautions)
  };
}

function matchesProduct(product: DocumentData, keyword: string) {
  const fields = [
    product.name,
    product.displayName,
    product.tagline,
    product.summary,
    product.status,
    product.productType,
    ...(Array.isArray(product.categoryNames) ? product.categoryNames : []),
    ...(Array.isArray(product.values) ? product.values : []),
    ...(Array.isArray(product.problems) ? product.problems : []),
    ...(Array.isArray(product.target?.industries) ? product.target.industries : []),
    ...(Array.isArray(product.target?.regions) ? product.target.regions : []),
    ...(Array.isArray(product.target?.companySizes) ? product.target.companySizes : []),
    ...(Array.isArray(product.target?.roles) ? product.target.roles : []),
    ...(Array.isArray(product.target?.decisionMakerRoles) ? product.target.decisionMakerRoles : [])
  ];
  return fields.some((value) => String(value ?? "").toLowerCase().includes(keyword));
}

function arrayOrExisting(value: unknown, fallback: unknown[]) {
  return Array.isArray(value) ? value : fallback;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
