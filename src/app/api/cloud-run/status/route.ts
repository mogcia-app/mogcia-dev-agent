import { NextResponse } from "next/server";
import { getCloudRunWorkerUrl } from "@/lib/cloud-run/worker";

export async function GET() {
  const workerUrl = getCloudRunWorkerUrl();

  return NextResponse.json({
    configured: Boolean(workerUrl),
    workerUrl
  });
}
