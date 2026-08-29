import "server-only";

import { FieldValue, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { DesktopApiError } from "@/lib/desktop/api";
import { authenticateDesktopRequest, writeDesktopAuditLog } from "@/lib/desktop/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { findLooseDuplicates, findNameDuplicates, normalizeComparableName } from "@/lib/server/duplicate-utils";
import { getUserDisplayNameById } from "@/lib/user-display";

export type BusinessAuth = {
  db: Firestore;
  userId: string;
  userName: string;
  source: "web" | "desktop";
  deviceId: string | null;
};

type BusinessErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "DUPLICATE" | "RATE_LIMITED" | "AI_ERROR" | "SERVER_ERROR";

export class BusinessApiError extends Error {
  constructor(
    public code: BusinessErrorCode,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function authenticateBusinessRequest(request: Request, desktopPermission?: Parameters<typeof authenticateDesktopRequest>[1]): Promise<BusinessAuth> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) throw new BusinessApiError("UNAUTHORIZED", "認証に失敗しました。", 401);

  try {
    const { getAdminAuth } = await import("@/lib/firebase/admin-auth");
    const decoded = await getAdminAuth().verifyIdToken(token);
    return {
      db: getAdminDb(),
      userId: decoded.uid,
      userName: typeof decoded.name === "string" ? decoded.name : getUserDisplayNameById(decoded.uid),
      source: "web",
      deviceId: null
    };
  } catch {
    try {
      const desktop = await authenticateDesktopRequest(request, desktopPermission);
      return {
        db: desktop.db,
        userId: desktop.userId,
        userName: getUserDisplayNameById(desktop.userId),
        source: "desktop",
        deviceId: desktop.device.id
      };
    } catch (error) {
      if (error instanceof DesktopApiError) throw new BusinessApiError(error.code, error.message, error.status);
      throw new BusinessApiError("UNAUTHORIZED", "認証に失敗しました。", 401);
    }
  }
}

export async function withBusinessAudit<T>(auth: BusinessAuth, action: string, run: () => Promise<T>, targetId?: string | null): Promise<T> {
  try {
    const result = await run();
    if (auth.source === "desktop" && auth.deviceId) {
      await writeDesktopAuditLog({ userId: auth.userId, deviceId: auth.deviceId, action: action as never, targetId, success: true });
    }
    return result;
  } catch (error) {
    if (auth.source === "desktop" && auth.deviceId) {
      await writeDesktopAuditLog({
        userId: auth.userId,
        deviceId: auth.deviceId,
        action: action as never,
        targetId,
        success: false,
        errorCode: error instanceof BusinessApiError ? error.code : "SERVER_ERROR"
      });
    }
    throw error;
  }
}

export function businessSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function businessFailure(error: unknown) {
  if (error instanceof BusinessApiError) {
    return NextResponse.json({ success: false, error: { code: error.code, message: error.message, details: error.details ?? null } }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: error instanceof Error ? error.message : "処理に失敗しました。" } }, { status: 500 });
}

export function requireString(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== "string") throw new BusinessApiError("VALIDATION_ERROR", `${label}を入力してください。`, 400);
  const trimmed = value.trim();
  if (!trimmed) throw new BusinessApiError("VALIDATION_ERROR", `${label}を入力してください。`, 400);
  if (trimmed.length > maxLength) throw new BusinessApiError("VALIDATION_ERROR", `${label}は${maxLength}文字以内で入力してください。`, 400);
  return trimmed;
}

export function optionalString(value: unknown, maxLength = 2000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function nullableString(value: unknown, maxLength = 2000): string | null {
  const text = optionalString(value, maxLength);
  return text || null;
}

export function parseDate(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

export function serialize(data: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeValue(value)]));
}

export function serializeDoc(id: string, data: DocumentData): DocumentData {
  return { id, ...serialize(data) };
}

export function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") return serialize(value as DocumentData);
  return value;
}

export function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

export async function assertFreshUpdate(ref: FirebaseFirestore.DocumentReference, expectedUpdatedAt: unknown) {
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessApiError("NOT_FOUND", "対象データが見つかりません。", 404);
  if (!expectedUpdatedAt) return snapshot;
  const current = snapshot.data()?.updatedAt;
  const currentIso = current instanceof Timestamp ? current.toDate().toISOString() : null;
  const expectedIso = typeof expectedUpdatedAt === "string" ? new Date(expectedUpdatedAt).toISOString() : null;
  if (currentIso && expectedIso && currentIso !== expectedIso) {
    throw new BusinessApiError("CONFLICT", "他のユーザーが先に更新しています。再読み込みして差分を確認してください。", 409, {
      current: serializeDoc(snapshot.id, snapshot.data() ?? {}),
      expectedUpdatedAt,
      currentUpdatedAt: currentIso
    });
  }
  return snapshot;
}

export async function findCollectionNameDuplicates(db: Firestore, collectionName: string, name: string, fields: string[]) {
  const snapshot = await db.collection(collectionName).orderBy("updatedAt", "desc").limit(500).get();
  return findNameDuplicates(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })), name, fields).slice(0, 5).map((item) => serializeDoc(String(item.id), item));
}

export async function findTimeDuplicates(db: Firestore, collectionName: string, candidate: { title: string; companyId?: string | null; startsAt?: Date | null; dueDate?: Date | null; occurredAt?: Date | null }) {
  const snapshot = await db.collection(collectionName).orderBy("updatedAt", "desc").limit(500).get();
  return findLooseDuplicates(
    snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    { title: candidate.title, companyId: candidate.companyId ?? null, startsAt: candidate.startsAt ?? candidate.dueDate ?? candidate.occurredAt ?? null }
  ).slice(0, 5).map((item) => serializeDoc(String(item.id), item));
}

export function defaultBusinessFields(auth: BusinessAuth) {
  return {
    createdBy: auth.userId,
    createdByName: auth.userName,
    updatedBy: auth.userId,
    updatedByName: auth.userName,
    origin: auth.source,
    environment: process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production" ? "production" : "development",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

export function updateBusinessFields(auth: BusinessAuth) {
  return {
    updatedBy: auth.userId,
    updatedByName: auth.userName,
    updatedAt: FieldValue.serverTimestamp()
  };
}

export function slugFromName(name: string) {
  return normalizeComparableName(name) || `item-${Date.now()}`;
}

export function cleanPatchBody(body: Record<string, unknown>, extraBlocked: string[] = []) {
  const blocked = new Set(["id", "companyId", "leadId", "taskId", "productId", "activityId", "calendarEventId", "createdAt", "createdBy", "createdByName", "updatedAt", ...extraBlocked]);
  return Object.fromEntries(Object.entries(body).filter(([key]) => !blocked.has(key)));
}
