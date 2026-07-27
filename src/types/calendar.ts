import type { Timestamp } from "firebase/firestore";

export type CalendarItemType = "task" | "meeting" | "appointment" | "event";
export type CalendarCategory = "ai_task" | "manual_task" | "meeting" | "appointment" | "phone" | "visit" | "internal" | "deskwork" | "personal" | "other";
export type CalendarEventType = "meeting" | "appointment" | "phone" | "visit" | "internal" | "deskwork" | "personal" | "other";
export type CalendarViewMode = "timeline" | "list";

export interface CalendarItem {
  id: string;
  itemType: CalendarItemType;
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date | null;
  allDay: boolean;
  category: CalendarCategory;
  status?: string;
  assigneeId?: string;
  assigneeName?: string;
  attendeeIds?: string[];
  attendeeNames?: string[];
  companyId?: string | null;
  companyName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  sourceCollection: string;
  sourceId: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  eventType: CalendarEventType;
  startAt: Timestamp;
  endAt?: Timestamp | null;
  allDay: boolean;
  assigneeId: string;
  assigneeName?: string;
  attendeeIds?: string[];
  attendeeNames?: string[];
  companyId?: string | null;
  companyName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  meetingId?: string | null;
  appointmentId?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  source?: "manual" | "google_calendar" | "automation";
  externalCalendarId?: string | null;
  externalEventId?: string | null;
  reminderMinutes?: number[];
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly";
    interval?: number;
    endDate?: Timestamp | null;
  } | null;
  visibility?: "team" | "private";
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CalendarEventDraft {
  title: string;
  eventType: CalendarEventType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  description: string;
  assigneeId: string;
  assigneeName: string;
  attendeeNames: string;
  companyId: string;
  companyName: string;
  projectId: string;
  projectName: string;
  meetingId: string;
  location: string;
  meetingUrl: string;
  reminder: string;
  recurrence: "none" | "daily" | "weekly" | "monthly";
}

export interface CalendarFilters {
  mine: boolean;
  aiTasks: boolean;
  manualTasks: boolean;
  meetings: boolean;
  members: boolean;
}
