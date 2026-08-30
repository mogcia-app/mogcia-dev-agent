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
    tasks: tasks.filter((task) => String(task.leadId ?? "") === leadId).map(toDesktopTaskPayload),
    calendarEvents: calendarEvents.filter((event) => String(event.leadId ?? "") === leadId),
    deletionImpact
  };
}
