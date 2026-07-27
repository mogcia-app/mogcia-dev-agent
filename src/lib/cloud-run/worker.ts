export function getCloudRunWorkerUrl(): string | null {
  const url = process.env.CLOUD_RUN_WORKER_URL || process.env.MOGCIA_TRANSCRIBE_WORKER_URL;
  return url && url.trim().length > 0 ? url.trim().replace(/\/$/, "") : null;
}

export function isCloudRunConfigured(): boolean {
  return getCloudRunWorkerUrl() !== null;
}

export async function callCloudRunWorker<TResponse>({
  path,
  init
}: {
  path: string;
  init?: RequestInit;
}): Promise<TResponse> {
  const baseUrl = getCloudRunWorkerUrl();
  if (!baseUrl) throw new Error("Cloud Run worker URL is not configured.");

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init?.headers);
  if (process.env.WORKER_SHARED_SECRET) headers.set("x-worker-secret", process.env.WORKER_SHARED_SECRET);
  const response = await fetch(`${baseUrl}${normalizedPath}`, { ...init, headers });
  if (!response.ok) throw new Error(`Cloud Run worker request failed: ${response.status}`);

  return response.json() as Promise<TResponse>;
}
