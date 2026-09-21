import { Timestamp } from "firebase/firestore";
import type { CalendarEvent } from "@/types/calendar";
import type { Company } from "@/types/company";

export function isCompanyContactEvent(event: CalendarEvent, companyId: string): boolean {
  const linkedId = event.companyId || (event.relatedType === "company" ? event.relatedId : null) || (event.relatedEntity?.type === "company" ? event.relatedEntity.id : null);
  return linkedId === companyId && (event.eventType === "sales" || event.eventType === "customer_support" || event.eventType === "meeting");
}

export function companyContactEvents(events: CalendarEvent[], companyId: string): CalendarEvent[] {
  return events.filter((event) => isCompanyContactEvent(event, companyId));
}

export function companyWithCalendarContact(company: Company, events: CalendarEvent[], now: number): Company {
  const linked = companyContactEvents(events, company.id);
  const recordedContact = company.lastContactAt?.toMillis() ?? 0;
  const latestPast = linked.filter((event) => (event.endAt ?? event.startAt).toMillis() <= now)
    .reduce((latest, event) => Math.max(latest, event.startAt.toMillis()), recordedContact <= now ? recordedContact : 0);
  const nextEvent = linked.filter((event) => event.startAt.toMillis() > now)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())[0];
  return {
    ...company,
    lastContactAt: latestPast ? Timestamp.fromMillis(latestPast) : null,
    nextActionAt: nextEvent?.startAt ?? company.nextActionAt,
    nextActionTitle: nextEvent ? formatNextEventDate(nextEvent) : company.nextActionTitle
  };
}

function formatNextEventDate(event: CalendarEvent): string {
  const date = event.startAt.toDate();
  if (event.allDay) return date.toLocaleDateString("ja-JP");
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
