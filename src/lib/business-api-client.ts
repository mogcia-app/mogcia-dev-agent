"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";

export async function businessApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getFirebaseAuth();
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("ログインが必要です。");

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...init, headers });
  const json = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { message?: string } } | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "保存できませんでした。");
  }
  return json.data as T;
}

export function toJsonBody(value: unknown) {
  return JSON.stringify(toJsonValue(value));
}

function toJsonValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return value;
}
