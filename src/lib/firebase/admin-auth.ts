import "server-only";

import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "@/lib/firebase/admin";

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
