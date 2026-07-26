import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import type { CodexCliRun } from "@/domain/types";

interface CodexCliRequest {
  projectId?: string;
  taskTitle?: string;
  taskBody?: string;
  createdBy?: string;
}

export async function POST(request: Request) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error: "Codex CLI task export is local-only. Run it from the local MOGCIA workspace."
      },
      { status: 409 }
    );
  }

  const body = (await request.json()) as CodexCliRequest;
  const taskTitle = body.taskTitle?.trim() || "MOGCIA Dev Agent Task";
  const taskBody = body.taskBody?.trim() || "ローカルDemoまたは開発補助タスクを確認してください。";
  const outputDir = path.join(process.cwd(), ".mogcia");
  const outputPath = path.join(outputDir, "codex-task.md");
  const codexVersion = spawnSync("codex", ["--version"], { encoding: "utf8" });
  const available = codexVersion.status === 0;

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    outputPath,
    [`# ${taskTitle}`, "", `Project: ${body.projectId ?? "shared"}`, `Created by: ${body.createdBy ?? "local-user"}`, "", taskBody].join("\n")
  );

  const run: CodexCliRun = {
    id: `codex-cli-${crypto.randomUUID()}`,
    projectId: body.projectId,
    taskTitle,
    command: available ? `codex "${taskTitle}"` : "codex --version",
    status: available ? "ready" : "unavailable",
    output: available ? `Codex CLI available. Task written to ${outputPath}` : `Codex CLI not found. Task written to ${outputPath}`,
    createdAt: new Date().toISOString(),
    createdBy: body.createdBy ?? "local-user"
  };

  return NextResponse.json({ run });
}
