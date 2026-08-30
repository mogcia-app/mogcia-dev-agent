import { FieldValue } from "firebase-admin/firestore";
import { assertFreshUpdate, authenticateBusinessRequest, businessFailure, businessSuccess, defaultBusinessFields, optionalString, requireString, serializeDoc, updateBusinessFields, withBusinessAudit } from "@/lib/server/business/api";

export const runtime = "nodejs";

const categories = ["email", "phone", "meeting", "proposal", "hearing", "line_sns", "internal", "other"];

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request);
    const data = await withBusinessAudit(auth, "business_template_read", async () => {
      const snapshot = await auth.db.collection("businessTemplates").orderBy("updatedAt", "desc").limit(500).get();
      return { templates: snapshot.docs.map((entry) => serializeDoc(entry.id, entry.data())) };
    });
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "テンプレート名", 160);
    const content = requireString(body.content, "テンプレート本文", 12000);
    const data = await withBusinessAudit(auth, "business_template_create", async () => {
      const ref = await auth.db.collection("businessTemplates").add({
        title,
        description: optionalString(body.description, 1000),
        category: normalizeCategory(body.category),
        scene: optionalString(body.scene, 500),
        content,
        favorite: Boolean(body.favorite),
        usageCount: 0,
        lastUsedAt: null,
        ...defaultBusinessFields(auth)
      });
      return { id: ref.id };
    });
    return businessSuccess(data, 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const id = requireString(body.id, "テンプレートID", 160);
    const ref = auth.db.collection("businessTemplates").doc(id);
    const data = await withBusinessAudit(auth, "business_template_update", async () => {
      const snapshot = await assertFreshUpdate(ref, body.updatedAt);
      const previous = snapshot.data() ?? {};
      const patch = {
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : previous.title,
        description: optionalString(body.description ?? previous.description, 1000),
        category: normalizeCategory(body.category ?? previous.category),
        scene: optionalString(body.scene ?? previous.scene, 500),
        content: typeof body.content === "string" && body.content.trim() ? body.content.trim().slice(0, 12000) : previous.content,
        favorite: typeof body.favorite === "boolean" ? body.favorite : Boolean(previous.favorite),
        id: FieldValue.delete(),
        ...updateBusinessFields(auth)
      };
      await ref.set(patch, { merge: true });
      const next = await ref.get();
      return { template: serializeDoc(next.id, next.data() ?? {}) };
    }, id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const id = requireString(body.id, "テンプレートID", 160);
    const data = await withBusinessAudit(auth, "business_template_delete", async () => {
      await auth.db.collection("businessTemplates").doc(id).delete();
      return { id };
    }, id);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

function normalizeCategory(value: unknown) {
  return typeof value === "string" && categories.includes(value) ? value : "other";
}
