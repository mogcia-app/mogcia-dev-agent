import { FieldValue } from "firebase-admin/firestore";
import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { assertFreshUpdate, defaultBusinessFields, optionalString, requireString, serializeDoc, updateBusinessFields } from "@/lib/server/business/api";
import { listBusinessTemplates } from "@/lib/server/business/template-service";
import { getUserDisplayNameById } from "@/lib/user-display";

const categories = ["email", "phone", "meeting", "proposal", "hearing", "line_sns", "internal", "other"];

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "template_read", async () => ({ templates: (await listBusinessTemplates(toBusinessAuth(auth), { limit: 500 })).map(toPayload) }));
    return desktopSuccess(data);
  } catch (error) { return desktopFailure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "テンプレート名", 160);
    const content = requireString(body.content, "テンプレート本文", 12000);
    const businessAuth = toBusinessAuth(auth);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "template_create", async () => {
      const ref = await auth.db.collection("businessTemplates").add({ title, content, subject: optionalString(body.subject, 300), description: optionalString(body.description, 1000), category: category(body.category), scene: optionalString(body.scene, 500), favorite: Boolean(body.favorite), usageCount: 0, lastUsedAt: null, ...defaultBusinessFields(businessAuth) });
      return { id: ref.id };
    });
    return desktopSuccess(data, 201);
  } catch (error) { return desktopFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const id = requireString(body.id, "テンプレートID", 160);
    const ref = auth.db.collection("businessTemplates").doc(id);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "template_update", async () => {
      const snapshot = await assertFreshUpdate(ref, body.updatedAt);
      const previous = snapshot.data() ?? {};
      await ref.set({ title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : previous.title, content: typeof body.content === "string" && body.content.trim() ? body.content.trim().slice(0, 12000) : previous.content, subject: optionalString(body.subject ?? previous.subject, 300), description: optionalString(body.description ?? previous.description, 1000), category: category(body.category ?? previous.category), scene: optionalString(body.scene ?? previous.scene, 500), favorite: typeof body.favorite === "boolean" ? body.favorite : Boolean(previous.favorite), id: FieldValue.delete(), ...updateBusinessFields(toBusinessAuth(auth)) }, { merge: true });
      const next = await ref.get(); return { template: toPayload(serializeDoc(next.id, next.data() ?? {})) };
    }, id);
    return desktopSuccess(data);
  } catch (error) { return desktopFailure(error); }
}

function category(value: unknown) { return typeof value === "string" && categories.includes(value) ? value : "other"; }
function toPayload(value: Record<string, unknown>) { return { id: String(value.id ?? ""), title: String(value.title ?? ""), subject: String(value.subject ?? ""), description: String(value.description ?? ""), category: category(value.category), scene: String(value.scene ?? ""), content: String(value.content ?? ""), favorite: Boolean(value.favorite), updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null }; }
function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) { return { db: auth.db, userId: auth.userId, userName: getUserDisplayNameById(auth.userId), source: "desktop" as const, deviceId: auth.device.id }; }
