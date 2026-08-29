import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
import { DesktopApiError, desktopFailure, desktopSuccess, optionalString, parseIsoDate, requireString } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { timestampToIso } from "@/lib/desktop/format";
import { findLooseDuplicates } from "@/lib/server/duplicate-utils";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "calendar_read", async () => {
      const snapshot = await auth.db.collection("calendarEvents").orderBy("startAt", "asc").limit(120).get();
      const events = snapshot.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() })).filter((event) => {
        return event.createdBy === auth.userId || event.assigneeId === auth.userId || (Array.isArray(event.attendeeIds) && event.attendeeIds.includes(auth.userId));
      }).map((event) => ({
        id: event.id,
        title: String(event.title ?? ""),
        startAt: timestampToIso(event.startAt),
        endAt: timestampToIso(event.endAt),
        companyId: event.companyId ?? null,
        companyName: event.companyName ?? null,
        attendeeIds: Array.isArray(event.attendeeIds) ? event.attendeeIds : [],
        attendeeNames: Array.isArray(event.attendeeNames) ? event.attendeeNames : [],
        eventType: String(event.eventType ?? "meeting")
      }));
      return { events };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireString(body.title, "予定タイトル", 200);
    const startAt = parseIsoDate(body.startAt, "開始日時");
    if (!startAt) throw new DesktopApiError("VALIDATION_ERROR", "開始日時を入力してください", 400);
    const endAt = parseIsoDate(body.endAt, "終了日時") ?? new Date(startAt.getTime() + 60 * 60 * 1000);
    const companyId = optionalString(body.companyId, "会社ID", 120) || null;
    const force = body.force === true;
    const userName = getUserDisplayNameById(auth.userId);

    const data = await withDesktopAudit(context, "calendar_create", async () => {
      const existing = await auth.db.collection("calendarEvents").orderBy("startAt", "desc").limit(240).get();
      const existingEvents: DocumentData[] = existing.docs.map((entry): DocumentData => ({ id: entry.id, ...entry.data() }));
      const duplicates = findLooseDuplicates(existingEvents, { title, companyId, startsAt: startAt });
      if (duplicates.length && !force) {
        return { requiresConfirmation: true, duplicates: duplicates.slice(0, 5).map((item) => ({ id: item.id, title: item.title, startAt: timestampToIso(item.startAt) })) };
      }
      const companySnapshot = companyId ? await auth.db.collection("companies").doc(companyId).get() : null;
      if (companyId && !companySnapshot?.exists) throw new DesktopApiError("NOT_FOUND", "会社が見つかりません", 404);
      const ref = await auth.db.collection("calendarEvents").add({
        title,
        description: optionalString(body.description, "説明", 2000),
        eventType: typeof body.eventType === "string" ? body.eventType : "meeting",
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        allDay: Boolean(body.allDay),
        assigneeId: auth.userId,
        assigneeName: userName,
        attendeeIds: stringArray(body.attendeeIds),
        attendeeNames: stringArray(body.attendeeNames),
        companyId,
        companyName: companySnapshot?.data()?.name ?? null,
        projectId: null,
        projectName: null,
        source: "manual",
        visibility: "team",
        createdBy: auth.userId,
        createdByName: userName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { calendarEventId: ref.id, requiresConfirmation: false };
    });
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(error);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}
