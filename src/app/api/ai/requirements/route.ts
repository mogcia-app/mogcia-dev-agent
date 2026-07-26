import { NextResponse } from "next/server";
import { generateRequirementsWithClaude } from "@/lib/server/claude-requirements";
import type { Client, MinutesRecord, Project, RuleLayer } from "@/domain/types";

export const maxDuration = 60;

interface RequirementsRequestBody {
  client?: Client;
  project?: Project;
  minutes?: MinutesRecord;
  ruleLayers?: RuleLayer[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequirementsRequestBody;
    if (!body.client || !body.project || !body.minutes) {
      return NextResponse.json({ error: "client, project, and minutes are required." }, { status: 400 });
    }

    const draft = await generateRequirementsWithClaude({
      client: body.client,
      project: body.project,
      minutes: body.minutes,
      ruleLayers: body.ruleLayers ?? []
    });

    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate requirements.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
