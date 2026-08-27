import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireUserFromRequest } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const installer = await readFile(path.join(process.cwd(), "distribution", "MOGCIA-latest.pkg"));
    return new Response(installer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "attachment; filename=\"MOGCIA-latest.pkg\"",
        "Content-Type": "application/vnd.apple.installer+xml"
      }
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error instanceof Error ? error.message : "ダウンロードできませんでした。" } }, { status: 401 });
  }
}
