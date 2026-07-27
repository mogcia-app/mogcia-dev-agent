import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { DesktopApiError } from "@/lib/desktop/api";
import type { DesktopAuditAction, DesktopDevice, DesktopDevicePublic, DesktopPermissionKey, DesktopPermissions } from "@/types/desktop";

export const desktopDevicesCollection = "desktopDevices";
export const desktopAuditLogsCollection = "desktopAuditLogs";

export const defaultDesktopPermissions: DesktopPermissions = {
  readTasks: true,
  createTasks: true,
  readCompanies: true,
  createActivityLogs: true,
  useAiParser: true
};

const rateMap = new Map<string, { count: number; resetAt: number }>();

export function generateDesktopToken(): string {
  return `mogcia_dt_${randomBytes(32).toString("base64url")}`;
}

export function hashDesktopToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeDesktopDevice(id: string, data: DocumentData): DesktopDevice {
  return {
    id,
    userId: String(data.userId ?? ""),
    deviceName: String(data.deviceName ?? ""),
    tokenHash: String(data.tokenHash ?? ""),
    permissions: normalizePermissions(data.permissions),
    status: data.status === "revoked" ? "revoked" : "active",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    lastUsedAt: data.lastUsedAt instanceof Timestamp ? data.lastUsedAt : null,
    revokedAt: data.revokedAt instanceof Timestamp ? data.revokedAt : null
  };
}

export function toPublicDevice(device: DesktopDevice): DesktopDevicePublic {
  return {
    id: device.id,
    deviceName: device.deviceName,
    permissions: device.permissions,
    status: device.status,
    createdAt: device.createdAt.toDate().toISOString(),
    lastUsedAt: device.lastUsedAt?.toDate().toISOString() ?? null,
    revokedAt: device.revokedAt?.toDate().toISOString() ?? null
  };
}

export async function authenticateDesktopRequest(request: Request, permission?: DesktopPermissionKey) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) throw new DesktopApiError("UNAUTHORIZED", "認証に失敗しました", 401);

  const db = getAdminDb();
  const snapshot = await db.collection(desktopDevicesCollection).where("tokenHash", "==", hashDesktopToken(token)).limit(1).get();
  const entry = snapshot.docs[0];
  if (!entry) throw new DesktopApiError("UNAUTHORIZED", "認証に失敗しました", 401);

  const device = normalizeDesktopDevice(entry.id, entry.data());
  if (device.status !== "active") throw new DesktopApiError("UNAUTHORIZED", "無効化された端末です", 401);
  if (permission && !device.permissions[permission]) throw new DesktopApiError("FORBIDDEN", "この操作の権限がありません", 403);

  enforceRateLimit(device.id);
  await entry.ref.update({ lastUsedAt: FieldValue.serverTimestamp() });

  return { db, device, userId: device.userId };
}

export async function writeDesktopAuditLog(input: {
  userId: string;
  deviceId: string;
  action: DesktopAuditAction;
  targetId?: string | null;
  success: boolean;
  errorCode?: string | null;
}) {
  await getAdminDb().collection(desktopAuditLogsCollection).add({
    userId: input.userId,
    deviceId: input.deviceId,
    action: input.action,
    targetId: input.targetId ?? null,
    success: input.success,
    errorCode: input.errorCode ?? null,
    createdAt: FieldValue.serverTimestamp()
  });
}

export async function withDesktopAudit<T>(
  context: { userId: string; deviceId: string },
  action: DesktopAuditAction,
  run: () => Promise<T>,
  targetId?: string | null
): Promise<T> {
  try {
    const result = await run();
    await writeDesktopAuditLog({ ...context, action, targetId, success: true });
    return result;
  } catch (error) {
    await writeDesktopAuditLog({
      ...context,
      action,
      targetId,
      success: false,
      errorCode: error instanceof DesktopApiError ? error.code : "SERVER_ERROR"
    });
    throw error;
  }
}

function normalizePermissions(value: unknown): DesktopPermissions {
  if (!value || typeof value !== "object") return defaultDesktopPermissions;
  const source = value as Partial<Record<DesktopPermissionKey, unknown>>;
  return {
    readTasks: source.readTasks !== false,
    createTasks: source.createTasks !== false,
    readCompanies: source.readCompanies !== false,
    createActivityLogs: source.createActivityLogs !== false,
    useAiParser: source.useAiParser !== false
  };
}

function enforceRateLimit(deviceId: string) {
  const now = Date.now();
  const key = deviceId;
  const current = rateMap.get(key);
  if (!current || current.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count > 120) throw new DesktopApiError("RATE_LIMITED", "短時間のリクエストが多すぎます", 429);
  current.count += 1;
}
