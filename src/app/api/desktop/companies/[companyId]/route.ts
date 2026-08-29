import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
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
      const logs = await auth.db.collection("companies").doc(companyId).collection("activityLogs").orderBy("occurredAt", "desc").limit(5).get();
      const tasks = await auth.db.collection("tasks").where("companyId", "==", companyId).limit(12).get();
      const openTasks = tasks.docs.map((entry) => toDesktopTask(entry.id, entry.data())).filter((task) => task.status !== "completed" && task.status !== "cancelled");
      return {
        company: {
          id: companySnapshot.id,
          name: String(company.name ?? ""),
          primaryContactName: String(company.primaryContactName ?? ""),
          phone: String(company.phone ?? ""),
          email: String(company.email ?? ""),
          productNames: Array.isArray(company.productNames) ? company.productNames : [],
          nextActionTitle: String(company.nextActionTitle ?? ""),
          nextActionAt: timestampToIso(company.nextActionAt),
          aiSuggestion: company.nextActionTitle ? "次回対応の期限を確認しておくとよさそうです。" : "次回対応を設定しておくとよさそうです。"
        },
        recentLogs: logs.docs.map((entry) => ({ id: entry.id, title: String(entry.data().title ?? ""), occurredAt: timestampToIso(entry.data().occurredAt) })),
        tasks: openTasks.slice(0, 6)
      };
    }, companyId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}
