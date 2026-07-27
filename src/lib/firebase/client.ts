import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseOfflineMessages = [
  "Could not reach Cloud Firestore backend",
  "auth/network-request-failed",
  "client will operate in offline mode"
];

installFirebaseConsoleFilter();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

function installFirebaseConsoleFilter() {
  if (typeof window === "undefined") return;
  const key = "__mogciaFirebaseConsoleFilterInstalled";
  const target = window as unknown as Record<string, boolean | undefined>;
  if (target[key]) return;
  target[key] = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const message = args.map((arg) => (typeof arg === "string" ? arg : arg instanceof Error ? arg.message : "")).join(" ");
    const isOfflineNotice = firebaseOfflineMessages.some((pattern) => message.includes(pattern));
    if (isOfflineNotice) {
      console.info("[MOGCIA] Firebaseが一時的にオフラインです。接続が戻ると自動で再同期します。");
      return;
    }
    originalError(...args);
  };
}

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

export function isFirebaseConfigured(): boolean {
  return requiredConfigKeys.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

export function getFirebaseDb() {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export function getFirebaseStorageClient() {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}
