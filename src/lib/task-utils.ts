import { Timestamp } from "firebase/firestore";
import type { MemberOption, Task, TaskDraft, TaskDueFilter, TaskPriority, TaskSort, TaskStatusFilter, TaskView } from "@/types/task";

export const ADMIN_UID = "TjDadmBAdVYaPEvG3ppfBLS4HGN2";

export function isAdminUser(uid?: string | null): boolean {
  return uid === ADMIN_UID;
}

export function createEmptyTaskDraft(currentUser: MemberOption): TaskDraft {
  return {
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    source: "manual",
    assigneeId: currentUser.id,
    assigneeName: currentUser.name,
    companyId: "",
    companyName: "",
    productId: "",
    productName: "",
    projectId: "",
    projectName: "",
    meetingId: "",
    meetingTitle: "",
    dueDate: "",
    dueTime: "",
    aiReason: "",
    comments: "",
    checklistText: ""
  };
}

export function taskToDraft(task: Task): TaskDraft {
  const due = task.dueDate?.toDate();
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    source: task.source,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName ?? "",
    companyId: task.companyId ?? "",
    companyName: task.companyName ?? "",
    productId: task.productId ?? "",
    productName: task.productName ?? "",
    projectId: task.projectId ?? "",
    projectName: task.projectName ?? "",
    meetingId: task.meetingId ?? "",
    meetingTitle: task.meetingTitle ?? "",
    dueDate: due ? toDateInputValue(due) : "",
    dueTime: due ? toTimeInputValue(due) : "",
    aiReason: task.aiReason ?? "",
    comments: task.comments ?? "",
    checklistText: (task.checklist ?? []).map((item) => item.title).join("\n")
  };
}

export function draftToTaskPayload(draft: TaskDraft, currentUser: MemberOption) {
  const dueDate = parseDueDate(draft.dueDate, draft.dueTime);

  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    status: draft.status,
    priority: draft.priority,
    source: draft.source,
    aiGenerated: draft.source === "ai",
    aiReason: draft.source === "ai" ? draft.aiReason.trim() : "",
    sourceType: draft.source === "ai" ? "other" as const : null,
    sourceId: null,
    assigneeId: draft.assigneeId || currentUser.id,
    assigneeName: draft.assigneeName || currentUser.name,
    createdByName: currentUser.name,
    companyId: draft.companyId || null,
    companyName: draft.companyName.trim() || null,
    productId: draft.productId || null,
    productName: draft.productName.trim() || null,
    projectId: draft.projectId || null,
    projectName: draft.projectName.trim() || null,
    meetingId: draft.meetingId || null,
    meetingTitle: draft.meetingTitle.trim() || null,
    dueDate,
    checklist: [],
    comments: draft.comments.trim()
  };
}

export function parseDueDate(date: string, time: string): Timestamp | null {
  if (!date) return null;
  const value = new Date(`${date}T${time || "23:59"}`);
  if (Number.isNaN(value.getTime())) return null;
  return Timestamp.fromDate(value);
}

export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatTaskDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

export function formatTaskTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function isSameDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === "completed") return false;
  return task.dueDate.toDate().getTime() < Date.now();
}

export function getTaskGroupKey(task: Task): string {
  if (task.status === "completed") return "完了";
  if (!task.dueDate) return "期限なし";

  const due = task.dueDate.toDate();
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  if (due.getTime() < today.getTime()) return "期限切れ";
  if (isSameDate(due, today)) return "今日";
  if (isSameDate(due, tomorrow)) return "明日";
  if (due.getTime() < nextWeek.getTime()) return "今週";
  return "来週以降";
}

export function getDueBadge(task: Task): string {
  const group = getTaskGroupKey(task);
  if (group === "今日") return "今日中";
  if (group === "明日") return "明日まで";
  if (group === "期限切れ") return "期限切れ";
  if (group === "完了") return "完了";
  if (!task.dueDate) return "期限なし";
  const due = task.dueDate.toDate();
  return `${due.getMonth() + 1}/${due.getDate()}まで`;
}

export function priorityWeight(priority: TaskPriority): number {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

export function filterTasks({
  tasks,
  currentUserId,
  view,
  status,
  due,
  priority,
  source,
  assignee,
  member
}: {
  tasks: Task[];
  currentUserId: string;
  view: TaskView;
  status: TaskStatusFilter;
  due: TaskDueFilter;
  priority?: TaskPriority | "all";
  source?: Task["source"] | "all";
  assignee?: string;
  member?: string;
}): Task[] {
  return tasks.filter((task) => {
    if (view === "mine" && task.assigneeId !== currentUserId) return false;
    if (view === "ai" && task.source !== "ai") return false;
    if (view === "members" && task.assigneeId === currentUserId) return false;
    if (view === "members" && member && member !== "all" && task.assigneeId !== member) return false;
    if (view === "assigned" && !(task.createdBy === currentUserId && task.assigneeId !== currentUserId)) return false;
    if (view === "log" && !isAdminUser(currentUserId) && !(task.assigneeId === currentUserId || task.createdBy === currentUserId)) return false;

    if (status === "open" && task.status === "completed") return false;
    if (status === "completed" && task.status !== "completed") return false;
    if (status === "today" && (!task.dueDate || !isSameDate(task.dueDate.toDate(), new Date()))) return false;
    if (status === "hasDue" && !task.dueDate) return false;
    if (status === "overdue" && !isTaskOverdue(task)) return false;

    if (due !== "all" && !matchesDueFilter(task, due)) return false;
    if (priority && priority !== "all" && task.priority !== priority) return false;
    if (source && source !== "all" && task.source !== source) return false;
    if (assignee && assignee !== "all" && task.assigneeId !== assignee) return false;

    return true;
  });
}

export function matchesDueFilter(task: Task, filter: TaskDueFilter): boolean {
  const due = task.dueDate?.toDate();
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const week = new Date(today);
  week.setDate(today.getDate() + 7);
  const month = new Date(today);
  month.setMonth(today.getMonth() + 1);

  if (filter === "none") return !due;
  if (!due) return false;
  if (filter === "today") return isSameDate(due, today);
  if (filter === "tomorrow") return isSameDate(due, tomorrow);
  if (filter === "week") return due >= today && due < week;
  if (filter === "month") return due >= today && due < month;
  if (filter === "overdue") return isTaskOverdue(task);
  return true;
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  return tasks.slice().sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    if (isTaskOverdue(a) && !isTaskOverdue(b)) return -1;
    if (!isTaskOverdue(a) && isTaskOverdue(b)) return 1;

    if (sort === "priorityDesc") return priorityWeight(b.priority) - priorityWeight(a.priority);
    if (sort === "newest") return b.createdAt.toMillis() - a.createdAt.toMillis();
    if (sort === "oldest") return a.createdAt.toMillis() - b.createdAt.toMillis();
    if (sort === "creator") return (a.createdByName ?? a.createdBy).localeCompare(b.createdByName ?? b.createdBy);
    if (sort === "assignee") return (a.assigneeName ?? a.assigneeId).localeCompare(b.assigneeName ?? b.assigneeId);

    const left = a.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const right = b.dueDate?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    return sort === "dueDesc" ? right - left : left - right;
  });
}

export function countByStatus(tasks: Task[]) {
  return {
    all: tasks.length,
    open: tasks.filter((task) => task.status !== "completed").length,
    today: tasks.filter((task) => task.dueDate && isSameDate(task.dueDate.toDate(), new Date())).length,
    hasDue: tasks.filter((task) => Boolean(task.dueDate)).length,
    overdue: tasks.filter(isTaskOverdue).length,
    completed: tasks.filter((task) => task.status === "completed").length
  };
}
