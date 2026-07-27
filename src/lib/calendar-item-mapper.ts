"use client";

import type { CalendarEvent, CalendarItem } from "@/types/calendar";
import type { Task } from "@/types/task";

export function taskToCalendarItem(task: Task): CalendarItem | null {
  if (!task.dueDate || task.status === "cancelled") return null;
  return {
    id: `task-${task.id}`,
    itemType: "task",
    title: task.title,
    description: task.description,
    startAt: task.dueDate.toDate(),
    endAt: null,
    allDay: false,
    category: task.source === "ai" ? "ai_task" : "manual_task",
    status: task.status,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    companyId: task.companyId,
    companyName: task.companyName,
    projectId: task.projectId,
    projectName: task.projectName,
    sourceCollection: "tasks",
    sourceId: task.id,
    createdBy: task.createdBy,
    createdByName: task.createdByName,
    createdAt: task.createdAt.toDate(),
    updatedAt: task.updatedAt.toDate()
  };
}

export function eventToCalendarItem(event: CalendarEvent): CalendarItem {
  return {
    id: `event-${event.id}`,
    itemType: event.eventType === "meeting" ? "meeting" : event.eventType === "appointment" ? "appointment" : "event",
    title: event.title,
    description: event.description,
    startAt: event.startAt.toDate(),
    endAt: event.endAt?.toDate() ?? null,
    allDay: event.allDay,
    category: event.eventType,
    assigneeId: event.assigneeId,
    assigneeName: event.assigneeName,
    attendeeIds: event.attendeeIds,
    attendeeNames: event.attendeeNames,
    companyId: event.companyId,
    companyName: event.companyName,
    projectId: event.projectId,
    projectName: event.projectName,
    location: event.location,
    meetingUrl: event.meetingUrl,
    sourceCollection: "calendarEvents",
    sourceId: event.id,
    createdBy: event.createdBy,
    createdByName: event.createdByName,
    createdAt: event.createdAt.toDate(),
    updatedAt: event.updatedAt.toDate()
  };
}
