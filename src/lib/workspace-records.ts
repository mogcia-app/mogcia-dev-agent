"use client";

import { collection, onSnapshot, orderBy, query, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { CompanyOption, MeetingOption, ProjectOption } from "@/types/workspace-records";

function nameFromData(data: DocumentData): string {
  return typeof data.name === "string" ? data.name : typeof data.title === "string" ? data.title : "";
}

export function subscribeCompanies(onNext: (items: CompanyOption[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, "companies"), orderBy("name", "asc")),
    (snapshot) => onNext(snapshot.docs.map((entry) => ({ id: entry.id, name: nameFromData(entry.data()), industry: entry.data().industry })).filter((entry) => entry.name)),
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
