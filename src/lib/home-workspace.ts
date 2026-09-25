"use client";

import { businessApi, toJsonBody } from "@/lib/business-api-client";
import type { HomeWorkspace } from "@/types/home";

export function getHomeWorkspace() {
  return businessApi<HomeWorkspace>("/api/business/home-workspace");
}

export function saveHomeWorkspace(patch: Partial<Pick<HomeWorkspace, "currentWork" | "remember" | "todos">>) {
  return businessApi<HomeWorkspace>("/api/business/home-workspace", { method: "PATCH", body: toJsonBody(patch) });
}
