import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { BusinessAuth } from "@/lib/server/business/api";

const COLLECTION = "companyViews";

export async function listCompanyViews(auth: BusinessAuth) {
  const snapshot = await auth.db.collection("users").doc(auth.userId).collection(COLLECTION).get();
  return Object.fromEntries(snapshot.docs.map((entry) => {
    const viewedAt = entry.data().viewedAt;
    return [entry.id, viewedAt instanceof Timestamp ? viewedAt.toDate().toISOString() : null];
  }).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export async function markCompanyViewed(auth: BusinessAuth, companyId: string) {
  await auth.db.collection("users").doc(auth.userId).collection(COLLECTION).doc(companyId).set({
    companyId,
    userId: auth.userId,
    viewedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { companyId };
}
