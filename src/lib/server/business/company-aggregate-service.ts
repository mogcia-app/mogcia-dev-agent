import "server-only";

import { timestampToIso } from "@/lib/desktop/format";
import { listActivitiesByCompanyId } from "@/lib/server/business/activity-service";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { getCompanyById, getCompanyDeletionImpact, toDesktopCompanyDetailPayload, type CompanyListOptions } from "@/lib/server/business/company-service";
import { listTasks, toDesktopTaskPayload } from "@/lib/server/business/task-service";
import type { BusinessAuth } from "@/lib/server/business/api";

export async function getCompanyDetailAggregate(auth: BusinessAuth, companyId: string, options: CompanyListOptions = {}) {
  const [company, tasks, calendarEvents, activities, deletionImpact] = await Promise.all([
    getCompanyById(auth, companyId),
    listTasks(auth, { includeCompleted: true, limit: options.limit ?? 120 }),
    listCalendarEvents(auth, { limit: options.limit ?? 200, visibleOnly: false }),
    listActivitiesByCompanyId(auth, companyId, { limit: 10, includeLegacy: true }),
    getCompanyDeletionImpact(auth, companyId)
  ]);
  const relatedTasks = tasks.filter((task) => String(task.companyId ?? "") === companyId);
  const relatedEvents = calendarEvents.filter((event) => String(event.companyId ?? "") === companyId);
  const openTasks = relatedTasks.map(toDesktopTaskPayload).filter((task) => task.status !== "completed" && task.status !== "cancelled");
  const recentLogs = activities
    .map((activity) => ({ id: String(activity.id ?? ""), title: String(activity.title ?? ""), content: String(activity.content ?? ""), occurredAt: timestampToIso(activity.occurredAt) }))
    .slice(0, 8);

  return {
    company,
    recentLogs,
    tasks: openTasks.slice(0, 6),
    nextEvents: relatedEvents.slice(0, 5).map((event) => ({
      id: String(event.id ?? ""),
      title: String(event.title ?? ""),
      startAt: timestampToIso(event.startAt),
      endAt: timestampToIso(event.endAt)
    })),
    deletionImpact
  };
}

export function toDesktopCompanyAggregatePayload(aggregate: Awaited<ReturnType<typeof getCompanyDetailAggregate>>) {
  return {
    company: toDesktopCompanyDetailPayload(aggregate.company),
    recentLogs: aggregate.recentLogs,
    tasks: aggregate.tasks,
    nextEvents: aggregate.nextEvents
  };
}
