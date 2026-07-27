"use client";

import { Timestamp, addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorageClient } from "@/lib/firebase/client";
import { createDefaultProduct, slugify } from "@/lib/product-utils";
import type { Product, ProductChangeLog, ProductResource, ProductStatus, ProductTab } from "@/types/product";

const collectionName = "products";

function normalizeProduct(id: string, data: DocumentData): Product {
  const now = Timestamp.now();
  return {
    id,
    name: String(data.name ?? ""),
    displayName: String(data.displayName ?? data.name ?? ""),
    slug: String(data.slug ?? slugify(String(data.name ?? ""))),
    categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds : [],
    categoryNames: Array.isArray(data.categoryNames) ? data.categoryNames : [],
    productType: data.productType ?? "other",
    tagline: String(data.tagline ?? ""),
    summary: String(data.summary ?? data.overview ?? ""),
    values: Array.isArray(data.values) ? data.values : [],
    problems: Array.isArray(data.problems) ? data.problems : [],
    target: {
      industries: data.target?.industries ?? [],
      companySizes: data.target?.companySizes ?? [],
      facilitySizes: data.target?.facilitySizes ?? [],
      roles: data.target?.roles ?? [],
      decisionMakerRoles: data.target?.decisionMakerRoles ?? [],
      suitableConditions: data.target?.suitableConditions ?? [],
      unsuitableConditions: data.target?.unsuitableConditions ?? [],
      requiredConditions: data.target?.requiredConditions ?? [],
      disqualificationConditions: data.target?.disqualificationConditions ?? []
    },
    pricing: {
      displayType: data.pricing?.displayType ?? "estimate",
      initialFee: data.pricing?.initialFee ?? null,
      monthlyFee: data.pricing?.monthlyFee ?? null,
      minimumFee: data.pricing?.minimumFee ?? null,
      maximumFee: data.pricing?.maximumFee ?? null,
      plans: data.pricing?.plans ?? [],
      options: data.pricing?.options ?? [],
      minimumContractMonths: data.pricing?.minimumContractMonths ?? null,
      paymentTerms: data.pricing?.paymentTerms ?? "",
      renewalTerms: data.pricing?.renewalTerms ?? "",
      cancellationTerms: data.pricing?.cancellationTerms ?? "",
      cost: data.pricing?.cost ?? null,
      grossMarginRate: data.pricing?.grossMarginRate ?? null,
      notes: data.pricing?.notes ?? ""
    },
    features: data.features ?? [],
    implementation: {
      estimatedDays: data.implementation?.estimatedDays ?? null,
      flowSteps: data.implementation?.flowSteps ?? [],
      initialSetup: data.implementation?.initialSetup ?? [],
      clientRequirements: data.implementation?.clientRequirements ?? [],
      mogciaResponsibilities: data.implementation?.mogciaResponsibilities ?? [],
      supportDetails: data.implementation?.supportDetails ?? [],
      deliverables: data.implementation?.deliverables ?? [],
      operationFlow: data.implementation?.operationFlow ?? [],
      notes: data.implementation?.notes ?? []
    },
    salesSettings: {
      targetMonthlyDeals: data.salesSettings?.targetMonthlyDeals ?? null,
      defaultPlanId: data.salesSettings?.defaultPlanId ?? null,
      expectedMeetingMinutes: data.salesSettings?.expectedMeetingMinutes ?? null,
      expectedSalesCycleDays: data.salesSettings?.expectedSalesCycleDays ?? null,
      salesStages: data.salesSettings?.salesStages ?? [],
      objectionCategories: data.salesSettings?.objectionCategories ?? [],
      lossReasonCategories: data.salesSettings?.lossReasonCategories ?? [],
      leadTemperatureOptions: data.salesSettings?.leadTemperatureOptions ?? [],
      disqualificationConditions: data.salesSettings?.disqualificationConditions ?? [],
      requiredHearingItems: data.salesSettings?.requiredHearingItems ?? [],
      notes: data.salesSettings?.notes ?? []
    },
    resources: data.resources ?? [],
    ownerId: String(data.ownerId ?? data.createdBy ?? ""),
    ownerName: data.ownerName ?? data.createdByName ?? "",
    status: data.status ?? "draft",
    favoriteUserIds: data.favoriteUserIds ?? [],
    createdBy: String(data.createdBy ?? ""),
    createdByName: data.createdByName ?? "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now,
    archivedAt: data.archivedAt instanceof Timestamp ? data.archivedAt : null
  };
}

export function subscribeProductsMaster(onNext: (products: Product[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, collectionName), orderBy("updatedAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => normalizeProduct(entry.id, entry.data()))), onError);
}

export function subscribeProductChangeLogs(productId: string, onNext: (logs: ProductChangeLog[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, collectionName, productId, "changeLogs"), orderBy("createdAt", "desc")), (snapshot) => onNext(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ProductChangeLog))), onError);
}

export async function createProduct(user: { id: string; name: string }, input: Pick<Product, "name" | "displayName" | "categoryNames" | "productType" | "tagline" | "status">): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const ref = await addDoc(collection(db, collectionName), createDefaultProduct(user, input));
  await addChangeLog(ref.id, user, "basic", "商材を作成しました");
  return ref.id;
}

export async function updateProduct(productId: string, user: { id: string; name: string }, tab: ProductTab, patch: Partial<Product>): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, collectionName, productId), { ...patch, updatedAt: serverTimestamp() });
  await addChangeLog(productId, user, tab, "商材情報を更新しました");
}

export async function duplicateProduct(product: Product, user: { id: string; name: string }): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  const copy = { ...product, name: `${product.name} コピー`, displayName: `${product.displayName} コピー`, slug: `${product.slug}-${Date.now()}`, status: "draft" as ProductStatus, favoriteUserIds: [], createdBy: user.id, createdByName: user.name, ownerId: user.id, ownerName: user.name, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), archivedAt: null };
  const { id: _id, ...payload } = copy;
  const ref = await addDoc(collection(db, collectionName), payload);
  await addChangeLog(ref.id, user, "basic", "商材を複製しました");
  return ref.id;
}

export async function archiveProduct(productId: string, user: { id: string; name: string }): Promise<void> {
  await updateProduct(productId, user, "basic", { status: "archived", archivedAt: Timestamp.now() } as Partial<Product>);
}

export async function toggleFavorite(product: Product, userId: string): Promise<void> {
  const favoriteUserIds = product.favoriteUserIds.includes(userId) ? product.favoriteUserIds.filter((id) => id !== userId) : [...product.favoriteUserIds, userId];
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, collectionName, product.id), { favoriteUserIds, updatedAt: serverTimestamp() });
}

export async function addResourceFile(product: Product, file: File, user: { id: string; name: string }, onProgress: (progress: number) => void): Promise<ProductResource> {
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("Firebase Storageが未設定です。");
  const path = `products/${product.id}/resources/${Date.now()}-${file.name}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)), reject, () => resolve());
  });
  const url = await getDownloadURL(ref(storage, path));
  return { id: crypto.randomUUID(), title: file.name, type: "other", url, storagePath: path, fileName: file.name, visibility: "internal", createdBy: user.id, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
}

async function addChangeLog(productId: string, user: { id: string; name: string }, targetTab: ProductTab, action: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await addDoc(collection(db, collectionName, productId, "changeLogs"), { actorId: user.id, actorName: user.name, targetTab, action, createdAt: serverTimestamp() });
}
