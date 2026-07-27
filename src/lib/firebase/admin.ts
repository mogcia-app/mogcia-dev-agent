import "server-only";

import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  });
}

function normalizePrivateKey(value?: string): string | undefined {
  if (!value) return undefined;

  let key = value.trim();
  if (key.endsWith(",")) key = key.slice(0, -1).trim();
  if ((key.startsWith("\"") && key.endsWith("\"")) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  if (key.endsWith(",")) key = key.slice(0, -1).trim();

  key = key.replace(/\\n/g, "\n").trim();
  const begin = key.indexOf("-----BEGIN PRIVATE KEY-----");
  const endMarker = "-----END PRIVATE KEY-----";
  const end = key.indexOf(endMarker);
  if (begin >= 0 && end >= 0) {
    return key.slice(begin, end + endMarker.length);
  }

  return key;
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminStorageBucket() {
  return getStorage(getAdminApp()).bucket();
}
