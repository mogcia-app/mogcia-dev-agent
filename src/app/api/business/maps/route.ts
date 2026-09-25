import { authenticateBusinessRequest, businessFailure, businessSuccess, withBusinessAudit } from "@/lib/server/business/api";
import { createSystemMapEntity, deleteSystemMapEntity, listSystemMaps, updateSystemMapEntity } from "@/lib/server/business/system-map-service";

export const runtime = "nodejs";

export async function GET(request: Request) { try { const auth = await authenticateBusinessRequest(request, "readCompanies"); return businessSuccess(await listSystemMaps(auth)); } catch (error) { return businessFailure(error); } }
export async function POST(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, `system_map_${String(body.entity ?? "map")}_create`, () => createSystemMapEntity(auth, body)), 201); } catch (error) { return businessFailure(error); } }
export async function PATCH(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, `system_map_${String(body.entity ?? "map")}_update`, () => updateSystemMapEntity(auth, body))); } catch (error) { return businessFailure(error); } }
export async function DELETE(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, `system_map_${String(body.entity ?? "map")}_delete`, () => deleteSystemMapEntity(auth, body))); } catch (error) { return businessFailure(error); } }
