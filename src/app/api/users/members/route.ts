import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const users = await getAdminAuth().listUsers(1000);
    return NextResponse.json({
      members: users.users
        .filter((user) => !user.disabled)
        .map((user) => ({
          uid: user.uid,
          name: getUserDisplayNameById(user.uid, user.displayName || user.email || null),
          email: user.email ?? ""
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    });
  } catch (error) {
    return NextResponse.json({
      members: DEFAULT_WORKSPACE_MEMBERS,
      warning: error instanceof Error ? error.message : "メンバーを取得できませんでした"
    });
  }
}
