import "server-only";

import { listActivitiesByLeadId } from "@/lib/server/business/activity-service";
import { listCalendarEvents } from "@/lib/server/business/calendar-service";
import { getCompanyById } from "@/lib/server/business/company-service";
import { getLeadById, getLeadDeletionImpact } from "@/lib/server/business/lead-service";
import { listTasks, toDesktopTaskPayload } from "@/lib/server/business/task-service";
import type { BusinessAuth } from "@/lib/server/business/api";

export async function getLeadDetailAggregate(auth: BusinessAuth, leadId: string) {
  const lead = await getLeadById(auth, leadId);
  const companyId = typeof lead.companyId === "string" && lead.companyId ? lead.companyId : null;
  const [company, tasks, calendarEvents, activities, deletionImpact] = await Promise.all([
    companyId ? getCompanyById(auth, companyId).catch(() => null) : Promise.resolve(null),
    listTasks(auth, { includeCompleted: true, limit: 200 }),
    listCalendarEvents(auth, { limit: 200, visibleOnly: false }),
    listActivitiesByLeadId(auth, leadId, { limit: 20 }),
    getLeadDeletionImpact(auth, leadId)
  ]);
  return {
    lead,
    company,
    activities,
    tasks: tasks.filter((task) => String(task.leadId ?? "") === leadId || Boolean(companyId && String(task.companyId ?? "") === companyId)).map(toDesktopTaskPayload),
    calendarEvents: calendarEvents.filter((event) => isRelatedCalendarEvent(event, leadId, companyId)),
    deletionImpact
  };
}

function isRelatedCalendarEvent(event: Record<string, unknown>, leadId: string, companyId: string | null) {
  const relatedEntity = event.relatedEntity && typeof event.relatedEntity === "object" && !Array.isArray(event.relatedEntity)
    ? event.relatedEntity as Record<string, unknown>
    : null;
  return (event.relatedType === "lead" && event.relatedId === leadId)
    || (relatedEntity?.type === "lead" && relatedEntity.id === leadId)
    || Boolean(companyId && (event.companyId === companyId || (event.relatedType === "company" && event.relatedId === companyId) || (relatedEntity?.type === "company" && relatedEntity.id === companyId)));
}
