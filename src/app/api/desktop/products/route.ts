import { FieldValue } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess, optionalString, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { findNameDuplicates, normalizeComparableName } from "@/lib/server/duplicate-utils";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireString(body.name, "商品名", 200);
    const force = body.force === true;
    const userName = getUserDisplayNameById(auth.userId);
    const data = await withDesktopAudit(context, "product_create", async () => {
      const snapshot = await auth.db.collection("products").orderBy("updatedAt", "desc").limit(400).get();
      const products: DocumentData[] = snapshot.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() }));
      const duplicates = findNameDuplicates(products, name, ["name", "displayName"]);
      if (duplicates.length && !force) return { requiresConfirmation: true, duplicates: duplicates.slice(0, 5).map((item) => ({ id: item.id, name: item.name })) };
      const ref = await auth.db.collection("products").add({
        name,
        displayName: optionalString(body.displayName, "表示名", 200) || name,
        slug: normalizeComparableName(name) || `product-${Date.now()}`,
        productType: typeof body.productType === "string" ? body.productType : "other",
        categoryIds: [],
        categoryNames: [],
        tagline: optionalString(body.tagline, "一言説明", 300),
        summary: optionalString(body.summary, "概要", 5000),
        status: "draft",
        resources: [],
        ownerId: auth.userId,
        ownerName: userName,
        favoriteUserIds: [],
        createdBy: auth.userId,
        createdByName: userName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { productId: ref.id, requiresConfirmation: false };
    });
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(error);
  }
}
