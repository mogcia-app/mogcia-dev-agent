import type { ApiResponse, CommitMemoInput, DesktopCompanyResult, DesktopConfig, DesktopTask, ParsedDesktopMemo } from "./types";

export class MogciaDesktopApiError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export class MogciaDesktopClient {
  constructor(private config: DesktopConfig) {}

  async verify() {
    return this.request<{ userId: string; device: { id: string; deviceName: string; status: string } }>("/api/desktop/auth/verify");
  }

  async searchCompanies(q: string) {
    return this.request<{ companies: DesktopCompanyResult[] }>(`/api/desktop/companies/search?q=${encodeURIComponent(q)}`);
  }

  async todayTasks() {
    return this.request<{ tasks: DesktopTask[] }>("/api/desktop/tasks/today");
  }

  async createTask(input: { title: string; description?: string; companyId?: string | null; dueDate?: string | null; priority?: "high" | "medium" | "low" }) {
    return this.request<{ taskId: string }>("/api/desktop/tasks", { method: "POST", body: JSON.stringify(input) });
  }

  async createActivityLog(input: { companyId: string; type: string; title: string; content?: string; occurredAt?: string }) {
    return this.request<{ activityLogId: string }>("/api/desktop/activity-logs", { method: "POST", body: JSON.stringify(input) });
  }

  async parseMemo(input: { text: string; companyId?: string | null; createdFrom?: "cli" | "menubar" | "floating_window" }) {
    return this.request<{ memoId: string; parsed: ParsedDesktopMemo }>("/api/desktop/memos/parse", { method: "POST", body: JSON.stringify(input) });
  }

  async commitMemo(input: CommitMemoInput) {
    return this.request<{ memoId: string; activityLogId: string | null; taskIds: string[]; companyNoteIds: string[] }>("/api/desktop/memos/commit", { method: "POST", body: JSON.stringify(input) });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });
    const text = await response.text();
    let result: ApiResponse<T>;
    try {
      result = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new MogciaDesktopApiError("INVALID_RESPONSE", response.ok ? "APIの応答形式が正しくありません" : `サーバーへ接続できませんでした (${response.status})`);
    }
    if (!result.success) throw new MogciaDesktopApiError(result.error.code, result.error.message);
    return result.data;
  }
}
