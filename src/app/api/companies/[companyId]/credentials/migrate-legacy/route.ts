import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { auditCredential, createSecret, deleteSecret, requireCompanyAccess, workspaceFailure } from "@/lib/server/company-workspace";

const legacyEntries = [
  { passwordPath: "productAccountAccess.sns.instagram.password", keys: ["sns", "instagram"], serviceType: "instagram", label: "Instagram" },
  { passwordPath: "productAccountAccess.sns.tiktok.password", keys: ["sns", "tiktok"], serviceType: "tiktok", label: "TikTok" },
  { passwordPath: "productAccountAccess.commo.officialLine.password", keys: ["commo", "officialLine"], serviceType: "line", label: "公式LINE" }
] as const;

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const created: Array<{ id: string; secretReference: string }> = [];
  try {
    const { companyId } = await params;
    const { db, company, user } = await requireCompanyAccess(request, companyId, true);
    const legacy = company.data()?.productAccountAccess as Record<string, unknown> | undefined;
    const passwordRemovals: Record<string, unknown> = {};

    for (const entry of legacyEntries) {
      const value = nestedValue(legacy, entry.keys) as Record<string, unknown> | null;
      const password = stringValue(value?.password);
      if (!password) continue;

      const ref = db.collection("companyCredentials").doc();
      const secretReference = await createSecret(ref.id, password);
      created.push({ id: ref.id, secretReference });
      await ref.set({
        companyId,
        serviceType: entry.serviceType,
        label: entry.label,
        url: null,
        username: stringValue(value?.email) || stringValue(value?.accountName),
        secretReference,
        migratedFrom: entry.passwordPath,
        createdBy: user.uid,
        createdByName: user.name ?? user.email ?? "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      passwordRemovals[entry.passwordPath] = FieldValue.delete();
    }

    if (Object.keys(passwordRemovals).length) {
      await Promise.all(created.map((item) => auditCredential({ credentialId: item.id, companyId, action: "migrate", user })));
      await company.ref.update({ ...passwordRemovals, updatedAt: FieldValue.serverTimestamp() });
    }
    return Response.json({ success: true, data: { migrated: created.length } });
  } catch (error) {
    await Promise.all(created.map(async (item) => {
      await deleteSecret(item.secretReference).catch(() => undefined);
      await getAdminDb().collection("companyCredentials").doc(item.id).delete().catch(() => undefined);
    }));
    return workspaceFailure(error, "旧アクセス情報を移行できませんでした。");
  }
}

function nestedValue(root: Record<string, unknown> | undefined, keys: readonly string[]): unknown {
  return keys.reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : null, root);
}

function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
