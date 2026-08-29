import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

const ADMIN_UID = "TjDadmBAdVYaPEvG3ppfBLS4HGN2";
const secrets = new SecretManagerServiceClient();

export async function requireCompanyAccess(request: Request, companyId: string, privileged = false) {
  const user = await requireUserFromRequest(request);
  const db = getAdminDb();
  const [company, profile] = await Promise.all([
    db.collection("companies").doc(companyId).get(),
    db.collection("users").doc(user.uid).get()
  ]);
  if (!company.exists) throw new WorkspaceError("会社が見つかりません。", 404);
  const role = user.uid === ADMIN_UID ? "admin" : String(profile.data()?.role ?? "sales");
  const privilegedUser = role === "admin" || role === "owner";
  const canManage = privilegedUser || company.data()?.createdBy === user.uid;
  if (privileged && !privilegedUser) throw new WorkspaceError("アクセス情報を操作する権限がありません。", 403);
  return { user, db, company, role, privilegedUser, canManage };
}

export async function requireCompanyManager(request: Request, companyId: string) {
  const access = await requireCompanyAccess(request, companyId);
  if (!access.canManage) throw new WorkspaceError("この会社を更新する権限がありません。", 403);
  return access;
}

export function companyServicePayload(input: Record<string, unknown>) {
  return {
    productId: nullableString(input.productId),
    serviceName: requiredString(input.serviceName, "サービス名", 160),
    status: oneOf(input.status, ["active", "paused", "ended"], "active"),
    startedAt: dateOrNull(input.startedAt),
    endedAt: dateOrNull(input.endedAt),
    price: numberOrNull(input.price),
    billingCycle: oneOf(input.billingCycle, ["monthly", "yearly", "one_time", "other"], "monthly"),
    ownerUserId: nullableString(input.ownerUserId),
    ownerUserName: nullableString(input.ownerUserName),
    adminUrl: safeUrl(input.adminUrl),
    productionUrl: safeUrl(input.productionUrl),
    repositoryUrl: safeUrl(input.repositoryUrl),
    hosting: nullableString(input.hosting),
    domain: nullableString(input.domain),
    maintenanceStatus: nullableString(input.maintenanceStatus),
    renewedAt: dateOrNull(input.renewedAt),
    memo: stringValue(input.memo).slice(0, 5000)
  };
}

export function credentialMetadataPayload(input: Record<string, unknown>) {
  return {
    serviceType: requiredString(input.serviceType, "種別", 80),
    label: requiredString(input.label, "名称", 160),
    url: safeUrl(input.url),
    username: stringValue(input.username).slice(0, 320)
  };
}

export async function createSecret(credentialId: string, value: string): Promise<string> {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new WorkspaceError("Secret ManagerのProject IDが設定されていません。", 503);
  const secretId = `mogcia-company-credential-${credentialId}`;
  const parent = `projects/${projectId}`;
  const [secret] = await secrets.createSecret({ parent, secretId, secret: { replication: { automatic: {} } } });
  await secrets.addSecretVersion({ parent: secret.name, payload: { data: Buffer.from(value, "utf8") } });
  return secret.name ?? `${parent}/secrets/${secretId}`;
}

export async function updateSecret(reference: string, value: string) {
  await secrets.addSecretVersion({ parent: reference, payload: { data: Buffer.from(value, "utf8") } });
}

export async function readSecret(reference: string): Promise<string> {
  const [version] = await secrets.accessSecretVersion({ name: `${reference}/versions/latest` });
  return version.payload?.data?.toString() ?? "";
}

export async function deleteSecret(reference: string) {
  await secrets.deleteSecret({ name: reference });
}

export async function auditCredential(input: { credentialId: string; companyId: string; action: string; user: { uid: string; email?: string | null; name?: string } }) {
  await getAdminDb().collection("credentialAuditLogs").add({
    credentialId: input.credentialId,
    companyId: input.companyId,
    action: input.action,
    userId: input.user.uid,
    userEmail: input.user.email ?? null,
    userName: input.user.name ?? null,
    createdAt: FieldValue.serverTimestamp()
  });
}

export function serializeDocument(id: string, data: DocumentData): Record<string, unknown> & { id: string } {
  return { id, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value instanceof Timestamp ? value.toDate().toISOString() : value])) };
}

export class WorkspaceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function workspaceFailure(error: unknown, fallback: string) {
  const status = error instanceof WorkspaceError ? error.status : 400;
  return Response.json({ success: false, error: { message: error instanceof Error ? error.message : fallback } }, { status });
}

function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableString(value: unknown): string | null { return stringValue(value) || null; }
function requiredString(value: unknown, label: string, max: number): string { const text = stringValue(value).slice(0, max); if (!text) throw new WorkspaceError(`${label}を入力してください。`); return text; }
function oneOf(value: unknown, values: string[], fallback: string): string { const text = stringValue(value); return values.includes(text) ? text : fallback; }
function numberOrNull(value: unknown): number | null { if (value === "" || value === null || value === undefined) return null; const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new WorkspaceError("料金が不正です。"); return number; }
function dateOrNull(value: unknown): Timestamp | null { const text = stringValue(value); if (!text) return null; const date = new Date(text); if (Number.isNaN(date.getTime())) throw new WorkspaceError("日付が不正です。"); return Timestamp.fromDate(date); }
function safeUrl(value: unknown): string | null { const text = stringValue(value); if (!text) return null; const url = new URL(text); if (url.protocol !== "https:" && url.protocol !== "http:") throw new WorkspaceError("URLはhttpまたはhttpsで入力してください。"); return url.toString(); }
