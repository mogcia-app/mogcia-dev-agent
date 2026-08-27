import { NextResponse } from "next/server";
import { selectAgentCandidate } from "@/lib/server/agent/executor";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<unknown> }) {
  try {
    const user = await requireUserFromRequest(request);
    const resolvedParams = await params as { runId?: string };
    const body = (await request.json()) as Record<string, unknown>;
    const result = await selectAgentCandidate({
      user: { uid: user.uid, name: user.name },
      runId: String(resolvedParams.runId ?? ""),
      candidateId: String(body.candidateId ?? "")
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "候補を選択できませんでした。" } }, { status: 400 });
  }
}
