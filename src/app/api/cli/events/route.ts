import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CliEvent {
  id?: string;
  command?: string;
  projectId?: string;
  projectName?: string;
  status?: "started" | "completed" | "failed" | "info";
  summary?: string;
  previewUrl?: string;
  createdAt?: string;
  source?: string;
}

type PersistedCliEvent = Required<CliEvent>;

const collectionName = "cliEvents";

function isAuthorized(request: Request): boolean {
  const expectedToken = process.env.MOGCIA_CLI_TOKEN;
  if (!expectedToken) return true;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${expectedToken}`;
}

function normalizeEvent(input: CliEvent): PersistedCliEvent {
  return {
    id: input.id?.slice(0, 120) || `cli-event-${crypto.randomUUID()}`,
    command: input.command?.slice(0, 80) || "mogcia",
    projectId: input.projectId?.slice(0, 120) || "shared",
    projectName: input.projectName?.slice(0, 160) || "MOGCIA Dev Agent",
    status: input.status || "info",
    summary: input.summary?.slice(0, 240) || "CLIからイベントを受信しました。",
    previewUrl: input.previewUrl?.slice(0, 240) || "",
    createdAt: input.createdAt || new Date().toISOString(),
    source: input.source?.slice(0, 80) || "mogcia-cli"
  };
}

export async function GET() {
  const db = getAdminDb();
  const snapshot = await db.collection(collectionName).orderBy("createdAt", "desc").limit(60).get();
  const events = snapshot.docs.map((doc) => doc.data() as PersistedCliEvent);

  return NextResponse.json({
    events,
    latest: events[0] ?? null
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CliEvent;
  const event = normalizeEvent(body);
  const db = getAdminDb();
  await db.collection(collectionName).doc(event.id).set(
    {
      ...event,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );

  return NextResponse.json({ event });
}
