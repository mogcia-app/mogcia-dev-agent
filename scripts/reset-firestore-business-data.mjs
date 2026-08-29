#!/usr/bin/env node

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const confirmDelete = args.has("--confirm-delete");
const preserveCollections = new Set(["desktopDevices"]);

loadDotenvLocal();

if (!getApps().length) {
  initializeApp({ credential: loadCredential() });
}

const db = getFirestore();
const collections = await db.listCollections();
const report = [];

for (const collectionRef of collections) {
  const rootCount = await countQuery(collectionRef);
  const childCollections = await countChildCollections(collectionRef);
  const childCount = childCollections.reduce((sum, item) => sum + item.count, 0);
  report.push({
    collection: collectionRef.id,
    rootCount,
    childCount,
    totalCount: rootCount + childCount,
    preserved: preserveCollections.has(collectionRef.id),
    childCollections
  });
}

const deleteTargets = report.filter((item) => !item.preserved && item.totalCount > 0);
const preserved = report.filter((item) => item.preserved);

console.log(JSON.stringify({
  mode: confirmDelete ? "delete" : "dry-run",
  preserveCollections: [...preserveCollections],
  preserved,
  deleteTargets,
  deleteTotal: deleteTargets.reduce((sum, item) => sum + item.totalCount, 0)
}, null, 2));

if (!confirmDelete) {
  console.log("dry-run only. Add --confirm-delete to delete the target collections.");
  process.exit(0);
}

for (const target of deleteTargets) {
  await db.recursiveDelete(db.collection(target.collection));
}

const afterCollections = await db.listCollections();
const after = [];
for (const collectionRef of afterCollections) {
  const rootCount = await countQuery(collectionRef);
  const childCollections = await countChildCollections(collectionRef);
  const childCount = childCollections.reduce((sum, item) => sum + item.count, 0);
  after.push({
    collection: collectionRef.id,
    rootCount,
    childCount,
    totalCount: rootCount + childCount,
    preserved: preserveCollections.has(collectionRef.id)
  });
}

console.log(JSON.stringify({
  mode: "verify-after-delete",
  remainingCollections: after,
  targetCollectionsRemaining: after.filter((item) => !item.preserved && item.totalCount > 0),
  preservedCollections: after.filter((item) => item.preserved)
}, null, 2));

async function countQuery(query) {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

async function countChildCollections(collectionRef) {
  const docs = await collectionRef.listDocuments();
  const childReports = [];
  for (const docRef of docs) {
    await collectChildCollections(docRef, childReports);
  }
  return childReports;
}

async function collectChildCollections(docRef, reports) {
  const childCollections = await docRef.listCollections();
  for (const childRef of childCollections) {
    const count = await countQuery(childRef);
    reports.push({ path: childRef.path, count });
    const docs = await childRef.listDocuments();
    for (const childDocRef of docs) {
      await collectChildCollections(childDocRef, reports);
    }
  }
}

function loadCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return cert(JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")));
  }
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVICE_ACCOUNT_BASE64 is required.");
}

function loadDotenvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}
