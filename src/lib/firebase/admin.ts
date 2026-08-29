import "server-only";

import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = readServiceAccountFromEnv();
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    });
  }

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

function readServiceAccountFromEnv(): ServiceAccount | null {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : json;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      projectId?: string;
      clientEmail?: string;
      privateKey?: string;
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    const serviceAccount = {
      projectId: parsed.projectId ?? parsed.project_id,
      clientEmail: parsed.clientEmail ?? parsed.client_email,
      privateKey: normalizePrivateKey(parsed.privateKey ?? parsed.private_key)
    };

    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
      throw new Error("Firebase Admin認証情報に必要な項目が不足しています。");
    }

    return serviceAccount;
  } catch {
    throw new Error("Firebase Admin認証情報の形式が正しくありません。");
  }
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

export async function getFirebaseAdminDiagnostics() {
  const hasBase64 = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  const hasJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const hasSplitCredentials = Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  try {
    const serviceAccount = readServiceAccountFromEnv();
    const db = getAdminDb();
    await db.collection("_diagnostics").limit(1).get();

    return {
      ok: true,
      credentialSource: serviceAccount ? (hasBase64 ? "FIREBASE_SERVICE_ACCOUNT_BASE64" : "FIREBASE_SERVICE_ACCOUNT_JSON") : hasSplitCredentials ? "FIREBASE_ADMIN_*" : "applicationDefault",
      hasBase64,
      hasJson,
      hasSplitCredentials,
      projectId: serviceAccount?.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null
    };
  } catch (error) {
    return {
      ok: false,
      credentialSource: hasBase64 ? "FIREBASE_SERVICE_ACCOUNT_BASE64" : hasJson ? "FIREBASE_SERVICE_ACCOUNT_JSON" : hasSplitCredentials ? "FIREBASE_ADMIN_*" : "applicationDefault",
      hasBase64,
      hasJson,
      hasSplitCredentials,
      error: error instanceof Error ? error.message : "Firebase Adminの確認に失敗しました"
    };
  }
}
