import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { createProject, deleteProject, listProjects, updateProject } from "@/lib/server/business/project-service";

export const runtime = "nodejs";

export async function GET(request: Request) { try { const auth = await authenticateBusinessRequest(request, "readCompanies"); return businessSuccess({ projects: await listProjects(auth) }); } catch (error) { return businessFailure(error); } }
export async function POST(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; return businessSuccess(await withBusinessAudit(auth, "business_project_create", () => createProject(auth, body)), 201); } catch (error) { return businessFailure(error); } }
export async function PATCH(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; const id = requireString(body.id, "プロジェクトID", 160); return businessSuccess(await withBusinessAudit(auth, "business_project_update", () => updateProject(auth, body), id)); } catch (error) { return businessFailure(error); } }
export async function DELETE(request: Request) { try { const auth = await authenticateBusinessRequest(request, "createTasks"); const body = await request.json() as Record<string, unknown>; const id = requireString(body.id, "プロジェクトID", 160); return businessSuccess(await withBusinessAudit(auth, "business_project_delete", () => deleteProject(auth, id), id)); } catch (error) { return businessFailure(error); } }
