"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import { CalendarEventFormModal } from "@/components/calendar/CalendarEventFormModal";
import { CalendarPageHeader } from "@/components/calendar/CalendarPageHeader";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { TimelineEventCard } from "@/components/calendar/TimelineEventCard";
import { useCalendarItems } from "@/hooks/useCalendarItems";
import { useSelectedDate } from "@/hooks/useSelectedDate";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { formatShortDate, itemsForDate, toDateKey } from "@/lib/calendar-utils";
import type { CalendarEvent, CalendarEventDraft, CalendarItem } from "@/types/calendar";

export function CalendarPageClient() {
  const calendar = useCalendarItems();
  const workspaceOptions = useWorkspaceOptions();
  const selected = useSelectedDate();
  const [month, setMonth] = useState(() => new Date(selected.selectedDate.getFullYear(), selected.selectedDate.getMonth(), 1));
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const selectedEvent = useMemo(() => {
    if (selectedItem?.sourceCollection !== "calendarEvents") return null;
    return calendar.events.find((event) => event.id === selectedItem.sourceId) ?? null;
  }, [calendar.events, selectedItem]);

  const updateSelectedDate = (date: Date) => {
    selected.setSelectedDate(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const openCalendarItem = (item: CalendarItem) => {
    setSelectedItem(item);
    updateSelectedDate(item.startAt);
  };

  const eventCanDelete = selectedEvent ? calendar.canDeleteEvent() : false;
  const eventCanEdit = selectedEvent ? calendar.canEditEvent(selectedEvent) : false;
  const selectedDayItems = itemsForDate(calendar.items, selected.selectedDate);

  return (
    <div className="">
      <CalendarPageHeader actions={<button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={!calendar.user} onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />予定を追加</button>} />
      {calendar.error ? <p className="mt-4 rounded-xl bg-[#FFF0F3] px-4 py-3 text-sm font-bold text-[#D94F6E]">{calendar.error}</p> : null}
      {calendar.loading ? (
        <div className="mt-5"><CalendarSkeleton /></div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"><MonthCalendar items={calendar.items} month={month} onMonthChange={setMonth} onOpen={openCalendarItem} onSelectDate={updateSelectedDate} selectedDate={selected.selectedDate} /><aside className="rounded-2xl border border-[#ECE7E4] bg-white p-4 shadow-sm"><h2 className="text-base font-semibold text-neutral-900">{formatShortDate(selected.selectedDate)}</h2><p className="mt-1 text-xs text-neutral-400">{selectedDayItems.length}件の予定</p><div className="mt-4 space-y-3">{selectedDayItems.map((item) => <TimelineEventCard item={item} key={item.id} onOpen={openCalendarItem} />)}{selectedDayItems.length === 0 ? <div className="rounded-xl border border-dashed border-[#E5E0DD] bg-[#FCFBFA] px-4 py-10 text-center"><p className="text-sm font-semibold text-neutral-600">予定はありません</p><p className="mt-1 text-xs text-neutral-400">この日は空いています。</p></div> : null}</div></aside></div>
      )}
      {createOpen ? <CalendarEventFormModal companies={workspaceOptions.companies} currentMember={calendar.currentMember} isAdmin={calendar.isAdmin} meetings={workspaceOptions.meetings} members={calendar.members} onClose={() => setCreateOpen(false)} onSubmit={calendar.createEvent} projects={workspaceOptions.projects} /> : null}
      {editingEvent ? <CalendarEventFormModal companies={workspaceOptions.companies} currentMember={calendar.currentMember} initialDraft={eventToDraft(editingEvent)} isAdmin={calendar.isAdmin} meetings={workspaceOptions.meetings} members={calendar.members} onClose={() => setEditingEvent(null)} onSubmit={(draft) => calendar.updateEvent(editingEvent.id, draft)} projects={workspaceOptions.projects} /> : null}
      <CalendarEventDrawer canDelete={eventCanDelete} canEdit={eventCanEdit} event={selectedEvent} item={selectedItem?.sourceCollection === "calendarEvents" ? selectedItem : null} onClose={() => setSelectedItem(null)} onDelete={calendar.deleteEvent} onEdit={(event) => { setEditingEvent(event); setSelectedItem(null); }} />
    </div>
  );
}

function eventToDraft(event: CalendarEvent): CalendarEventDraft {
  const start = event.startAt.toDate();
  const end = event.endAt?.toDate() ?? new Date(start.getTime() + 60 * 60 * 1000);
  return { title: event.title, eventType: event.eventType, startDate: toDateKey(start), startTime: timeValue(start), endDate: toDateKey(end), endTime: timeValue(end), allDay: event.allDay, description: event.description ?? "", assigneeId: event.assigneeId, assigneeName: event.assigneeName ?? "", attendeeIds: event.attendeeIds ?? [], attendeeMemberNames: event.attendeeNames ?? [], attendeeNames: event.attendeeNames?.join(", ") ?? "", companyId: event.companyId ?? "", companyName: event.companyName ?? "", projectId: event.projectId ?? "", projectName: event.projectName ?? "", meetingId: event.meetingId ?? "", location: event.location ?? "", meetingUrl: event.meetingUrl ?? "", reminder: "0", recurrence: event.recurrence?.frequency ?? "none" };
}

function timeValue(date: Date): string { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
