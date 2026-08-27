import { NextResponse } from "next/server";
import { createDevelopmentProject, listDevelopmentProjects } from "@/lib/server/agent/repository";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const projects = await listDevelopmentProjects();
    return NextResponse.json({ success: true, data: { projects } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "開発プロジェクトを取得できませんでした。" } }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createDevelopmentProject({
      name: String(body.name ?? ""),
      slug: String(body.slug ?? ""),
      description: typeof body.description === "string" ? body.description : "",
      repositoryUrl: typeof body.repositoryUrl === "string" ? body.repositoryUrl : "",
      repositoryOwner: typeof body.repositoryOwner === "string" ? body.repositoryOwner : "",
      repositoryName: typeof body.repositoryName === "string" ? body.repositoryName : "",
      defaultBranch: typeof body.defaultBranch === "string" ? body.defaultBranch : "main",
      projectKey: typeof body.projectKey === "string" ? body.projectKey : "",
      requiredCapabilities: Array.isArray(body.requiredCapabilities) ? body.requiredCapabilities.filter((item): item is string => typeof item === "string") : ["codex", "git", "node"],
      validationCommands: Array.isArray(body.validationCommands) ? body.validationCommands.filter((item): item is string => typeof item === "string") : ["npm run typecheck", "npm run lint", "npm run build"],
      framework: typeof body.framework === "string" ? body.framework : "",
      packageManager: typeof body.packageManager === "string" ? body.packageManager : "",
      productionUrl: typeof body.productionUrl === "string" ? body.productionUrl : "",
      previewUrl: typeof body.previewUrl === "string" ? body.previewUrl : "",
      isActive: body.isActive !== false
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "開発プロジェクトを作成できませんでした。" } }, { status: 400 });
  }
}
