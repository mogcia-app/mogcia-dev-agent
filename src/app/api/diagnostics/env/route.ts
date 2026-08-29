import { NextResponse } from "next/server";

export async function GET() {
  const firebaseBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const firebaseJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const splitProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const splitClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const splitPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  return NextResponse.json({
    success: true,
    data: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      hasFirebaseServiceAccountBase64: Boolean(firebaseBase64),
      firebaseServiceAccountBase64Length: firebaseBase64?.length ?? 0,
      hasFirebaseServiceAccountJson: Boolean(firebaseJson),
      firebaseServiceAccountJsonLength: firebaseJson?.length ?? 0,
      hasSplitFirebaseAdminCredentials: Boolean(splitProjectId && splitClientEmail && splitPrivateKey),
      hasNextPublicFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      nextPublicFirebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null
    }
  });
}
