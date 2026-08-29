"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { businessApi, toJsonBody } from "@/lib/business-api-client";
import { draftToCalendarPayload } from "@/lib/calendar-utils";
import { isAdminUser } from "@/lib/task-utils";
import type { CalendarEvent, CalendarEventDraft } from "@/types/calendar";
import type { MemberOption } from "@/types/task";

const COLLECTION = "calendarEvents";

function normalizeEvent(id: string, data: DocumentData): CalendarEvent {
  const now = Timestamp.now();
  return {
    id,
    title: String(data.title ?? ""),
    description: typeof data.description === "string" ? data.description : "",
    eventType:
      data.eventType === "appointment" ||
      data.eventType === "sales" ||
      data.eventType === "phone" ||
      data.eventType === "visit" ||
      data.eventType === "internal" ||
      data.eventType === "deskwork" ||
      data.eventType === "personal" ||
      data.eventType === "other"
        ? data.eventType
        : "meeting",
    startAt: data.startAt instanceof Timestamp ? data.startAt : now,
    endAt: data.endAt instanceof Timestamp ? data.endAt : null,
    allDay: Boolean(data.allDay),
    assigneeId: String(data.assigneeId ?? ""),
    assigneeName: typeof data.assigneeName === "string" ? data.assigneeName : "",
    attendeeIds: Array.isArray(data.attendeeIds) ? data.attendeeIds : [],
    attendeeNames: Array.isArray(data.attendeeNames) ? data.attendeeNames : [],
    relatedEntity: data.relatedEntity ?? null,
    relatedType: data.relatedType === "lead" || data.relatedType === "company" ? data.relatedType : data.relatedEntity?.type ?? null,
    relatedId: data.relatedId ?? data.relatedEntity?.id ?? null,
    relatedName: data.relatedName ?? data.relatedEntity?.name ?? null,
    relatedContactName: data.relatedContactName ?? data.relatedEntity?.contactName ?? null,
    companyId: data.companyId ?? null,
    companyName: data.companyName ?? null,
    productId: data.productId ?? null,
    productName: data.productName ?? null,
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
    meetingId: data.meetingId ?? null,
    appointmentId: data.appointmentId ?? null,
    location: data.location ?? null,
    meetingUrl: data.meetingUrl ?? null,
    source: data.source === "google_calendar" || data.source === "automation" ? data.source : "manual",
    externalCalendarId: data.externalCalendarId ?? null,
    externalEventId: data.externalEventId ?? null,
    reminderMinutes: Array.isArray(data.reminderMinutes) ? data.reminderMinutes : [],
    recurrence: data.recurrence ?? null,
    visibility: data.visibility === "private" ? "private" : "team",
    createdBy: String(data.createdBy ?? ""),
    createdByName: typeof data.createdByName === "string" ? data.createdByName : "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : now,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : now
  };
}

type CalendarAccessUser = {
  uid: string;
};

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => left.startAt.toMillis() - right.startAt.toMillis());
}

export function subscribeCalendarEvents(currentUser: CalendarAccessUser | null, onNext: (events: CalendarEvent[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db || !currentUser) return () => undefined;

  if (isAdminUser(currentUser.uid)) {
    return onSnapshot(query(collection(db, COLLECTION)), (snapshot) => onNext(sortEvents(snapshot.docs.map((entry) => normalizeEvent(entry.id, entry.data())))), onError);
  }

  const eventSlices = new Map<string, Map<string, CalendarEvent>>();
  const publish = () => {
    const eventsById = new Map<string, CalendarEvent>();
    eventSlices.forEach((events) => {
      events.forEach((event) => eventsById.set(event.id, event));
    });
    onNext(sortEvents(Array.from(eventsById.values())));
  };
  const subscribeVisibleSlice = (sliceKey: string, field: "createdBy" | "assigneeId" | "attendeeIds", op: "==" | "array-contains", value: string) =>
    onSnapshot(
      query(collection(db, COLLECTION), where(field, op, value)),
      (snapshot) => {
        eventSlices.set(sliceKey, new Map(snapshot.docs.map((entry) => [entry.id, normalizeEvent(entry.id, entry.data())])));
        publish();
      },
      (error) => {
        console.warn(`Calendar ${sliceKey} subscription failed.`, error);
        eventSlices.delete(sliceKey);
        publish();
      }
    );

  const unsubscribes = [
    subscribeVisibleSlice("created-by", "createdBy", "==", currentUser.uid),
    subscribeVisibleSlice("assignee", "assigneeId", "==", currentUser.uid),
    subscribeVisibleSlice("attendee", "attendeeIds", "array-contains", currentUser.uid)
  ];

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export async function createCalendarEvent(draft: CalendarEventDraft, currentUser: MemberOption & { uid: string }): Promise<void> {
  await businessApi<{ id: string; calendarEventId?: string }>("/api/business/calendar", {
    method: "POST",
    body: toJsonBody({
      ...draftToCalendarPayload(draft, currentUser),
      createdBy: currentUser.uid,
      createdByName: currentUser.name
    })
  });
}

export async function updateCalendarEvent(eventId: string, draft: CalendarEventDraft, currentUser: MemberOption): Promise<void> {
  await businessApi<{ event: CalendarEvent }>("/api/business/calendar", {
    method: "PATCH",
    body: toJsonBody({
      ...draftToCalendarPayload(draft, currentUser),
      id: eventId
    })
  });
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await deleteDoc(doc(db, COLLECTION, eventId));
}
