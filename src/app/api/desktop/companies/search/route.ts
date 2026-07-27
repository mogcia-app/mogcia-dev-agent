import { desktopFailure, desktopSuccess, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { toDesktopCompany } from "@/lib/desktop/format";

export async function GET(request: Request) {
  let context: { userId: string; deviceId: string } | null = null;
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    context = { userId: auth.userId, deviceId: auth.device.id };
    const url = new URL(request.url);
    const keyword = requireString(url.searchParams.get("q"), "検索キーワード", 100).toLowerCase();

    const data = await withDesktopAudit(context, "company_search", async () => {
      const snapshot = await auth.db.collection("companies").orderBy("updatedAt", "desc").limit(200).get();
      const companies = snapshot.docs
        .map((entry) => ({ id: entry.id, data: entry.data() }))
        .filter(({ data }) => matchesCompany(data, keyword))
        .slice(0, 20)
        .map(({ id, data }) => toDesktopCompany(id, data));
      return { companies };
    });

    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function matchesCompany(data: FirebaseFirestore.DocumentData, keyword: string): boolean {
  const fields = [
    data.name,
    data.nameKana,
    data.primaryContactName,
    data.internalOwnerName,
    data.phone,
    data.email,
    ...(Array.isArray(data.tags) ? data.tags : [])
  ];
  return fields.some((value) => String(value ?? "").toLowerCase().includes(keyword));
}
