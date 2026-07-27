"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useMemo } from "react";
import { countByStatus, filterTasks, sortTasks } from "@/lib/task-utils";
import type { Task, TaskDueFilter, TaskPriority, TaskSort, TaskSource, TaskStatusFilter, TaskView } from "@/types/task";

const taskViews: TaskView[] = ["mine", "ai", "manual", "members", "assigned"];
const taskStatuses: TaskStatusFilter[] = ["all", "open", "today", "hasDue", "overdue", "completed"];
const dueFilters: TaskDueFilter[] = ["all", "today", "tomorrow", "week", "month", "overdue", "none"];
const sortOptions: TaskSort[] = ["dueAsc", "dueDesc", "priorityDesc", "newest", "oldest", "creator", "assignee"];
const priorities: Array<TaskPriority | "all"> = ["all", "high", "medium", "low"];
const sources: Array<TaskSource | "all"> = ["all", "ai", "manual", "automation"];

function pickParam<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return value && options.includes(value as T) ? (value as T) : fallback;
}

export function useTaskFilters(tasks: Task[], currentUserId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = pickParam(searchParams.get("view"), taskViews, "mine");
  const status = pickParam(searchParams.get("status"), taskStatuses, "all");
  const due = pickParam(searchParams.get("due"), dueFilters, "all");
  const sort = pickParam(searchParams.get("sort"), sortOptions, "dueAsc");
  const priority = pickParam(searchParams.get("priority"), priorities, "all");
  const source = pickParam(searchParams.get("source"), sources, "all");
  const assignee = searchParams.get("assignee") ?? "all";
  const member = searchParams.get("member") ?? "all";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" || (value === "mine" && key === "view") || (value === "dueAsc" && key === "sort")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    if (key === "view") params.delete("status");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}` as Route, { scroll: false });
  };

  const baseTasks = useMemo(
    () => filterTasks({ tasks, currentUserId, view, status: "all", due: "all", priority: "all", source: "all", assignee: "all", member }),
    [tasks, currentUserId, view, member]
  );

  const filteredTasks = useMemo(
    () => sortTasks(filterTasks({ tasks, currentUserId, view, status, due, priority, source, assignee, member }), sort),
    [tasks, currentUserId, view, status, due, priority, source, assignee, member, sort]
  );

  return {
    view,
    status,
    due,
    sort,
    priority,
    source,
    assignee,
    member,
    counts: countByStatus(baseTasks),
    filteredTasks,
    setFilter
  };
}
