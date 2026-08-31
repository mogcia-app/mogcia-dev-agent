import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { createLead, listLeads, toDesktopLeadPayload, updateLead } from "@/lib/server/business/lead-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "lead_read", async () => ({ leads: (await listLeads(toBusinessAuth(auth), { limit: 400 })).map(toDesktopLeadPayload) }));
    return desktopSuccess(data);
  } catch (error) { return desktopFailure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "lead_create", () => createLead(toBusinessAuth(auth), body));
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) { return desktopFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "lead_update", () => updateLead(toBusinessAuth(auth), body), String(body.id ?? body.leadId ?? ""));
    return desktopSuccess({ lead: toDesktopLeadPayload(data.lead) });
  } catch (error) { return desktopFailure(error); }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  return { db: auth.db, userId: auth.userId, userName: getUserDisplayNameById(auth.userId), source: "desktop" as const, deviceId: auth.device.id };
}
