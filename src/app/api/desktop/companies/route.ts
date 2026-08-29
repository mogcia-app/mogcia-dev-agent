import { FieldValue } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess, optionalString, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { findNameDuplicates } from "@/lib/server/duplicate-utils";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireString(body.name, "会社名", 200);
    const force = body.force === true;
    const userName = getUserDisplayNameById(auth.userId);
    const data = await withDesktopAudit(context, "company_create", async () => {
      const snapshot = await auth.db.collection("companies").orderBy("updatedAt", "desc").limit(400).get();
      const companies: DocumentData[] = snapshot.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() }));
      const duplicates = findNameDuplicates(companies, name, ["name", "nameKana"]);
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates: duplicates.slice(0, 5).map((item) => ({ id: item.id, name: item.name })) };
      const ref = await auth.db.collection("companies").add({
        name,
        nameKana: optionalString(body.nameKana, "フリガナ", 200),
        industry: optionalString(body.industry, "業種", 120),
        phone: optionalString(body.phone, "電話番号", 80),
        email: optionalString(body.email, "メールアドレス", 160),
        website: optionalString(body.website, "Webサイト", 300),
        status: "lead",
        customerRank: "C",
        contacts: [],
        primaryContactName: optionalString(body.primaryContactName, "担当者名", 120),
        internalOwnerId: auth.userId,
        internalOwnerName: userName,
        productIds: [],
        productNames: [],
        tags: [],
        favoriteUserIds: [],
        notes: optionalString(body.notes, "メモ", 5000),
        createdBy: auth.userId,
        createdByName: userName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { companyId: ref.id, requiresConfirmation: false };
    });
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
