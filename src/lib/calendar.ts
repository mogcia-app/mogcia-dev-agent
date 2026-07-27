"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { draftToCalendarPayload } from "@/lib/calendar-utils";
import type { CalendarEvent, CalendarEventDraft } from "@/types/calendar";
import type { MemberOption } from "@/types/task";

const COLLECTION = "calendarEvents";

function normalizeEvent(id: string, data: DocumentData): CalendarEvent {
  const now = Timestamp.now();
  return {
    id,
    title: String(data.title ?? ""),
    description: typeof data.description === "string" ? data.description : "",
    eventType: data.eventType === "appointment" || data.eventType === "personal" || data.eventType === "other" ? data.eventType : "meeting",
    startAt: data.startAt instanceof Timestamp ? data.startAt : now,
    endAt: data.endAt instanceof Timestamp ? data.endAt : null,
    allDay: Boolean(data.allDay),
    assigneeId: String(data.assigneeId ?? ""),
    assigneeName: typeof data.assigneeName === "string" ? data.assigneeName : "",
    attendeeIds: Array.isArray(data.attendeeIds) ? data.attendeeIds : [],
    attendeeNames: Array.isArray(data.attendeeNames) ? data.attendeeNames : [],
    companyId: data.companyId ?? null,
    companyName: data.companyName ?? null,
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

export function subscribeCalendarEvents(onNext: (events: CalendarEvent[]) => void, onError: (error: FirestoreError) => void): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => undefined;
  return onSnapshot(
    query(collection(db, COLLECTION), orderBy("startAt", "asc")),
    (snapshot) => onNext(snapshot.docs.map((entry) => normalizeEvent(entry.id, entry.data()))),
    onError
  );
}

export async function createCalendarEvent(draft: CalendarEventDraft, currentUser: MemberOption & { uid: string }): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await addDoc(collection(db, COLLECTION), {
    ...draftToCalendarPayload(draft, currentUser),
    createdBy: currentUser.uid,
    createdByName: currentUser.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateCalendarEvent(eventId: string, draft: CalendarEventDraft, currentUser: MemberOption): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await updateDoc(doc(db, COLLECTION, eventId), {
    ...draftToCalendarPayload(draft, currentUser),
    updatedAt: serverTimestamp()
  });
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebaseが未設定です。");
  await deleteDoc(doc(db, COLLECTION, eventId));
}
