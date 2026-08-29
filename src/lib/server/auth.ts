import "server-only";

import { getAdminAuth } from "@/lib/firebase/admin-auth";

export async function requireUserFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) throw new Error("Missing authorization token.");
  return getAdminAuth().verifyIdToken(token);
}
