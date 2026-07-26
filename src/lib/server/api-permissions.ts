import "server-only";

import { NextResponse } from "next/server";
import { getUserRole } from "@/domain/rules";
import type { UserRole } from "@/domain/types";
import { getAdminAuth } from "@/lib/firebase/admin";

export type ApiPermission = "ai:run" | "meeting:write" | "demo:generate" | "codex:record";

const permissionRoles: Record<ApiPermission, UserRole[]> = {
  "ai:run": ["admin", "internal", "sales"],
  "meeting:write": ["admin", "internal", "sales"],
  "demo:generate": ["admin", "internal"],
  "codex:record": ["admin", "internal"]
};

export async function requireApiPermission(request: Request, permission: ApiPermission): Promise<{ ok: true; email: string; role: UserRole } | { ok: false; response: NextResponse }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Firebase auth token is required." }, { status: 401 }) };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const email = decoded.email ?? "";
    const role = getUserRole(email);
    if (!permissionRoles[permission].includes(role)) {
      return { ok: false, response: NextResponse.json({ error: "Permission denied." }, { status: 403 }) };
    }
    return { ok: true, email, role };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid Firebase auth token." }, { status: 401 }) };
  }
}
