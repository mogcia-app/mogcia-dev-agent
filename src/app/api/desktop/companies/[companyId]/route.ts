import { FieldValue } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess, optionalString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { timestampToIso, toDesktopCompany, toDesktopTask } from "@/lib/desktop/format";

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const { companyId } = await params;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "company_search", async () => {
      const companySnapshot = await auth.db.collection("companies").doc(companyId).get();
      if (!companySnapshot.exists) throw new Error("会社が見つかりません。");
      const rawCompany = companySnapshot.data() ?? {};
      const company: FirebaseFirestore.DocumentData = { ...toDesktopCompany(companySnapshot.id, rawCompany), ...rawCompany };
      const [legacyLogs, activities, tasks, nextEvents] = await Promise.all([
        auth.db.collection("companies").doc(companyId).collection("activityLogs").orderBy("occurredAt", "desc").limit(5).get(),
        auth.db.collection("activities").where("companyId", "==", companyId).orderBy("occurredAt", "desc").limit(10).get(),
        auth.db.collection("tasks").where("companyId", "==", companyId).limit(12).get(),
        auth.db.collection("calendarEvents").where("companyId", "==", companyId).orderBy("startAt", "asc").limit(5).get()
      ]);
      const openTasks = tasks.docs.map((entry) => toDesktopTask(entry.id, entry.data())).filter((task) => task.status !== "completed" && task.status !== "cancelled");
      const recentLogs = [
        ...activities.docs.map((entry) => ({ id: entry.id, title: String(entry.data().title ?? ""), content: String(entry.data().content ?? ""), occurredAt: timestampToIso(entry.data().occurredAt) })),
        ...legacyLogs.docs.map((entry) => ({ id: entry.id, title: String(entry.data().title ?? ""), content: String(entry.data().content ?? ""), occurredAt: timestampToIso(entry.data().occurredAt) }))
      ].slice(0, 8);
      return {
        company: {
          id: companySnapshot.id,
          name: String(company.name ?? ""),
          industry: String(company.industry ?? ""),
          status: String(company.status ?? ""),
          internalOwnerName: String(company.internalOwnerName ?? ""),
          primaryContactName: String(company.primaryContactName ?? ""),
          phone: String(company.phone ?? ""),
          email: String(company.email ?? ""),
          productNames: Array.isArray(company.productNames) ? company.productNames : [],
          nextActionTitle: String(company.nextActionTitle ?? ""),
          nextActionAt: timestampToIso(company.nextActionAt),
          targetURL: `/sales/companies?companyId=${companySnapshot.id}`,
          aiSuggestion: company.nextActionTitle ? "次回対応の期限を確認しておくとよさそうです。" : "次回対応を設定しておくとよさそうです。"
        },
        recentLogs,
        tasks: openTasks.slice(0, 6),
        nextEvents: nextEvents.docs.map((entry) => ({
          id: entry.id,
          title: String(entry.data().title ?? ""),
          startAt: timestampToIso(entry.data().startAt),
          endAt: timestampToIso(entry.data().endAt)
        }))
      };
    }, companyId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const { companyId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "company_create", async () => {
      const ref = auth.db.collection("companies").doc(companyId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error("会社が見つかりません。");
      await ref.set({
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
        industry: optionalString(body.industry ?? snapshot.data()?.industry, "業種", 120),
        status: optionalString(body.status ?? snapshot.data()?.status, "状態", 80) || "lead",
        primaryContactName: optionalString(body.primaryContactName ?? snapshot.data()?.primaryContactName, "担当者名", 120) || null,
        phone: optionalString(body.phone ?? snapshot.data()?.phone, "電話番号", 80),
        email: optionalString(body.email ?? snapshot.data()?.email, "メールアドレス", 160),
        notes: optionalString(body.notes ?? snapshot.data()?.notes, "メモ", 5000),
        updatedBy: auth.userId,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      const next = await ref.get();
      return { company: { id: next.id, ...next.data(), updatedAt: timestampToIso(next.data()?.updatedAt) } };
    }, companyId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
