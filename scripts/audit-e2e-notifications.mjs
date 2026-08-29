#!/usr/bin/env node

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const confirmDelete = args.has("--confirm-delete");

function loadCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS または FIREBASE_SERVICE_ACCOUNT_JSON を設定してください。");
}

if (!getApps().length) {
  initializeApp({ credential: loadCredential() });
}

const db = getFirestore();
const snapshot = await db.collection("agentNotifications").orderBy("createdAt", "desc").limit(500).get();
const candidates = snapshot.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }))
  .filter(isE2ENotification);

console.log(JSON.stringify({
  mode: confirmDelete ? "delete" : "audit",
  count: candidates.length,
  candidates: candidates.map((item) => ({
    id: item.id,
    userId: item.userId ?? null,
    source: item.source ?? null,
    environment: item.environment ?? null,
    title: item.title ?? null,
    message: item.message ?? null,
    createdAt: item.createdAt?.toDate?.()?.toISOString?.() ?? null,
    reason: reasonFor(item)
  }))
}, null, 2));

if (confirmDelete) {
  if (candidates.length !== 14 && !args.has("--allow-count-mismatch")) {
    throw new Error(`削除候補が14件ではありません（${candidates.length}件）。確認なしでは削除しません。`);
  }
  const batch = db.batch();
  candidates.forEach((item) => batch.delete(db.collection("agentNotifications").doc(item.id)));
  await batch.commit();
  console.log(`${candidates.length}件のE2E通知を削除しました。`);
}

function isE2ENotification(item) {
  if (item.environment === "test") return true;
  const haystack = `${item.source ?? ""} ${item.title ?? ""} ${item.message ?? ""}`.normalize("NFKC").toLowerCase();
  return haystack.includes("e2e") || haystack.includes("playwright") || haystack.includes("テスト通知") || haystack.includes("test notification");
}

function reasonFor(item) {
  const reasons = [];
  if (item.environment === "test") reasons.push("environment=test");
  if (item.source === "e2e" || item.source === "playwright") reasons.push(`source=${item.source}`);
  const text = `${item.title ?? ""} ${item.message ?? ""}`.normalize("NFKC").toLowerCase();
  if (text.includes("e2e")) reasons.push("件名/本文にE2E");
  if (text.includes("playwright")) reasons.push("件名/本文にPlaywright");
  if (text.includes("テスト通知") || text.includes("test notification")) reasons.push("件名/本文がテスト通知");
  return reasons.join(", ") || "テスト通知パターンに一致";
}
