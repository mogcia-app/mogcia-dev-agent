"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { deleteCalendarEvent, createCalendarEvent, subscribeCalendarEvents, updateCalendarEvent } from "@/lib/calendar";
import { eventToCalendarItem } from "@/lib/calendar-item-mapper";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isAdminUser } from "@/lib/task-utils";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayName, getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent, CalendarEventDraft } from "@/types/calendar";
import type { MemberOption } from "@/types/task";

export function useCalendarItems() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [authMembers, setAuthMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      window.setTimeout(() => {
        setError("Firebaseが未設定です。");
        setLoading(false);
      }, 0);
      return undefined;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    window.setTimeout(() => setLoading(true), 0);
    const unsubEvents = subscribeCalendarEvents(
      user,
      (nextEvents) => {
        setEvents(nextEvents);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
    return () => {
      unsubEvents();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      window.setTimeout(() => setAuthMembers([]), 0);
      return undefined;
    }
    let cancelled = false;
    void user.getIdToken()
      .then((token) => fetch("/api/users/members", { headers: { Authorization: `Bearer ${token}` } }))
      .then((response) => response.json() as Promise<{ members?: Array<{ uid: string; name: string; email?: string }> }>)
      .then((data) => {
        if (cancelled) return;
        const members = data.members?.length ? data.members : DEFAULT_WORKSPACE_MEMBERS;
        setAuthMembers(members.map((member) => ({ id: member.uid, name: member.name })));
      })
      .catch(() => {
        if (!cancelled) setAuthMembers(DEFAULT_WORKSPACE_MEMBERS.map((member) => ({ id: member.uid, name: member.name })));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const currentMember = useMemo<MemberOption & { uid: string }>(() => {
    if (!user) return { id: "", uid: "", name: "ログインユーザー" };
    return { id: user.uid, uid: user.uid, name: getUserDisplayName(user) };
  }, [user]);

  const members = useMemo<MemberOption[]>(() => {
    const map = new Map<string, string>();
    authMembers.forEach((member) => {
      if (member.id) map.set(member.id, member.name);
    });
    if (user) map.set(user.uid, getUserDisplayName(user));
    events.forEach((event) => {
      if (event.assigneeId) map.set(event.assigneeId, getUserDisplayNameById(event.assigneeId, event.assigneeName));
      if (event.createdBy) map.set(event.createdBy, getUserDisplayNameById(event.createdBy, event.createdByName));
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [authMembers, events, user]);

  const items = useMemo(() => {
    return events.map(eventToCalendarItem).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }, [events]);

  const isAdmin = isAdminUser(user?.uid);
  const canEditEvent = (event: CalendarEvent) => isAdmin || event.createdBy === user?.uid || event.assigneeId === user?.uid;
  const canDeleteEvent = () => isAdmin;

  return {
    user,
    currentMember,
    members,
    events,
    items,
    loading,
    error,
    isAdmin,
    canEditEvent,
    canDeleteEvent,
    createEvent: (draft: CalendarEventDraft) => createCalendarEvent(draft, currentMember),
    updateEvent: (eventId: string, draft: CalendarEventDraft) => updateCalendarEvent(eventId, draft, currentMember),
    deleteEvent: deleteCalendarEvent
  };
}
