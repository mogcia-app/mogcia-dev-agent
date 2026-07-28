"use client";

import { useMemo, useState } from "react";
import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import { CalendarEventFormModal } from "@/components/calendar/CalendarEventFormModal";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { CalendarPageHeader } from "@/components/calendar/CalendarPageHeader";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { DayTimeline } from "@/components/calendar/DayTimeline";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { UpcomingEvents } from "@/components/calendar/UpcomingEvents";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { useCalendarFilters } from "@/hooks/useCalendarFilters";
import { useCalendarItems } from "@/hooks/useCalendarItems";
import { useSelectedDate } from "@/hooks/useSelectedDate";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { isSameCalendarDate } from "@/lib/calendar-utils";
import { setTaskCompleted, updateTask, updateTaskChecklist } from "@/lib/tasks";
import type { CalendarItem } from "@/types/calendar";
import type { Task, TaskDraft } from "@/types/task";

export function CalendarPageClient() {
  const calendar = useCalendarItems();
  const workspaceOptions = useWorkspaceOptions();
  const selected = useSelectedDate();
  const calendarFilters = useCalendarFilters(calendar.items, calendar.user?.uid ?? "", selected.member);
  const [month, setMonth] = useState(() => new Date(selected.selectedDate.getFullYear(), selected.selectedDate.getMonth(), 1));
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  const selectedTask = useMemo(() => {
    if (selectedItem?.sourceCollection !== "tasks") return null;
    return calendar.tasks.find((task) => task.id === selectedItem.sourceId) ?? null;
  }, [calendar.tasks, selectedItem]);

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
  const taskCanEdit = (task: Task) => calendar.isAdmin || task.assigneeId === calendar.user?.uid || task.createdBy === calendar.user?.uid;

  return (
    <div className="">
      <CalendarPageHeader onCreate={() => setCreateOpen(true)} />
      {calendar.error ? <p className="mt-4 rounded-none bg-[#FFF0F3] px-4 py-3 text-sm font-bold text-[#D94F6E]">{calendar.error}</p> : null}
      {calendar.loading ? (
        <div className="mt-5"><CalendarSkeleton /></div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[38%_1fr]">
          <div className="space-y-5">
            <MonthCalendar items={calendarFilters.filteredItems} month={month} onMonthChange={setMonth} onSelectDate={updateSelectedDate} selectedDate={selected.selectedDate} />
            <CalendarFilters filters={calendarFilters.filters} member={selected.member} members={calendar.members} onFilterChange={calendarFilters.updateFilter} onMemberChange={selected.setMember} />
          </div>
          <div className="space-y-5">
            <DayTimeline items={calendarFilters.filteredItems} onOpen={openCalendarItem} onViewChange={selected.setView} selectedDate={selected.selectedDate} view={selected.view} />
            <UpcomingEvents items={calendarFilters.filteredItems} onOpen={openCalendarItem} onShowAll={() => selected.setView("list")} selectedDate={selected.selectedDate} />
          </div>
        </div>
      )}
      {isCreateOpen ? <CalendarEventFormModal companies={workspaceOptions.companies} currentMember={calendar.currentMember} isAdmin={calendar.isAdmin} meetings={workspaceOptions.meetings} members={calendar.members} onClose={() => setCreateOpen(false)} onSubmit={calendar.createEvent} projects={workspaceOptions.projects} /> : null}
      <CalendarEventDrawer canDelete={eventCanDelete} event={selectedEvent} item={selectedItem?.sourceCollection === "calendarEvents" ? selectedItem : null} onClose={() => setSelectedItem(null)} onDelete={calendar.deleteEvent} />
      <TaskDetailDrawer
        canDelete={false}
        canEdit={selectedTask ? taskCanEdit(selectedTask) : false}
        currentUserId={calendar.currentMember.id}
        isAdmin={calendar.isAdmin}
        key={selectedTask?.id ?? "no-task"}
        companies={workspaceOptions.companies}
        projects={workspaceOptions.projects}
        meetings={workspaceOptions.meetings}
        members={calendar.members}
        onClose={() => setSelectedItem(null)}
        onDelete={async () => undefined}
        onDuplicate={async () => undefined}
        onChecklistChange={updateTaskChecklist}
        onSave={(taskId: string, draft: TaskDraft) => updateTask(taskId, draft, calendar.currentMember)}
        onToggle={setTaskCompleted}
        task={selectedTask && selectedItem && isSameCalendarDate(selectedItem.startAt, selected.selectedDate) ? selectedTask : selectedTask}
      />
    </div>
  );
}
