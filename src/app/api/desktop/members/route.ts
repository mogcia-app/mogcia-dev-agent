import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    await requireDesktopUserFromRequest(request);
    const [users, profiles] = await Promise.all([getAdminAuth().listUsers(1000), getAdminDb().collection("users").get()]);
    const memberIds = new Set(profiles.docs.filter((entry) => entry.data().disabled !== true).map((entry) => entry.id));
    const members = users.users.filter((entry) => !entry.disabled && memberIds.has(entry.uid)).map((entry) => ({ id: entry.uid, name: getUserDisplayNameById(entry.uid, entry.displayName || entry.email || null) })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return NextResponse.json({ success: true, data: { members } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "社員一覧を取得できませんでした。" } }, { status: 400 });
  }
}
