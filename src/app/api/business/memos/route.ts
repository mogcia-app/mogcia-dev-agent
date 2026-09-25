import { authenticateBusinessRequest, businessFailure, businessSuccess, withBusinessAudit } from "@/lib/server/business/api";
import { createMemo, deleteMemo, listMemos, updateMemo } from "@/lib/server/business/memo-service";

export const runtime = "nodejs";
export async function GET(request: Request) { try { const auth = await authenticateBusinessRequest(request, "readCompanies"); return businessSuccess(await listMemos(auth)); } catch (error) { return businessFailure(error); } }
export async function POST(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, "memo_create", () => createMemo(auth, body)), 201); } catch (error) { return businessFailure(error); } }
export async function PATCH(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, "memo_update", () => updateMemo(auth, body))); } catch (error) { return businessFailure(error); } }
export async function DELETE(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, "memo_delete", () => deleteMemo(auth, body))); } catch (error) { return businessFailure(error); } }
