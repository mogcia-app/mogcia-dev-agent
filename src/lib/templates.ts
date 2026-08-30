"use client";

import { onAuthStateChanged } from "firebase/auth";
import { Timestamp, type DocumentData } from "firebase/firestore";
import { businessApi, toJsonBody } from "@/lib/business-api-client";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { BusinessTemplate, BusinessTemplateDraft, GeneratedTemplateContent } from "@/types/template";

export function createEmptyTemplateDraft(): BusinessTemplateDraft {
  return { title: "", description: "", category: "email", scene: "", content: "", favorite: false };
}

export function templateToDraft(template: BusinessTemplate): BusinessTemplateDraft {
  return {
    title: template.title,
    description: template.description,
    category: template.category,
    scene: template.scene,
    content: template.content,
    favorite: template.favorite
  };
}

export function subscribeBusinessTemplates(onNext: (templates: BusinessTemplate[]) => void, onError: (error: Error) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) return () => undefined;
  let disposed = false;
  let refreshTimer: number | null = null;
  const load = async () => {
    try {
      const data = await businessApi<{ templates?: DocumentData[] }>("/api/business/templates");
      if (!disposed) onNext((data.templates ?? []).map((template) => normalizeTemplate(String(template.id ?? ""), template)));
    } catch (error) {
      if (!disposed) onError(error instanceof Error ? error : new Error("テンプレートを取得できませんでした。"));
    }
  };
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user || disposed) return;
    void load();
    if (refreshTimer === null) refreshTimer = window.setInterval(() => void load(), 15_000);
  });
  window.addEventListener("businessTemplates:refresh", load);
  return () => {
    disposed = true;
    unsubscribeAuth();
    window.removeEventListener("businessTemplates:refresh", load);
    if (refreshTimer !== null) window.clearInterval(refreshTimer);
  };
}

export async function createBusinessTemplate(draft: BusinessTemplateDraft): Promise<string> {
  const data = await businessApi<{ id: string }>("/api/business/templates", { method: "POST", body: toJsonBody(draft) });
  refreshBusinessTemplates();
  return data.id;
}

export async function updateBusinessTemplate(template: BusinessTemplate, draft: BusinessTemplateDraft): Promise<void> {
  await businessApi<{ template: BusinessTemplate }>("/api/business/templates", { method: "PATCH", body: toJsonBody({ id: template.id, updatedAt: template.updatedAt, ...draft }) });
  refreshBusinessTemplates();
}

export async function deleteBusinessTemplate(templateId: string): Promise<void> {
  await businessApi<{ id: string }>("/api/business/templates", { method: "DELETE", body: toJsonBody({ id: templateId }) });
  refreshBusinessTemplates();
}

export async function duplicateBusinessTemplate(template: BusinessTemplate): Promise<string> {
  const data = await businessApi<{ id: string }>("/api/business/templates", { method: "POST", body: toJsonBody({ ...templateToDraft(template), title: `${template.title} コピー`, favorite: false }) });
  return data.id;
}

export async function toggleTemplateFavorite(template: BusinessTemplate): Promise<void> {
  await updateBusinessTemplate(template, { ...templateToDraft(template), favorite: !template.favorite });
}

export async function generateTemplateContent(input: { templateId: string; relatedSource?: string; relatedId?: string; productId?: string }): Promise<GeneratedTemplateContent> {
  const data = await businessApi<GeneratedTemplateContent>("/api/business/templates/generate", { method: "POST", body: toJsonBody(input) });
  refreshBusinessTemplates();
  return data;
}

function refreshBusinessTemplates() {
  window.dispatchEvent(new Event("businessTemplates:refresh"));
}

function normalizeTemplate(id: string, data: DocumentData): BusinessTemplate {
  return {
    id,
    title: text(data.title),
    description: text(data.description),
    category: normalizeCategory(data.category),
    scene: text(data.scene),
    content: text(data.content),
    favorite: Boolean(data.favorite),
    usageCount: typeof data.usageCount === "number" ? data.usageCount : 0,
    lastUsedAt: nullableTimestamp(data.lastUsedAt),
    createdBy: text(data.createdBy),
    createdByName: text(data.createdByName),
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt)
  };
}

function normalizeCategory(value: unknown): BusinessTemplate["category"] {
  if (value === "email" || value === "phone" || value === "meeting" || value === "proposal" || value === "hearing" || value === "line_sns" || value === "internal" || value === "other") return value;
  return "other";
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableTimestamp(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function timestamp(value: unknown): Timestamp {
  return nullableTimestamp(value) ?? Timestamp.now();
}
