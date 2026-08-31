import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { timestampToIso } from "@/lib/desktop/format";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "analysis_read", async () => {
      const snapshot = await auth.db.collection("teleapoRecords").orderBy("updatedAt", "desc").limit(100).get();
      return { analyses: snapshot.docs.map((entry) => { const value = entry.data(); const preparation = value.aiAdvice?.meetingPreparation; return { id: entry.id, companyName: String(value.customerName ?? ""), contactName: String(value.contactName ?? ""), productName: String(value.productName ?? ""), salesDomain: value.salesDomain === "meeting" ? "meeting" : "teleapo", status: String(value.aiAdviceStatus ?? value.transcriptionStatus ?? "draft"), summary: String(preparation?.prospectScore?.reason ?? value.memo ?? value.meetingMemo ?? ""), score: typeof preparation?.prospectScore?.score === "number" ? preparation.prospectScore.score : null, rank: String(preparation?.prospectScore?.rank ?? ""), recordedAt: timestampToIso(value.recordedAt), updatedAt: timestampToIso(value.updatedAt), targetURL: `/sales/analysis?recordId=${entry.id}` }; }) };
    });
    return desktopSuccess(data);
  } catch (error) { return desktopFailure(error); }
}
