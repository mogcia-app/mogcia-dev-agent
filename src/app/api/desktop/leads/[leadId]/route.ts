import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { getLeadDetailAggregate } from "@/lib/server/business/lead-aggregate-service";
import { toDesktopCalendarEvent } from "@/lib/server/business/calendar-service";
import { toDesktopActivityPayload } from "@/lib/server/business/activity-service";
import type { BusinessAuth } from "@/lib/server/business/api";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const { leadId } = await params;
    const data = await withDesktopAudit({ userId: auth.userId, deviceId: auth.device.id }, "lead_read", async () => {
      const aggregate = await getLeadDetailAggregate(toBusinessAuth(auth), leadId);
      return {
        lead: aggregate.lead,
        company: aggregate.company,
        activities: aggregate.activities.map(toDesktopActivityPayload),
        tasks: aggregate.tasks,
        calendarEvents: aggregate.calendarEvents.map(toDesktopCalendarEvent),
        deletionImpact: aggregate.deletionImpact
      };
    }, leadId);
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>): BusinessAuth {
  return { db: auth.db, userId: auth.userId, userName: getUserDisplayNameById(auth.userId), source: "desktop", deviceId: auth.device.id };
}
