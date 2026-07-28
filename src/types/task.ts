import type { Timestamp } from "firebase/firestore";

export type TaskStatus = "todo" | "in_progress" | "waiting" | "completed" | "cancelled";
export type TaskPriority = "high" | "medium" | "low";
export type TaskSource = "ai" | "manual" | "automation";
export type TaskView = "mine" | "ai" | "members" | "assigned" | "log";
export type TaskStatusFilter = "all" | "open" | "today" | "hasDue" | "overdue" | "completed";
export type TaskDueFilter = "all" | "today" | "tomorrow" | "week" | "month" | "overdue" | "none";
export type TaskSort = "dueAsc" | "dueDesc" | "priorityDesc" | "newest" | "oldest" | "creator" | "assignee";

export type TaskSourceType = "meeting" | "memo" | "requirement" | "email" | "other";

export interface TaskChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export type TaskProgressLogType = "created" | "progress" | "status" | "assignee" | "completed" | "reopened";

export interface TaskProgressLog {
  id: string;
  type: TaskProgressLogType;
  title: string;
  content?: string;
  userId: string;
  userName: string;
  createdAt: Timestamp;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  aiGenerated: boolean;
  aiReason?: string;
  sourceType?: TaskSourceType;
  sourceId?: string | null;
  assigneeId: string;
  assigneeName?: string;
  createdBy: string;
  createdByName?: string;
  companyId?: string | null;
  companyName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  meetingId?: string | null;
  meetingTitle?: string | null;
  dueDate?: Timestamp | null;
  completedAt?: Timestamp | null;
  checklist?: TaskChecklistItem[];
  comments?: string;
  progressLogs?: TaskProgressLog[];
  sortOrder?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  assigneeId: string;
  assigneeName: string;
  companyId: string;
  companyName: string;
  projectId: string;
  projectName: string;
  meetingId: string;
  meetingTitle: string;
  dueDate: string;
  dueTime: string;
  aiReason: string;
  comments: string;
  checklistText: string;
}

export interface MemberOption {
  id: string;
  name: string;
}
