import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";

export async function GET(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request, "readCompanies"); const db = getAdminDb();
    const activities = await db.collection("activities").where("createdBy", "==", user.uid).limit(100).get();
    const sorted = activities.docs.sort((a, b) => (b.data().occurredAt?.toMillis?.() ?? 0) - (a.data().occurredAt?.toMillis?.() ?? 0));
    const ids = Array.from(new Set(sorted.map((entry) => String(entry.data().companyId || "")).filter(Boolean))).slice(0, 5);
    const snapshots = ids.length ? await db.getAll(...ids.map((id) => db.collection("companies").doc(id))) : [];
    const companies = snapshots.filter((entry) => entry.exists).map((entry) => ({ id: entry.id, name: String(entry.data()?.name || "会社"), contactName: String(entry.data()?.primaryContactName || ""), nextAction: String(entry.data()?.nextActionTitle || "") }));
    return NextResponse.json({ success: true, data: { companies } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "recent_companies_failed" } }, { status: 400 });
  }
}
