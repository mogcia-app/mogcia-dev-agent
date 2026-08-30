"use client";

import { Timestamp } from "firebase/firestore";
import type { CalendarCategory, CalendarEventDraft, CalendarFilters, CalendarItem, CalendarMeetingMethod } from "@/types/calendar";
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

export function formatTimeRange(startAt: Date, endAt?: Date | null, allDay = false): string {
  if (allDay) return "終日";
  if (!endAt) return formatTime(startAt);
  const minutes = Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60000));
  const duration = minutes > 0 ? `（${formatDuration(minutes)}）` : "";
  return `${formatTime(startAt)} - ${formatTime(endAt)}${duration}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
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
  if (category === "ai_task") return { label: "AI作成タスク", dot: "bg-[#FF2D75]", dotColor: "#FF2D75", soft: "bg-[#FFF2F6]", text: "text-[#E91E63]", border: "border-[#FFC1D6]" };
  if (category === "manual_task") return { label: "手動タスク", dot: "bg-[#4F78B4]", dotColor: "#4F78B4", soft: "bg-[#F1F7FF]", text: "text-[#4F78B4]", border: "border-[#D8E7FA]" };
  if (category === "meeting") return { label: "打ち合わせ", dot: "bg-[#FF2D75]", dotColor: "#FF2D75", soft: "bg-[#FFF3F8]", text: "text-[#D81B60]", border: "border-[#FFC1D6]" };
  if (category === "appointment" || category === "sales") return { label: "打ち合わせ", dot: "bg-[#FF0F6A]", dotColor: "#FF0F6A", soft: "bg-[#FFF0F5]", text: "text-[#E6005C]", border: "border-[#FFB3CF]" };
  if (category === "customer_support") return { label: "顧客対応", dot: "bg-[#FF4F9A]", dotColor: "#FF4F9A", soft: "bg-[#FFF2F8]", text: "text-[#D81B72]", border: "border-[#FFC4DD]" };
  if (category === "phone") return { label: "電話", dot: "bg-[#FF5FA8]", dotColor: "#FF5FA8", soft: "bg-[#FFF4FA]", text: "text-[#D62B7A]", border: "border-[#FFD0E5]" };
  if (category === "visit") return { label: "訪問", dot: "bg-[#FF2D8A]", dotColor: "#FF2D8A", soft: "bg-[#FFF1F8]", text: "text-[#D91A72]", border: "border-[#FFC2DE]" };
  if (category === "internal") return { label: "社内", dot: "bg-[#E73586]", dotColor: "#E73586", soft: "bg-[#FFF3F8]", text: "text-[#C82A75]", border: "border-[#F8C6DE]" };
  if (category === "deskwork") return { label: "作業", dot: "bg-[#D91E7A]", dotColor: "#D91E7A", soft: "bg-[#FFF2F7]", text: "text-[#B91E68]", border: "border-[#F3C3DA]" };
  if (category === "personal") return { label: "私用", dot: "bg-[#FF6FB0]", dotColor: "#FF6FB0", soft: "bg-[#FFF4FA]", text: "text-[#D94B91]", border: "border-[#FFD1E7]" };
  return { label: "その他", dot: "bg-[#C02B75]", dotColor: "#C02B75", soft: "bg-[#FFF4F8]", text: "text-[#9F2C66]", border: "border-[#E9C4D6]" };
}

export function getMeetingMethodLabel(method?: CalendarMeetingMethod | null): string {
  if (method === "online") return "オンライン";
  if (method === "visit") return "訪問";
  if (method === "phone") return "電話";
  if (method === "in_person") return "対面";
  return "その他";
}

export function itemsForDate(items: CalendarItem[], date: Date): CalendarItem[] {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  return items.filter((item) => {
    const start = item.startAt.getTime();
    const end = (item.endAt ?? item.startAt).getTime();
    return start <= dayEnd && end >= dayStart;
  }).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function filterCalendarItems(items: CalendarItem[], filters: CalendarFilters, currentUserId: string, memberId: string): CalendarItem[] {
  return items.filter((item) => {
    const isMine = item.assigneeId === currentUserId || item.createdBy === currentUserId || item.attendeeIds?.includes(currentUserId);
    if (!filters.members && !isMine) return false;
    if (filters.members && memberId !== "all" && item.assigneeId !== memberId && item.createdBy !== memberId && !item.attendeeIds?.includes(memberId)) return false;
    if (!filters.mine && isMine) return false;
    if (!filters.aiTasks && item.category === "ai_task") return false;
    if (!filters.manualTasks && item.category === "manual_task") return false;
    if (!filters.meetings && item.sourceCollection === "calendarEvents") return false;
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
    eventType: "sales",
    meetingMethod: "online",
    startDate: toDateKey(now),
    startTime: "10:00",
    durationMinutes: 60,
    endDate: toDateKey(now),
    endTime: "11:00",
    allDay: false,
    description: "",
    assigneeId: currentUser.id,
    assigneeName: currentUser.name,
    attendeeIds: [],
    attendeeMemberNames: [],
    attendeeNames: "",
    relatedType: "",
    relatedId: "",
    relatedName: "",
    relatedContactName: "",
    companyId: "",
    companyName: "",
    productId: "",
    productName: "",
    productIds: [],
    productNames: [],
    projectId: "",
    projectName: "",
    meetingId: "",
    location: "",
    meetingUrl: "",
    reminder: "0",
    recurrence: "none"
  };
}

export function draftToCalendarPayload(draft: CalendarEventDraft, currentUser: MemberOption) {
  const startAt = parseDateTime(draft.startDate, draft.allDay ? "00:00" : draft.startTime);
  const endAt = draft.allDay ? parseDateTime(draft.startDate, "23:59") : parseDurationEndDateTime(draft.startDate, draft.startTime, draft.durationMinutes, draft.endDate, draft.endTime);
  const attendeeIds = Array.from(new Set(draft.attendeeIds.filter((id) => id && id !== draft.assigneeId)));
  const selectedAttendeeNames = draft.attendeeMemberNames.filter(Boolean);
  const manualAttendeeNames = draft.attendeeNames.split(",").map((name) => name.trim()).filter(Boolean);
  const productIds = Array.from(new Set(draft.productIds.filter(Boolean)));
  const productNames = Array.from(new Set(draft.productNames.map((name) => name.trim()).filter(Boolean)));
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    eventType: draft.eventType,
    meetingMethod: draft.meetingMethod,
    startAt,
    endAt,
    allDay: draft.allDay,
    assigneeId: draft.assigneeId || currentUser.id,
    assigneeName: draft.assigneeName || currentUser.name,
    attendeeIds,
    attendeeNames: Array.from(new Set([...selectedAttendeeNames, ...manualAttendeeNames].filter(Boolean))),
    relatedEntity: draft.relatedType && draft.relatedId ? {
      type: draft.relatedType,
      id: draft.relatedId,
      name: draft.relatedName.trim(),
      contactName: draft.relatedContactName.trim() || null
    } : null,
    relatedType: draft.relatedType || null,
    relatedId: draft.relatedId || null,
    relatedName: draft.relatedName.trim() || null,
    relatedContactName: draft.relatedContactName.trim() || null,
    companyId: draft.companyId || null,
    companyName: draft.companyName.trim() || null,
    productId: (productIds[0] ?? draft.productId) || null,
    productName: (productNames[0] ?? draft.productName.trim()) || null,
    productIds,
    productNames,
    projectId: draft.projectId || null,
    projectName: draft.projectName.trim() || null,
    meetingId: draft.meetingId || null,
    location: draft.location.trim() || null,
    meetingUrl: draft.meetingUrl.trim() || null,
    source: "manual" as const,
    externalCalendarId: null,
    externalEventId: null,
    reminderMinutes: [],
    recurrence: null,
    visibility: "team" as const
  };
}

export function parseDateTime(date: string, time: string): Timestamp {
  const value = new Date(`${date}T${time || "00:00"}`);
  return Timestamp.fromDate(Number.isNaN(value.getTime()) ? new Date() : value);
}

function parseDurationEndDateTime(startDate: string, startTime: string, durationMinutes?: number, endDate?: string, endTime?: string): Timestamp {
  const start = new Date(`${startDate}T${startTime || "10:00"}`);
  const fallbackEnd = Number.isNaN(start.getTime()) ? new Date() : new Date(start);
  const safeDuration = typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : null;
  fallbackEnd.setMinutes(fallbackEnd.getMinutes() + (safeDuration ?? 60));
  const end = safeDuration ? fallbackEnd : endDate && endTime ? new Date(`${endDate}T${endTime}`) : fallbackEnd;
  if (Number.isNaN(end.getTime())) return Timestamp.fromDate(fallbackEnd);
  if (!Number.isNaN(start.getTime()) && end.getTime() <= start.getTime()) return Timestamp.fromDate(fallbackEnd);
  return Timestamp.fromDate(end);
}
