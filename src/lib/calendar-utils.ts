"use client";

import { Timestamp } from "firebase/firestore";
import type { CalendarCategory, CalendarEventDraft, CalendarFilters, CalendarItem } from "@/types/calendar";
import type { MemberOption } from "@/types/task";

export const defaultCalendarFilters: CalendarFilters = {
  mine: true,
  aiTasks: true,
  manualTasks: true,
  meetings: true,
  members: false
};

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function isSameCalendarDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fromDateKey(value: string | null): Date {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

export function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}

export function formatDateBadge(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatWeekday(date: Date): string {
  return date.toLocaleDateString("ja-JP", { weekday: "short" });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function buildCalendarGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return next;
  });
}

export function getCategoryMeta(category: CalendarCategory) {
  if (category === "ai_task") return { label: "AI作成タスク", dot: "bg-[#EC6F8B]", soft: "bg-[#FFF2F5]", text: "text-[#E65A78]", border: "border-[#F7CDD5]" };
  if (category === "manual_task") return { label: "手動タスク", dot: "bg-[#4F78B4]", soft: "bg-[#F1F7FF]", text: "text-[#4F78B4]", border: "border-[#D8E7FA]" };
  if (category === "meeting") return { label: "会議", dot: "bg-[#67B667]", soft: "bg-[#F3FAF0]", text: "text-[#5E9B61]", border: "border-[#DDEED8]" };
  if (category === "appointment") return { label: "商談", dot: "bg-[#9B72D9]", soft: "bg-[#F7F1FF]", text: "text-[#8C61CF]", border: "border-[#E8D9FA]" };
  if (category === "personal") return { label: "個人予定", dot: "bg-[#F29B45]", soft: "bg-[#FFF6EA]", text: "text-[#D7791F]", border: "border-[#F5E1C6]" };
  return { label: "その他", dot: "bg-[#9A9A9A]", soft: "bg-[#F5F5F5]", text: "text-[#6E6E6E]", border: "border-[#E5E5E5]" };
}

export function itemsForDate(items: CalendarItem[], date: Date): CalendarItem[] {
  return items.filter((item) => isSameCalendarDate(item.startAt, date)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function filterCalendarItems(items: CalendarItem[], filters: CalendarFilters, currentUserId: string, memberId: string): CalendarItem[] {
  return items.filter((item) => {
    const isMine = item.assigneeId === currentUserId || item.createdBy === currentUserId || item.attendeeIds?.includes(currentUserId);
    if (!filters.members && !isMine) return false;
    if (filters.members && memberId !== "all" && item.assigneeId !== memberId && item.createdBy !== memberId && !item.attendeeIds?.includes(memberId)) return false;
    if (!filters.mine && isMine) return false;
    if (!filters.aiTasks && item.category === "ai_task") return false;
    if (!filters.manualTasks && item.category === "manual_task") return false;
    if (!filters.meetings && (item.category === "meeting" || item.category === "appointment")) return false;
    return item.status !== "cancelled";
  });
}

export function upcomingItems(items: CalendarItem[], selectedDate: Date): CalendarItem[] {
  const after = endOfDay(selectedDate).getTime();
  return items
    .filter((item) => item.startAt.getTime() > after && item.status !== "completed" && item.status !== "cancelled")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 5);
}

export function createEmptyCalendarDraft(currentUser: MemberOption): CalendarEventDraft {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return {
    title: "",
    eventType: "meeting",
    startDate: toDateKey(now),
    startTime: "10:00",
    endDate: toDateKey(now),
    endTime: "11:00",
    allDay: false,
    description: "",
    assigneeId: currentUser.id,
    assigneeName: currentUser.name,
    attendeeNames: "",
    companyId: "",
    companyName: "",
    projectId: "",
    projectName: "",
    meetingId: "",
    location: "",
    meetingUrl: "",
    reminder: "10",
    recurrence: "none"
  };
}

export function draftToCalendarPayload(draft: CalendarEventDraft, currentUser: MemberOption) {
  const startAt = parseDateTime(draft.startDate, draft.allDay ? "00:00" : draft.startTime);
  const endAt = draft.endDate ? parseDateTime(draft.endDate, draft.allDay ? "23:59" : draft.endTime) : null;
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    eventType: draft.eventType,
    startAt,
    endAt,
    allDay: draft.allDay,
    assigneeId: draft.assigneeId || currentUser.id,
    assigneeName: draft.assigneeName || currentUser.name,
    attendeeNames: draft.attendeeNames.split(",").map((name) => name.trim()).filter(Boolean),
    companyId: draft.companyId || null,
    companyName: draft.companyName.trim() || null,
    projectId: draft.projectId || null,
    projectName: draft.projectName.trim() || null,
    meetingId: draft.meetingId || null,
    location: draft.location.trim() || null,
    meetingUrl: draft.meetingUrl.trim() || null,
    source: "manual" as const,
    externalCalendarId: null,
    externalEventId: null,
    reminderMinutes: draft.reminder ? [Number(draft.reminder)] : [],
    recurrence: draft.recurrence === "none" ? null : { frequency: draft.recurrence },
    visibility: "team" as const
  };
}

export function parseDateTime(date: string, time: string): Timestamp {
  const value = new Date(`${date}T${time || "00:00"}`);
  return Timestamp.fromDate(Number.isNaN(value.getTime()) ? new Date() : value);
}
