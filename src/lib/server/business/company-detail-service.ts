import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import {
  BusinessApiError,
  defaultBusinessFields,
  nullableString,
  optionalString,
  parseDate,
  requireString,
  serializeDoc,
  updateBusinessFields,
  type BusinessAuth
} from "@/lib/server/business/api";

const COMPANIES = "companies";
const SERVICES = "services";
const CREDENTIALS = "credentials";

export async function listCompanyServices(auth: BusinessAuth, companyId: string) {
  await assertCompanyExists(auth, companyId);
  const snapshot = await companyRef(auth, companyId).collection(SERVICES).orderBy("updatedAt", "desc").limit(200).get();
  return snapshot.docs.map((entry) => serializeCompanyService(entry.id, entry.data()));
}

export async function createCompanyService(auth: BusinessAuth, companyId: string, body: Record<string, unknown>) {
  await assertCompanyExists(auth, companyId);
  const serviceName = requireString(body.serviceName, "サービス名", 200);
  const ref = await companyRef(auth, companyId).collection(SERVICES).add(buildCompanyServicePayload(auth, body, serviceName));
  return { id: ref.id, service: serializeCompanyService(ref.id, (await ref.get()).data() ?? {}) };
}

export async function updateCompanyService(auth: BusinessAuth, companyId: string, serviceId: string, body: Record<string, unknown>) {
  await assertCompanyExists(auth, companyId);
  const ref = companyRef(auth, companyId).collection(SERVICES).doc(serviceId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "サービスが見つかりません。", 404);
  await ref.set(buildCompanyServiceUpdatePayload(auth, body), { merge: true });
  return { id: serviceId, service: serializeCompanyService(serviceId, (await ref.get()).data() ?? {}) };
}

export async function deleteCompanyService(auth: BusinessAuth, companyId: string, serviceId: string) {
  await assertCompanyExists(auth, companyId);
  const ref = companyRef(auth, companyId).collection(SERVICES).doc(serviceId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "サービスが見つかりません。", 404);
  await ref.delete();
  return { id: serviceId, deleted: true };
}

export async function listCompanyCredentials(auth: BusinessAuth, companyId: string) {
  await assertCompanyExists(auth, companyId);
  const snapshot = await companyRef(auth, companyId).collection(CREDENTIALS).orderBy("updatedAt", "desc").limit(200).get();
  return snapshot.docs.map((entry) => serializeCompanyCredential(entry.id, entry.data()));
}

export async function createCompanyCredential(auth: BusinessAuth, companyId: string, body: Record<string, unknown>) {
  await assertCompanyExists(auth, companyId);
  const label = requireString(body.label, "名称", 200);
  const secret = requireString(body.secret, "パスワード / Secret", 5000);
  const ref = await companyRef(auth, companyId).collection(CREDENTIALS).add(buildCompanyCredentialPayload(auth, body, label, secret));
  return { id: ref.id, credential: serializeCompanyCredential(ref.id, (await ref.get()).data() ?? {}) };
}

export async function updateCompanyCredential(auth: BusinessAuth, companyId: string, credentialId: string, body: Record<string, unknown>) {
  await assertCompanyExists(auth, companyId);
  const ref = companyRef(auth, companyId).collection(CREDENTIALS).doc(credentialId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "アクセス情報が見つかりません。", 404);
  await ref.set(buildCompanyCredentialUpdatePayload(auth, body), { merge: true });
  return { id: credentialId, credential: serializeCompanyCredential(credentialId, (await ref.get()).data() ?? {}) };
}

export async function deleteCompanyCredential(auth: BusinessAuth, companyId: string, credentialId: string) {
  await assertCompanyExists(auth, companyId);
  const ref = companyRef(auth, companyId).collection(CREDENTIALS).doc(credentialId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "アクセス情報が見つかりません。", 404);
  await ref.delete();
  return { id: credentialId, deleted: true };
}

export async function revealCompanyCredentialSecret(auth: BusinessAuth, companyId: string, credentialId: string) {
  await assertCompanyExists(auth, companyId);
  const snapshot = await companyRef(auth, companyId).collection(CREDENTIALS).doc(credentialId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "アクセス情報が見つかりません。", 404);
  return { secret: String(snapshot.data()?.secret ?? "") };
}

export async function migrateLegacyCompanyCredentials(auth: BusinessAuth, companyId: string) {
  await assertCompanyExists(auth, companyId);
  const snapshot = await companyRef(auth, companyId).collection(CREDENTIALS).limit(500).get();
  let migrated = 0;
  await auth.db.runTransaction(async (transaction) => {
    for (const entry of snapshot.docs) {
      const data = entry.data();
      if (typeof data.password === "string" && data.password && !data.secret) {
        transaction.set(entry.ref, { secret: data.password, password: FieldValue.delete(), ...updateBusinessFields(auth) }, { merge: true });
        migrated += 1;
      }
    }
  });
  return { migrated };
}

function companyRef(auth: BusinessAuth, companyId: string) {
  return auth.db.collection(COMPANIES).doc(companyId);
}

async function assertCompanyExists(auth: BusinessAuth, companyId: string) {
  const snapshot = await companyRef(auth, companyId).get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "会社が見つかりません。", 404);
}

function buildCompanyServicePayload(auth: BusinessAuth, body: Record<string, unknown>, serviceName: string) {
  return {
    serviceName,
    productId: nullableString(body.productId, 160),
    status: normalizeServiceStatus(body.status),
    startedAt: parseDate(body.startedAt),
    endedAt: parseDate(body.endedAt),
    price: parsePrice(body.price),
    billingCycle: normalizeBillingCycle(body.billingCycle),
    ownerUserId: nullableString(body.ownerUserId, 160),
    ownerUserName: nullableString(body.ownerUserName, 160),
    adminUrl: nullableString(body.adminUrl, 500),
    productionUrl: nullableString(body.productionUrl, 500),
    repositoryUrl: nullableString(body.repositoryUrl, 500),
    hosting: optionalString(body.hosting, 300),
    domain: optionalString(body.domain, 300),
    maintenanceStatus: optionalString(body.maintenanceStatus, 300),
    renewedAt: parseDate(body.renewedAt),
    memo: optionalString(body.memo, 5000),
    ...defaultBusinessFields(auth)
  };
}

function buildCompanyServiceUpdatePayload(auth: BusinessAuth, body: Record<string, unknown>) {
  return {
    ...(body.serviceName !== undefined ? { serviceName: requireString(body.serviceName, "サービス名", 200) } : {}),
    ...(body.productId !== undefined ? { productId: nullableString(body.productId, 160) } : {}),
    ...(body.status !== undefined ? { status: normalizeServiceStatus(body.status) } : {}),
    ...(body.startedAt !== undefined ? { startedAt: parseDate(body.startedAt) } : {}),
    ...(body.endedAt !== undefined ? { endedAt: parseDate(body.endedAt) } : {}),
    ...(body.price !== undefined ? { price: parsePrice(body.price) } : {}),
    ...(body.billingCycle !== undefined ? { billingCycle: normalizeBillingCycle(body.billingCycle) } : {}),
    ...(body.ownerUserId !== undefined ? { ownerUserId: nullableString(body.ownerUserId, 160) } : {}),
    ...(body.ownerUserName !== undefined ? { ownerUserName: nullableString(body.ownerUserName, 160) } : {}),
    ...(body.adminUrl !== undefined ? { adminUrl: nullableString(body.adminUrl, 500) } : {}),
    ...(body.productionUrl !== undefined ? { productionUrl: nullableString(body.productionUrl, 500) } : {}),
    ...(body.repositoryUrl !== undefined ? { repositoryUrl: nullableString(body.repositoryUrl, 500) } : {}),
    ...(body.hosting !== undefined ? { hosting: optionalString(body.hosting, 300) } : {}),
    ...(body.domain !== undefined ? { domain: optionalString(body.domain, 300) } : {}),
    ...(body.maintenanceStatus !== undefined ? { maintenanceStatus: optionalString(body.maintenanceStatus, 300) } : {}),
    ...(body.renewedAt !== undefined ? { renewedAt: parseDate(body.renewedAt) } : {}),
    ...(body.memo !== undefined ? { memo: optionalString(body.memo, 5000) } : {}),
    ...updateBusinessFields(auth)
  };
}

function buildCompanyCredentialPayload(auth: BusinessAuth, body: Record<string, unknown>, label: string, secret: string) {
  return {
    serviceType: optionalString(body.serviceType, 80) || "other",
    label,
    url: nullableString(body.url, 500),
    username: optionalString(body.username, 300),
    secret,
    ...defaultBusinessFields(auth)
  };
}

function buildCompanyCredentialUpdatePayload(auth: BusinessAuth, body: Record<string, unknown>) {
  return {
    ...(body.serviceType !== undefined ? { serviceType: optionalString(body.serviceType, 80) || "other" } : {}),
    ...(body.label !== undefined ? { label: requireString(body.label, "名称", 200) } : {}),
    ...(body.url !== undefined ? { url: nullableString(body.url, 500) } : {}),
    ...(body.username !== undefined ? { username: optionalString(body.username, 300) } : {}),
    ...(typeof body.secret === "string" && body.secret ? { secret: body.secret.slice(0, 5000) } : {}),
    ...updateBusinessFields(auth)
  };
}

function serializeCompanyService(id: string, data: DocumentData) {
  const service = serializeDoc(id, data);
  return {
    ...service,
    productId: service.productId ?? null,
    status: service.status ?? "active",
    startedAt: service.startedAt ?? null,
    endedAt: service.endedAt ?? null,
    price: typeof service.price === "number" ? service.price : null,
    billingCycle: service.billingCycle ?? "monthly",
    ownerUserId: service.ownerUserId ?? null,
    ownerUserName: service.ownerUserName ?? null,
    adminUrl: service.adminUrl ?? null,
    productionUrl: service.productionUrl ?? null,
    repositoryUrl: service.repositoryUrl ?? null,
    hosting: service.hosting ?? "",
    domain: service.domain ?? "",
    maintenanceStatus: service.maintenanceStatus ?? "",
    renewedAt: service.renewedAt ?? null,
    memo: service.memo ?? ""
  };
}

function serializeCompanyCredential(id: string, data: DocumentData) {
  const { secret: _secret, password: _password, ...safeData } = data;
  const credential = serializeDoc(id, safeData);
  return {
    ...credential,
    serviceType: credential.serviceType ?? "other",
    label: credential.label ?? "",
    url: credential.url ?? null,
    username: credential.username ?? ""
  };
}

function normalizeServiceStatus(value: unknown) {
  return value === "paused" || value === "ended" ? value : "active";
}

function normalizeBillingCycle(value: unknown) {
  return value === "yearly" || value === "one_time" || value === "other" ? value : "monthly";
}

function parsePrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new BusinessApiError("VALIDATION_ERROR", "料金は0以上の数値で入力してください。", 400);
  return Math.round(number);
}
