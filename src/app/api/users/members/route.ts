import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const [users, profiles] = await Promise.all([getAdminAuth().listUsers(1000), getAdminDb().collection("users").get()]);
    const memberIds = new Set(profiles.docs.filter((entry) => entry.data().disabled !== true).map((entry) => entry.id));
    return NextResponse.json({
      members: users.users
        .filter((user) => !user.disabled && memberIds.has(user.uid))
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
