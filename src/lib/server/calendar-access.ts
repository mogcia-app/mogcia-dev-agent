import "server-only";

import type { DocumentData } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase/admin-auth";
import { DEFAULT_WORKSPACE_MEMBERS } from "@/lib/user-display";

export async function getActiveCalendarMemberIds(currentUserId: string): Promise<Set<string>> {
  try {
    const users = await getAdminAuth().listUsers(1000);
    return new Set([currentUserId, ...users.users.filter((user) => !user.disabled).map((user) => user.uid)]);
  } catch {
    return new Set([currentUserId, ...DEFAULT_WORKSPACE_MEMBERS.map((member) => member.uid)]);
  }
}

export function isVisibleCalendarEventForMemberGroup(event: DocumentData, memberIds: Set<string>, currentUserId: string): boolean {
  const participantIds = calendarParticipantIds(event);
  const belongsToActiveMember = participantIds.some((id) => memberIds.has(id));
  if (!belongsToActiveMember) return false;
  if (event.visibility === "private") return participantIds.includes(currentUserId);
  return true;
}

function calendarParticipantIds(event: DocumentData): string[] {
  return [
    stringField(event.createdBy),
    stringField(event.assigneeId),
    ...(Array.isArray(event.attendeeIds) ? event.attendeeIds.map(stringField) : [])
  ].filter(Boolean);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}
