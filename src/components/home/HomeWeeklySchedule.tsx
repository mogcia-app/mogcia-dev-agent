"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import { CalendarEventFormModal } from "@/components/calendar/CalendarEventFormModal";
import { useCalendarItems } from "@/hooks/useCalendarItems";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { formatTime, getCategoryMeta, isSameCalendarDate, itemsForDate, toDateKey } from "@/lib/calendar-utils";
import type { CalendarEvent, CalendarEventDraft, CalendarItem } from "@/types/calendar";

export function HomeWeeklySchedule({ createOpen, onCreateClose, onCreateOpen }: { createOpen: boolean; onCreateClose: () => void; onCreateOpen: () => void }) {
  const calendar = useCalendarItems();
  const options = useWorkspaceOptions();
  const [start, setStart] = useState(startOfCurrentWeek);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState("");
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(start, index)), [start]);
  const weekItems = useMemo(() => calendar.items.filter((item) => item.status !== "cancelled" && item.startAt < addDays(start, 7) && (item.endAt ?? item.startAt) >= start), [calendar.items, start]);
  const timed = weekItems.filter((item) => !item.allDay);
  const firstHour = Math.min(9, ...timed.map((item) => item.startAt.getHours()));
  const lastHour = Math.max(18, ...timed.map((item) => Math.ceil((item.endAt ?? item.startAt).getHours() + (item.endAt ?? item.startAt).getMinutes() / 60)));
  const hours = Array.from({ length: Math.max(1, lastHour - firstHour) }, (_, index) => firstHour + index);
  const selectedEvent = selected?.sourceCollection === "calendarEvents" ? calendar.events.find((event) => event.id === selected.sourceId) ?? null : null;
  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 2500); };

  return <section className="rounded-xl border border-[#E8E3E1] bg-white p-4 shadow-[0_8px_24px_rgba(31,31,34,0.03)] sm:p-5" id="schedule">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-base font-semibold text-[#25242A]"><CalendarDays className="h-5 w-5 text-[#EC6F8B]" />今週のスケジュール</h2><p className="mt-1 text-sm text-[#8A8186]">{rangeLabel(days)}</p></div><div className="flex flex-wrap items-center gap-2"><button aria-label="前の週" className="grid h-9 w-9 place-items-center border border-[#E5E7EB]" onClick={() => setStart(addDays(start, -7))} type="button"><ChevronLeft className="h-4 w-4" /></button><button aria-label="次の週" className="grid h-9 w-9 place-items-center border border-[#E5E7EB]" onClick={() => setStart(addDays(start, 7))} type="button"><ChevronRight className="h-4 w-4" /></button><button className="h-9 border border-[#E5E7EB] px-3 text-xs font-medium" onClick={() => setStart(startOfCurrentWeek())} type="button">今週</button><Link className="ml-2 text-sm font-medium text-[#EC6F8B]" href={"/calendar" as Route}>カレンダーを開く →</Link></div></div>
    {notice ? <p className="mt-3 text-xs text-[#C44B63]" role="status">{notice}</p> : null}{calendar.error ? <p className="mt-3 text-xs text-red-600">{calendar.error}</p> : null}
    {calendar.loading ? <div className="mt-4 h-72 animate-pulse rounded-lg bg-[#F7F5F5]" /> : <>
      <div className="mt-4 hidden max-h-[460px] overflow-auto overscroll-contain rounded-lg border border-[#E5E7EB] md:block"><div className="min-w-[860px]"><div className="sticky top-0 z-30 grid grid-cols-[58px_repeat(7,minmax(0,1fr))] bg-[#FCFBFA] shadow-[0_1px_0_#DDE1E6]"><div className="border-r border-[#E5E7EB]" />{days.map((day) => <div className={`border-r border-[#E5E7EB] py-2.5 text-center text-sm last:border-r-0 ${isSameCalendarDate(day, new Date()) ? "bg-[#FFF0F3] font-semibold text-[#EC6F8B]" : "text-[#4F5665]"}`} key={day.toISOString()}>{day.getDate()} <span className="text-xs">{day.toLocaleDateString("ja-JP", { weekday: "short" })}</span></div>)}</div>{weekItems.some((item) => item.allDay) ? <div className="grid grid-cols-[58px_repeat(7,minmax(0,1fr))] border-t border-[#E5E7EB]"><div className="border-r border-[#E5E7EB] px-1 py-2 text-center text-[10px] text-[#9A9296]">終日</div>{days.map((day) => <div className="min-h-10 border-r border-[#E5E7EB] p-1 last:border-r-0" key={day.toISOString()}>{itemsForDate(weekItems, day).filter((item) => item.allDay).map((item) => <button className="block w-full truncate rounded-md bg-[#FFF0F3] px-1.5 py-1 text-left text-[10px] font-medium text-[#C44B63]" key={item.id} onClick={() => setSelected(item)} type="button">{item.title}</button>)}</div>)}</div> : null}<div className="grid grid-cols-[58px_repeat(7,minmax(0,1fr))] border-t border-[#E5E7EB]"><div className="relative border-r border-[#E5E7EB]" style={{ height: hours.length * 60 }}>{hours.map((hour, index) => <span className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-[#8A919F]" key={hour} style={{ top: index * 60 }}>{String(hour).padStart(2, "0")}:00</span>)}</div>{days.map((day) => <DayColumn day={day} firstHour={firstHour} height={hours.length * 60} items={itemsForDate(weekItems, day)} key={day.toISOString()} onOpen={setSelected} />)}</div></div></div>
      <div className="mt-4 grid gap-4 md:hidden">{days.map((day) => { const items = itemsForDate(weekItems, day); return <div key={day.toISOString()}><h3 className={`border-b pb-2 text-sm font-medium ${isSameCalendarDate(day, new Date()) ? "border-[#F7CAD2] text-[#EC6F8B]" : "border-[#E5E7EB] text-[#4B5563]"}`}>{day.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}</h3>{items.length ? <div className="divide-y divide-[#F0E7E9]">{items.map((item) => <button className="flex w-full gap-3 py-3 text-left" key={item.id} onClick={() => setSelected(item)} type="button"><span className="w-24 shrink-0 text-xs text-[#777]">{item.allDay ? "終日" : `${formatTime(item.startAt)} - ${formatTime(item.endAt ?? item.startAt)}`}</span><span className="min-w-0 truncate text-sm font-medium text-[#2B2B2B]">{item.title}</span></button>)}</div> : <p className="py-3 text-xs text-[#9A9296]">予定なし</p>}</div>; })}</div>
    </>}
    <button className="mt-4 inline-flex h-9 items-center gap-1 border border-[#F7CAD2] px-3 text-sm text-[#EC6F8B] md:hidden" onClick={onCreateOpen} type="button"><Plus className="h-4 w-4" />予定を追加</button>
    {createOpen ? <CalendarEventFormModal companies={options.companies} currentMember={calendar.currentMember} isAdmin={calendar.isAdmin} leads={options.leads} members={calendar.members} onClose={onCreateClose} onSubmit={async (draft) => { await calendar.createEvent(draft); flash("予定を追加しました"); }} /> : null}
    {editing ? <CalendarEventFormModal companies={options.companies} currentMember={calendar.currentMember} initialDraft={toDraft(editing)} isAdmin={calendar.isAdmin} leads={options.leads} members={calendar.members} onClose={() => setEditing(null)} onSubmit={async (draft) => { await calendar.updateEvent(editing.id, draft); flash("予定を更新しました"); }} /> : null}
    <CalendarEventDrawer canDelete={Boolean(selectedEvent && calendar.canDeleteEvent())} canEdit={Boolean(selectedEvent && calendar.canEditEvent(selectedEvent))} event={selectedEvent} item={selected} leads={options.leads} onClose={() => setSelected(null)} onDelete={async (id) => { await calendar.deleteEvent(id); flash("予定を削除しました"); }} onEdit={(event) => { setSelected(null); setEditing(event); }} />
  </section>;
}

function DayColumn({ day, items, firstHour, height, onOpen }: { day: Date; items: CalendarItem[]; firstHour: number; height: number; onOpen: (item: CalendarItem) => void }) {
  const timedItems = layoutDayItems(items.filter((item) => !item.allDay), day);
  return <div className={`relative border-r border-[#E5E7EB] last:border-r-0 ${isSameCalendarDate(day, new Date()) ? "bg-[#FFF9FA]" : "bg-white"}`} style={{ height }}>{Array.from({ length: height / 60 }, (_, index) => <div className="absolute inset-x-0 border-t border-[#ECEEF1]" key={index} style={{ top: index * 60 }} />)}{timedItems.map(({ item, startDate, endDate, lane, laneCount }) => { const meta = getCategoryMeta(item.category); const start = startDate.getHours() + startDate.getMinutes() / 60; const end = endDate.getHours() + endDate.getMinutes() / 60; const top = Math.max(0, (start - firstHour) * 60); const blockHeight = Math.max(44, (end - start) * 60); const width = `calc(${100 / laneCount}% - 6px)`; return <button className={`absolute z-10 overflow-hidden rounded-md border border-l-[3px] bg-white px-2 py-1.5 text-left text-[11px] shadow-[0_2px_8px_rgba(31,31,34,0.12)] ${meta.text} ${meta.border}`} key={item.id} onClick={() => onOpen(item)} style={{ height: blockHeight, left: `calc(${lane * (100 / laneCount)}% + 3px)`, top, width }} title={`${item.title} ${formatTime(item.startAt)} - ${formatTime(item.endAt ?? item.startAt)}`} type="button"><span className="block truncate font-semibold text-[#25242A]">{item.title}</span><span className="mt-0.5 block truncate font-medium text-[#697184]">{formatTime(item.startAt)} - {formatTime(item.endAt ?? item.startAt)}</span></button>; })}</div>;
}

function startOfCurrentWeek() { const date = new Date(); date.setHours(0, 0, 0, 0); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return date; }
function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function rangeLabel(days: Date[]) { return `${days[0].toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })} - ${days[6].toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}`; }
function toDraft(event: CalendarEvent): CalendarEventDraft { const start = event.startAt.toDate(); const end = event.endAt?.toDate() ?? new Date(start.getTime() + 3600000); return { title: event.title, eventType: event.eventType, meetingMethod: event.meetingMethod ?? "other", startDate: toDateKey(start), startTime: timeValue(start), durationMinutes: Math.max(30, Math.round((end.getTime() - start.getTime()) / 1800000) * 30), endDate: toDateKey(start), endTime: timeValue(end), allDay: event.allDay, description: event.description ?? "", assigneeId: event.assigneeId, assigneeName: event.assigneeName ?? "", attendeeIds: event.attendeeIds ?? [], attendeeMemberNames: event.attendeeNames ?? [], attendeeNames: event.attendeeNames?.join(", ") ?? "", relatedType: event.relatedType ?? "", relatedId: event.relatedId ?? "", relatedName: event.relatedName ?? "", relatedContactName: event.relatedContactName ?? "", companyId: event.companyId ?? "", companyName: event.companyName ?? "", productId: event.productId ?? "", productName: event.productName ?? "", productIds: event.productIds ?? [], productNames: event.productNames ?? [], projectId: event.projectId ?? "", projectName: event.projectName ?? "", meetingId: event.meetingId ?? "", location: event.location ?? "", meetingUrl: event.meetingUrl ?? "", reminder: "0", recurrence: "none", recurrenceWeekdays: [start.getDay()], recurrenceEndDate: "" }; }
function timeValue(date: Date) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }

function layoutDayItems(items: CalendarItem[], day: Date) {
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
  const normalized = items.map((item) => ({ item, startDate: new Date(Math.max(item.startAt.getTime(), dayStart.getTime())), endDate: new Date(Math.min((item.endAt ?? new Date(item.startAt.getTime() + 3600000)).getTime(), dayEnd.getTime())) })).sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
  return normalized.map((entry) => {
    const overlapping = normalized.filter((candidate) => candidate.startDate < entry.endDate && candidate.endDate > entry.startDate);
    const lane = overlapping.findIndex((candidate) => candidate.item.id === entry.item.id);
    return { ...entry, lane: Math.max(0, lane), laneCount: Math.max(1, overlapping.length) };
  });
}
