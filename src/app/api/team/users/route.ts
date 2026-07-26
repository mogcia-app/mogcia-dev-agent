import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { requireApiPermission } from "@/lib/server/api-permissions";

export async function GET(request: Request) {
  const permission = await requireApiPermission(request, "meeting:write");
  if (!permission.ok) return permission.response;

  const users = await getAdminAuth().listUsers(1000);

  return NextResponse.json({
    users: users.users.map((user) => ({
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? user.email ?? "名前未設定",
      disabled: user.disabled
    }))
  });
}
