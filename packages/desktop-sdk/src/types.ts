export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface DesktopConfig {
  baseUrl: string;
  token: string;
}

export interface DesktopCompanyResult {
  id: string;
  name: string;
  industry?: string;
  primaryContactName?: string;
  internalOwnerName?: string;
  lastContactAt?: string | null;
}

export interface DesktopTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  source: string;
  companyId?: string | null;
  companyName?: string | null;
  dueDate?: string | null;
}

export interface ParsedDesktopMemo {
  companyCandidates?: Array<{ id: string; name: string; confidence: number }>;
  activityLog?: {
    selected: boolean;
    type: "phone" | "email" | "visit" | "meeting" | "memo" | "other";
    title: string;
    content: string;
    occurredAt?: string | null;
  };
  suggestedTasks: Array<{
    tempId: string;
    selected: boolean;
    title: string;
    description?: string;
    dueDate?: string | null;
    priority: "high" | "medium" | "low";
    reason: string;
  }>;
  companyNotes: Array<{ tempId: string; selected: boolean; content: string }>;
  warnings?: string[];
}

export interface CommitMemoInput {
  memoId?: string;
  companyId: string;
  originalText: string;
  activityLog?: ParsedDesktopMemo["activityLog"] | null;
  tasks?: ParsedDesktopMemo["suggestedTasks"];
  companyNotes?: ParsedDesktopMemo["companyNotes"];
  createdFrom?: "cli" | "menubar" | "floating_window";
}
