import { DesktopApiError, desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { deleteRecentKnowledgeNode, listRecentKnowledgeNodes, recordRecentKnowledgeNode } from "@/lib/server/agent-knowledge";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const url = new URL(request.url);
    const limitValue = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.floor(limitValue), 1), 100) : 20;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_knowledge_recent", async () => ({ items: await listRecentKnowledgeNodes(auth.userId, limit) }));
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const nodeId = readNodeId(body.nodeId);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_knowledge_recent", () => recordRecentKnowledgeNode(auth.userId, nodeId), nodeId);
    return desktopSuccess(data, 201);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const body = (await request.json()) as Record<string, unknown>;
    const nodeId = readNodeId(body.nodeId);
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "agent_knowledge_recent", () => deleteRecentKnowledgeNode(auth.userId, nodeId), nodeId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function readNodeId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new DesktopApiError("VALIDATION_ERROR", "ページIDを入力してください", 400);
  return value.trim().slice(0, 160);
}
