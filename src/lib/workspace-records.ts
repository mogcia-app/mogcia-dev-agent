"use client";

import { collection, onSnapshot, orderBy, query, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { CompanyOption, LeadOption, MeetingOption, ProductOption, ProjectOption } from "@/types/workspace-records";

function nameFromData(data: DocumentData): string {
  return typeof data.name === "string" ? data.name : typeof data.title === "string" ? data.title : "";
}

export function subscribeCompanies(onNext: (items: CompanyOption[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "companies"), orderBy("name", "asc")),
    (snapshot) => onNext(snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        name: nameFromData(data),
        industry: data.industry,
        contactName: data.primaryContactName,
        phone: data.phone,
        email: data.email,
        status: data.status
      };
    }).filter((entry) => entry.name)),
    onError
  );
}

export function subscribeLeadOptions(onNext: (items: LeadOption[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "leads"), orderBy("companyName", "asc")),
    (snapshot) => onNext(snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        name: typeof data.companyName === "string" ? data.companyName : nameFromData(data),
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        status: data.status,
        productId: data.productId ?? null,
        productName: data.productName ?? null,
        convertedCompanyId: data.convertedCompanyId ?? data.companyId ?? null
      };
    }).filter((entry) => entry.name)),
    onError
  );
}

export function subscribeProductOptions(onNext: (items: ProductOption[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "products"), orderBy("name", "asc")),
    (snapshot) => onNext(snapshot.docs.map((entry) => ({ id: entry.id, name: nameFromData(entry.data()), tagline: entry.data().tagline })).filter((entry) => entry.name)),
    onError
  );
}

export function subscribeProjects(onNext: (items: ProjectOption[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "projects"), orderBy("name", "asc")),
    (snapshot) =>
      onNext(
        snapshot.docs
          .map((entry) => {
            const data = entry.data();
            return { id: entry.id, name: nameFromData(data), companyId: data.companyId ?? null, companyName: data.companyName ?? null };
          })
          .filter((entry) => entry.name)
      ),
    onError
  );
}

export function subscribeMeetings(onNext: (items: MeetingOption[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "meetings"), orderBy("name", "asc")),
    (snapshot) =>
      onNext(
        snapshot.docs
          .map((entry) => {
            const data = entry.data();
            return {
              id: entry.id,
              name: nameFromData(data),
              companyId: data.companyId ?? null,
              companyName: data.companyName ?? null,
              projectId: data.projectId ?? null,
              projectName: data.projectName ?? null
            };
          })
          .filter((entry) => entry.name)
      ),
    onError
  );
}
