import type { User } from "firebase/auth";

export const USER_DISPLAY_NAMES: Record<string, string> = {
  TjDadmBAdVYaPEvG3ppfBLS4HGN2: "石田 真梨奈",
  "233XesPbdUcARMRgnmWfG3yobtW2": "堂本 寛人",
  "58Sgm29AqddR9HtRJwBJuxQH2Fq1": "北村 健太郎"
};

export const DEFAULT_WORKSPACE_MEMBERS = Object.entries(USER_DISPLAY_NAMES).map(([uid, name]) => ({
  uid,
  name,
  email: ""
}));

export function getUserDisplayName(user: Pick<User, "uid" | "displayName" | "email"> | null | undefined): string {
  if (!user) return "ログインユーザー";
  return USER_DISPLAY_NAMES[user.uid] || user.displayName || user.email?.split("@")[0] || "ログインユーザー";
}

export function getUserDisplayNameById(uid?: string | null, fallback?: string | null): string {
  if (!uid) return fallback || "未設定";
  return USER_DISPLAY_NAMES[uid] || fallback || uid;
}

export function getUserFamilyNameById(uid?: string | null, fallback?: string | null): string {
  const displayName = getUserDisplayNameById(uid, fallback);
  return extractFamilyName(displayName);
}

export function extractFamilyName(displayName: string): string {
  const normalized = displayName.trim();
  if (!normalized || normalized === "未設定") return normalized || "未設定";
  return normalized.split(/\s+/)[0] || normalized;
}
