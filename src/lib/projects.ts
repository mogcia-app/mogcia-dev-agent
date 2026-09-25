"use client";

import { collection, onSnapshot, orderBy, query, Timestamp, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { businessApi, toJsonBody } from "@/lib/business-api-client";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Project, ProjectDraft, ProjectStatus, ProjectType } from "@/types/project";

const projectTypes: ProjectType[] = ["client", "product", "internal"];
const projectStatuses: ProjectStatus[] = ["planning", "active", "paused", "completed", "archived"];

export function subscribeProjectRecords(onNext: (projects: Project[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, "projects"), orderBy("name", "asc")), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeProject(entry.id, entry.data()))), onError);
}

export async function createProject(draft: ProjectDraft) {
  return businessApi<{ id: string }>("/api/business/projects", { method: "POST", body: toJsonBody(draft) });
}

export async function updateProject(id: string, draft: ProjectDraft, updatedAt?: Timestamp) {
  return businessApi<{ project: Record<string, unknown> }>("/api/business/projects", { method: "PATCH", body: toJsonBody({ id, ...draft, updatedAt }) });
}

export async function deleteProject(id: string) {
  return businessApi<{ id: string; deleted: boolean; unlinkedTasks: number }>("/api/business/projects", { method: "DELETE", body: toJsonBody({ id }) });
}

export function normalizeProject(id: string, data: DocumentData): Project {
  return {
    id,
    name: String(data.name ?? data.title ?? ""),
    type: projectTypes.includes(data.type) ? data.type : data.companyId ? "client" : "internal",
    status: projectStatuses.includes(data.status) ? data.status : "planning",
    phase: String(data.phase ?? ""),
    currentPosition: String(data.currentPosition ?? data.phase ?? ""),
    nextAction: String(data.nextAction ?? ""),
    notes: String(data.notes ?? ""),
    companyId: typeof data.companyId === "string" ? data.companyId : null,
    companyName: typeof data.companyName === "string" ? data.companyName : null,
    productId: typeof data.productId === "string" ? data.productId : null,
    productName: typeof data.productName === "string" ? data.productName : null,
    description: String(data.description ?? ""),
    startDate: data.startDate instanceof Timestamp ? data.startDate : null,
    targetDate: data.targetDate instanceof Timestamp ? data.targetDate : null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromMillis(0),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromMillis(0),
    createdBy: String(data.createdBy ?? ""),
    updatedBy: String(data.updatedBy ?? data.createdBy ?? "")
  };
}
