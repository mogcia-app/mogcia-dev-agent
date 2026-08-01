"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { deleteCalendarEvent, createCalendarEvent, subscribeCalendarEvents, updateCalendarEvent } from "@/lib/calendar";
import { eventToCalendarItem, taskToCalendarItem } from "@/lib/calendar-item-mapper";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isAdminUser } from "@/lib/task-utils";
import { subscribeTasks } from "@/lib/tasks";
import { getUserDisplayName, getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent, CalendarEventDraft } from "@/types/calendar";
import type { MemberOption, Task } from "@/types/task";

export function useCalendarItems() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
    const unsubTasks = subscribeTasks(
      (nextTasks) => {
        setTasks(nextTasks);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
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
      unsubTasks();
      unsubEvents();
    };
  }, [user]);

  const currentMember = useMemo<MemberOption & { uid: string }>(() => {
    if (!user) return { id: "", uid: "", name: "ログインユーザー" };
    return { id: user.uid, uid: user.uid, name: getUserDisplayName(user) };
  }, [user]);

  const members = useMemo<MemberOption[]>(() => {
    const map = new Map<string, string>();
    if (user) map.set(user.uid, getUserDisplayName(user));
    tasks.forEach((task) => {
      if (task.assigneeId) map.set(task.assigneeId, getUserDisplayNameById(task.assigneeId, task.assigneeName));
      if (task.createdBy) map.set(task.createdBy, getUserDisplayNameById(task.createdBy, task.createdByName));
    });
    events.forEach((event) => {
      if (event.assigneeId) map.set(event.assigneeId, getUserDisplayNameById(event.assigneeId, event.assigneeName));
      if (event.createdBy) map.set(event.createdBy, getUserDisplayNameById(event.createdBy, event.createdByName));
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [events, tasks, user]);

  const items = useMemo(() => {
    const taskItems = tasks.map(taskToCalendarItem).filter((item) => item !== null);
    return [...taskItems, ...events.map(eventToCalendarItem)].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }, [events, tasks]);

  const isAdmin = isAdminUser(user?.uid);
  const canEditEvent = (event: CalendarEvent) => isAdmin || event.createdBy === user?.uid || event.assigneeId === user?.uid;
  const canDeleteEvent = () => isAdmin;

  return {
    user,
    currentMember,
    members,
    tasks,
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
