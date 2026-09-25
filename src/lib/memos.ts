"use client";

import { businessApi, toJsonBody } from "@/lib/business-api-client";
import type { Memo } from "@/types/memo";

const endpoint = "/api/business/memos";
export const getMemos = () => businessApi<Memo[]>(endpoint);
export const createMemo = () => businessApi<{ id: string }>(endpoint, { method: "POST", body: toJsonBody({ title: "無題のメモ", content: "" }) });
export const updateMemo = (id: string, patch: { title?: string; content?: string }) => businessApi<{ ok: true }>(endpoint, { method: "PATCH", body: toJsonBody({ id, ...patch }) });
export const deleteMemo = (id: string) => businessApi<{ ok: true }>(endpoint, { method: "DELETE", body: toJsonBody({ id }) });
