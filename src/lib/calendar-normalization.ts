import type { CalendarEventType, CalendarMeetingMethod } from "@/types/calendar";

type CalendarFieldInput = {
  eventType?: unknown;
  meetingMethod?: unknown;
  meetingUrl?: unknown;
};

const eventTypes = ["sales", "customer_support", "internal", "deskwork", "personal", "other", "meeting"] as const;
const meetingMethods = ["online", "visit", "phone", "in_person", "other"] as const;

export function normalizeCalendarEventType(value: unknown): CalendarEventType {
  if (value === "appointment" || value === "sales") return "sales";
  if (value === "customer_support" || value === "phone" || value === "visit") return "customer_support";
  if (value === "internal" || value === "deskwork" || value === "personal" || value === "meeting") return value;
  return "other";
}

export function normalizeCalendarMeetingMethod(value: unknown): CalendarMeetingMethod {
  return meetingMethods.includes(value as CalendarMeetingMethod) ? value as CalendarMeetingMethod : "other";
}

export function normalizeCalendarEventFields(input: CalendarFieldInput): { eventType: CalendarEventType; meetingMethod: CalendarMeetingMethod } {
  const eventType = normalizeCalendarEventType(input.eventType);
  const explicitMethod = normalizeCalendarMeetingMethod(input.meetingMethod);
  const legacyMethod = legacyMeetingMethod(input.eventType);
  return {
    eventType,
    meetingMethod: explicitMethod !== "other" ? explicitMethod : legacyMethod ?? inferCalendarMeetingMethod(input) ?? "other"
  };
}

export function inferCalendarFieldsFromText(rawMessage: string): { eventType: CalendarEventType; meetingMethod: CalendarMeetingMethod } {
  const eventType = inferCalendarEventType(rawMessage);
  const meetingMethod = inferCalendarMeetingMethodFromText(rawMessage);
  return { eventType, meetingMethod };
}

export function isCalendarEventType(value: unknown): value is CalendarEventType {
  return eventTypes.includes(value as CalendarEventType);
}

export function isCalendarMeetingMethod(value: unknown): value is CalendarMeetingMethod {
  return meetingMethods.includes(value as CalendarMeetingMethod);
}

function legacyMeetingMethod(value: unknown): CalendarMeetingMethod | null {
  if (value === "phone") return "phone";
  if (value === "visit") return "visit";
  return null;
}

function inferCalendarEventType(rawMessage: string): CalendarEventType {
  if (/(社内|内部|社内MTG|社内ミーティング)/.test(rawMessage)) return "internal";
  if (/(作業|作業時間|デスクワーク)/.test(rawMessage)) return "deskwork";
  if (/(私用|個人|プライベート)/.test(rawMessage)) return "personal";
  if (/商談|打ち合わせ|ミーティング|面談/.test(rawMessage)) return "sales";
  if (/(顧客対応|フォロー|連絡|電話|訪問)/.test(rawMessage)) return "customer_support";
  return "other";
}

function inferCalendarMeetingMethod(input: CalendarFieldInput): CalendarMeetingMethod | null {
  if (typeof input.meetingUrl === "string" && input.meetingUrl.trim()) return "online";
  return null;
}

function inferCalendarMeetingMethodFromText(rawMessage: string): CalendarMeetingMethod {
  if (/(オンライン|Zoom|Google Meet|Meet|Teams|URL)/i.test(rawMessage)) return "online";
  if (/電話|架電|TEL/i.test(rawMessage)) return "phone";
  if (/訪問/.test(rawMessage)) return "visit";
  if (/対面|面談/.test(rawMessage)) return "in_person";
  return "other";
}
