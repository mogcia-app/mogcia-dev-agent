import type { Timestamp } from "firebase-admin/firestore";

export type DesktopPermissionKey = "readTasks" | "createTasks" | "readCompanies" | "createActivityLogs" | "useAiParser";
export type DesktopDeviceStatus = "active" | "revoked";
export type DesktopAuditAction = "auth_verify" | "company_search" | "task_read" | "task_create" | "activity_create" | "memo_parse" | "memo_commit";
export type DesktopMemoSource = "cli" | "menubar" | "floating_window";

export interface DesktopPermissions {
  readTasks: boolean;
  createTasks: boolean;
  readCompanies: boolean;
  createActivityLogs: boolean;
  useAiParser: boolean;
}

export interface DesktopDevice {
  id: string;
  userId: string;
  deviceName: string;
  tokenHash: string;
  permissions: DesktopPermissions;
  status: DesktopDeviceStatus;
  createdAt: Timestamp;
  lastUsedAt?: Timestamp | null;
  revokedAt?: Timestamp | null;
}

export interface DesktopDevicePublic {
  id: string;
  deviceName: string;
  permissions: DesktopPermissions;
  status: DesktopDeviceStatus;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export interface DesktopCompanyResult {
  id: string;
  name: string;
  industry?: string;
  primaryContactName?: string;
  internalOwnerName?: string;
  lastContactAt?: string | null;
}

export interface DesktopTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  source: string;
  companyId?: string | null;
  companyName?: string | null;
  dueDate?: string | null;
}

export interface ParsedDesktopMemo {
  companyCandidates?: Array<{
    id: string;
    name: string;
    confidence: number;
  }>;
  activityLog?: {
    selected: boolean;
    type: "phone" | "email" | "visit" | "meeting" | "memo" | "other";
    title: string;
    content: string;
    occurredAt?: string;
  };
  suggestedTasks: Array<{
    tempId: string;
    selected: boolean;
    title: string;
    description?: string;
    dueDate?: string | null;
    priority: "high" | "medium" | "low";
    reason: string;
  }>;
  companyNotes: Array<{
    tempId: string;
    selected: boolean;
    content: string;
  }>;
  warnings?: string[];
}

export interface DesktopMemo {
  id: string;
  userId: string;
  text: string;
  companyId?: string | null;
  status: "draft" | "parsed" | "committed" | "discarded";
  parsedResult?: ParsedDesktopMemo | null;
  createdFrom: DesktopMemoSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DesktopAuditLog {
  id: string;
  userId: string;
  deviceId: string;
  action: DesktopAuditAction;
  targetId?: string | null;
  success: boolean;
  errorCode?: string | null;
  createdAt: Timestamp;
}
