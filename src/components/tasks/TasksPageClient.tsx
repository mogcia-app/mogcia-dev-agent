"use client";

import { Archive, Bot, CalendarDays, Check, CheckSquare, Circle, Clock3, Inbox, ListChecks, Plus, Search, Sparkles, Trash2, User, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TaskFormFields } from "@/components/tasks/TaskFormFields";
import { TaskProgressTimeline } from "@/components/tasks/TaskProgressTimeline";
import { SingleSelect } from "@/components/ui/select";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { createEmptyTaskDraft, getDueBadge, taskToDraft } from "@/lib/task-utils";
import type { MemberOption, Task, TaskDraft, TaskSort, TaskStatusFilter, TaskView } from "@/types/task";

type SuggestedTask = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
  reason: string;
};

type SidebarEntry = {
  label: string;
  icon: typeof ListChecks;
  count: number;
  active: boolean;
  onClick: () => void;
};

const viewLabels: Record<TaskView, string> = {
  mine: "マイタスク",
  ai: "AI作成",
  members: "メンバー",
  assigned: "依頼したタスク",
  log: "ログ"
};

const sortLabels: Record<TaskSort, string> = {
  dueAsc: "期限が近い順",
  dueDesc: "期限が遠い順",
  priorityDesc: "優先度順",
  newest: "新しい順",
  oldest: "古い順",
  creator: "作成者順",
  assignee: "担当者順"
};

export function TasksPageClient() {
  const taskStore = useTasks();
  const workspaceOptions = useWorkspaceOptions();
  const filters = useTaskFilters(taskStore.tasks, taskStore.user?.uid ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [isSplitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const isLogView = filters.view === "log";

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return filters.filteredTasks;
    return filters.filteredTasks.filter((task) => [task.title, task.description, task.companyName, task.productName, task.assigneeName].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [filters.filteredTasks, query]);

  const selectedTask = useMemo(() => selectedTaskId ? visibleTasks.find((task) => task.id === selectedTaskId) ?? null : null, [selectedTaskId, visibleTasks]);

  const createQuickTask = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    await taskStore.createTask({ ...createEmptyTaskDraft(taskStore.currentMember), title });
    setQuickTitle("");
  };

  const splitQuickTaskWithAi = async () => {
    const content = quickTitle.trim();
    if (!content || isSplitting) return;
    setSplitting(true);
    setSplitError(null);
    try {
      const suggestions = await fetchTaskSuggestions(content, taskStore.user);
      const tasksToCreate = suggestions.length ? suggestions : localTaskSuggestions(content);
      if (!tasksToCreate.length) {
        setSplitError("分解できる内容が見つかりませんでした。");
        return;
      }
      await Promise.all(tasksToCreate.map((task) => taskStore.createTask(suggestionToDraft(task, content, taskStore.currentMember))));
      setQuickTitle("");
      filters.setFilter("view", "ai");
    } catch (error) {
      setSplitError(error instanceof Error ? error.message : "AI分解に失敗しました。");
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-40px)] overflow-hidden border border-[#EFE3E6] bg-white shadow-sm xl:grid xl:grid-cols-[280px_minmax(420px,1fr)_420px]">
      <TaskSidebar counts={filters.counts} currentUserId={taskStore.user?.uid ?? ""} filters={filters} onCreate={() => setSelectedTaskId("")} tasks={taskStore.tasks} />

      <main className="min-w-0 border-[#EFE3E6] xl:border-l xl:border-r">
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-[#EFE3E6] px-5">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-[#2B2B2B]">{viewLabels[filters.view]}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TaskSortSelect sort={filters.sort} setFilter={filters.setFilter} />
          </div>
        </div>

        {taskStore.error ? <p className="m-4 rounded-none bg-[#FFF2F5] px-4 py-3 text-sm font-bold text-[#D94F6E]">{taskStore.error}</p> : null}

        <section className="border-b border-[#EFE3E6] p-5">
          <div className="flex min-h-12 items-center gap-3 rounded-none bg-[#F7F5F5] px-4 py-1.5 text-sm font-bold text-[#9A9296]">
            <Plus className="h-4 w-4" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B7B0B3]"
              disabled={!taskStore.user || isSplitting}
              onChange={(event) => setQuickTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createQuickTask();
              }}
              placeholder="タスクやメモを入力します。Enterで保存、AIで分解できます。"
              value={quickTitle}
            />
            <button
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-none bg-white px-3 text-xs font-black text-[#EC6F8B] ring-1 ring-[#F0DEE2] transition hover:bg-[#FFF0F3] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!quickTitle.trim() || !taskStore.user || isSplitting}
              onClick={() => void splitQuickTaskWithAi()}
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              {isSplitting ? "分解中..." : "AIで分解"}
            </button>
          </div>
          {splitError ? <p className="mt-2 text-xs font-bold text-[#D94F6E]">{splitError}</p> : null}
          <label className="mt-3 flex h-10 items-center gap-2 border border-[#EFE3E6] px-3 text-sm font-semibold text-[#8A8186]">
            <Search className="h-4 w-4" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="タイトル・会社・商材で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </section>

        <section className="max-h-[calc(100vh-220px)] overflow-auto px-5 py-4">
          {taskStore.loading ? <TaskRowsSkeleton /> : null}
          {!taskStore.loading && isLogView ? <TaskLogPicker currentUserId={taskStore.user?.uid ?? ""} onSelect={setSelectedTaskId} selectedTask={selectedTask} tasks={visibleTasks} /> : null}
          {!taskStore.loading && !isLogView ? (
            <TaskRows
              canEditTask={taskStore.canEditTask}
              currentUserId={taskStore.user?.uid ?? ""}
              onSelect={setSelectedTaskId}
              onToggle={(task, completed) => void taskStore.completeTask(task, completed)}
              selectedTaskId={selectedTask?.id}
              tasks={visibleTasks}
            />
          ) : null}
          {!taskStore.loading ? <p className="mt-5 text-center text-xs font-bold text-[#A0979B]">{visibleTasks.length}件を表示</p> : null}
        </section>
      </main>

      <TaskInspector
        canDelete={selectedTask ? taskStore.canDeleteTask() : false}
        canEdit={selectedTask ? taskStore.canEditTask(selectedTask) : false}
        companies={workspaceOptions.companies}
        currentMember={taskStore.currentMember}
        currentUserId={taskStore.user?.uid ?? ""}
        isAdmin={taskStore.isAdmin}
        members={taskStore.members}
        onCreate={taskStore.createTask}
        onDelete={taskStore.deleteTask}
        onDuplicate={taskStore.duplicateTask}
        onSave={taskStore.updateTask}
        onToggle={taskStore.completeTask}
        products={workspaceOptions.products}
        task={selectedTask}
      />
    </div>
  );
}

async function fetchTaskSuggestions(content: string, user: { getIdToken: () => Promise<string> } | null): Promise<SuggestedTask[]> {
  if (!user) return localTaskSuggestions(content);
  const token = await user.getIdToken();
  const response = await fetch("/api/companies/suggest-tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "", title: "タスク分解", content, nextActions: content, productNames: [], contactNames: [] })
  });
  if (!response.ok) return localTaskSuggestions(content);
  const data = (await response.json()) as { tasks?: SuggestedTask[] };
  return data.tasks?.length ? data.tasks : localTaskSuggestions(content);
}

function suggestionToDraft(task: SuggestedTask, sourceContent: string, currentMember: MemberOption): TaskDraft {
  return {
    ...createEmptyTaskDraft(currentMember),
    title: task.title,
    description: task.description || sourceContent,
    priority: task.priority,
    source: "ai",
    dueDate: task.dueDate ?? "",
    aiReason: task.reason || "入力メモをAIで分解して作成"
  };
}

function localTaskSuggestions(content: string): SuggestedTask[] {
  return content
    .split(/\n|。|・|,|、/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((item) => ({
      title: item.length > 42 ? `${item.slice(0, 42)}...` : item,
      description: content,
      priority: "medium" as const,
      dueDate: null,
      reason: "入力メモを分解して作成"
    }));
}

function TaskSidebar({ tasks, counts, currentUserId, filters, onCreate }: { tasks: Task[]; counts: Record<TaskStatusFilter, number>; currentUserId: string; filters: ReturnType<typeof useTaskFilters>; onCreate: () => void }) {
  const entries: SidebarEntry[] = [
    { label: "今日", icon: CalendarDays, count: counts.today, active: filters.status === "today", onClick: () => filters.setFilter("status", "today") },
    { label: "受信トレイ", icon: Inbox, count: counts.open, active: filters.status === "open" && filters.view === "mine", onClick: () => { filters.setFilter("view", "mine"); filters.setFilter("status", "open"); } },
    { label: "完了", icon: CheckSquare, count: counts.completed, active: filters.status === "completed", onClick: () => filters.setFilter("status", "completed") }
  ];
  const viewEntries: Array<{ value: TaskView; label: string; icon: typeof User }> = [
    { value: "mine", label: "マイタスク", icon: User },
    { value: "members", label: "メンバータスク", icon: UsersRound },
    { value: "assigned", label: "依頼したタスク", icon: UserPlus },
    { value: "ai", label: "AI作成", icon: Bot }
  ];
  const viewCounts: Record<TaskView, number> = {
    mine: currentUserId ? tasks.filter((task) => task.assigneeId === currentUserId || task.collaboratorIds?.includes(currentUserId)).length : 0,
    members: currentUserId ? tasks.filter((task) => task.assigneeId !== currentUserId || task.collaboratorIds?.some((id) => id !== currentUserId)).length : 0,
    assigned: currentUserId ? tasks.filter((task) => task.createdBy === currentUserId && task.assigneeId !== currentUserId).length : 0,
    ai: tasks.filter((task) => task.source === "ai").length,
    log: tasks.length
  };

  return (
    <aside className="bg-[#FBFAFA] p-4">
      <button className="mb-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onCreate} type="button"><Plus className="h-4 w-4" />新しいタスク</button>
      <div className="grid gap-1">
        {entries.map((entry) => <SidebarButton entry={entry} key={entry.label} />)}
      </div>
      <div className="my-5 border-t border-[#EFE3E6]" />
      <p className="px-3 text-xs font-black text-[#B3AAAE]">リスト</p>
      <div className="mt-3 grid gap-1">
        {viewEntries.map((entry) => {
          const Icon = entry.icon;
          const active = filters.view === entry.value;
          return (
            <button className={`flex h-11 items-center justify-between rounded-none px-3 text-sm font-bold ${active ? "bg-[#F0EEEE] text-[#2B2B2B]" : "text-[#6F676B] hover:bg-white"}`} key={entry.value} onClick={() => filters.setFilter("view", entry.value)} type="button">
              <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{entry.label}</span>
              <span className="text-xs text-[#AAA]">{viewCounts[entry.value]}</span>
            </button>
          );
        })}
      </div>
      <div className="my-5 border-t border-[#EFE3E6]" />
      <p className="px-3 text-xs font-black text-[#B3AAAE]">フィルター</p>
      <div className="mt-3 grid gap-2 rounded-none bg-[#F4F2F2] p-3 text-xs font-bold text-[#8A8186]">
        <FilterSelect label="期限" value={filters.due} onChange={(value) => filters.setFilter("due", value)} options={[["all", "すべて"], ["today", "今日"], ["tomorrow", "明日"], ["week", "今週"], ["month", "今月"], ["overdue", "期限切れ"], ["none", "期限なし"]]} />
        <FilterSelect label="優先度" value={filters.priority} onChange={(value) => filters.setFilter("priority", value)} options={[["all", "すべて"], ["high", "高"], ["medium", "中"], ["low", "低"]]} />
        <FilterSelect label="作成元" value={filters.source} onChange={(value) => filters.setFilter("source", value)} options={[["all", "すべて"], ["ai", "AI"], ["manual", "手動"], ["automation", "自動"]]} />
      </div>
      <button className="mt-5 flex h-11 w-full items-center gap-2 rounded-none px-3 text-sm font-bold text-[#6F676B] hover:bg-white" onClick={() => filters.setFilter("status", "completed")} type="button"><Archive className="h-4 w-4" />完了済み</button>
    </aside>
  );
}

function SidebarButton({ entry }: { entry: SidebarEntry }) {
  const Icon = entry.icon;
  return (
    <button className={`flex h-11 items-center justify-between rounded-none px-3 text-sm font-bold ${entry.active ? "bg-[#F0EEEE] text-[#2B2B2B]" : "text-[#6F676B] hover:bg-white"}`} onClick={entry.onClick} type="button">
      <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{entry.label}</span>
      <span className="text-xs text-[#AAA]">{entry.count}</span>
    </button>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      {label}
      <SingleSelect options={options.map(([nextValue, nextLabel]) => ({ value: nextValue, label: nextLabel }))} value={value} onChange={onChange} />
    </label>
  );
}

function TaskSortSelect({ sort, setFilter }: { sort: TaskSort; setFilter: (key: string, value: string) => void }) {
  return (
    <div className="w-44">
      <SingleSelect options={Object.entries(sortLabels).map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setFilter("sort", value)} />
    </div>
  );
}

function TaskRows({ tasks, selectedTaskId, currentUserId, canEditTask, onSelect, onToggle }: { tasks: Task[]; selectedTaskId?: string; currentUserId: string; canEditTask: (task: Task) => boolean; onSelect: (taskId: string) => void; onToggle: (task: Task, completed: boolean) => void }) {
  if (!tasks.length) return <p className="py-16 text-center text-sm font-bold text-[#958B90]">タスクはまだありません。</p>;
  return (
    <div className="divide-y divide-[#F1ECEE]">
      {tasks.map((task) => {
        const completed = task.status === "completed";
        const active = selectedTaskId === task.id;
        return (
          <div className={`grid min-h-12 grid-cols-[34px_1fr_auto] items-center gap-2 px-2 transition ${active ? "bg-[#F7F5F5]" : "hover:bg-[#FFFBFC]"}`} key={task.id}>
            <button className={`grid h-6 w-6 place-items-center border ${completed ? "border-[#EC6F8B] bg-[#FFF2F5] text-[#EC6F8B]" : "border-[#CFC7CB] text-transparent"}`} disabled={!canEditTask(task)} onClick={() => onToggle(task, !completed)} type="button" aria-label={completed ? "未完了に戻す" : "完了にする"}>
              <Check className="h-4 w-4" />
            </button>
            <button className="min-w-0 py-2 text-left" onClick={() => onSelect(task.id)} type="button">
              <span className={`block truncate text-sm font-bold ${completed ? "text-[#A9A1A5] line-through" : "text-[#2B2B2B]"}`}>{task.title || "タイトルなし"}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#8A8186]">
                {task.companyName ? <span>{task.companyName}</span> : null}
                {task.productName ? <span>{task.productName}</span> : null}
                {task.assigneeId !== currentUserId && task.assigneeName ? <span>担当: {task.assigneeName}</span> : null}
              </span>
            </button>
            <button className="hidden h-8 items-center gap-1 px-2 text-xs font-bold text-[#9A9296] sm:inline-flex" onClick={() => onSelect(task.id)} type="button">
              <Clock3 className="h-3.5 w-3.5" />
              {getDueBadge(task)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TaskLogPicker({ tasks, selectedTask, currentUserId, onSelect }: { tasks: Task[]; selectedTask: Task | null; currentUserId: string; onSelect: (taskId: string) => void }) {
  return (
    <div className="grid gap-4">
      <SingleSelect emptyLabel="タスクがありません。" options={tasks.map((task) => ({ value: task.id, label: task.title || "無題のタスク", description: task.assigneeName ? `担当: ${task.assigneeName}` : "" }))} placeholder="全タスクから選択" value={selectedTask?.id ?? ""} onChange={onSelect} />
      <TaskProgressTimeline currentUserId={currentUserId} task={selectedTask} />
    </div>
  );
}

function TaskInspector({
  task,
  members,
  companies,
  products,
  canEdit,
  canDelete,
  isAdmin,
  currentMember,
  currentUserId,
  onCreate,
  onSave,
  onToggle,
  onDelete,
  onDuplicate
}: {
  task: Task | null;
  members: MemberOption[];
  companies: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; tagline?: string }>;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  currentMember: MemberOption;
  currentUserId?: string;
  onCreate: (draft: TaskDraft) => Promise<void>;
  onSave: (taskId: string, draft: TaskDraft) => Promise<void>;
  onToggle: (task: Task, completed: boolean) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onDuplicate: (task: Task) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TaskDraft | null>(task ? taskToDraft(task) : null);
  const [createDraft, setCreateDraft] = useState<TaskDraft>(() => createEmptyTaskDraft(currentMember));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(task ? taskToDraft(task) : null);
  }, [task?.id, task]);

  useEffect(() => {
    if (!task) setCreateDraft(createEmptyTaskDraft(currentMember));
  }, [currentMember.id, currentMember.name, task]);

  if (!task) {
    const saveCreate = async () => {
      if (!createDraft.title.trim()) return;
      setSaving(true);
      try {
        await onCreate(createDraft);
        setCreateDraft(createEmptyTaskDraft(currentMember));
      } finally {
        setSaving(false);
      }
    };

    return (
      <aside className="hidden max-h-[calc(100vh-40px)] overflow-auto bg-white xl:block">
        <div className="flex min-h-16 items-center justify-between border-b border-[#EFE3E6] px-5">
          <p className="text-sm font-bold text-[#8A8186]">新しいタスク</p>
        </div>
        <div className="p-5">
          <TaskFormFields companies={companies} draft={createDraft} onChange={setCreateDraft} products={products} readOnly={false} />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#EFE3E6] pt-4">
            <ShareTargetSelect currentMember={currentMember} draft={createDraft} members={members} onChange={setCreateDraft} />
            <button className="h-10 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !createDraft.title.trim()} onClick={() => void saveCreate()} type="button">{saving ? "保存中..." : "保存"}</button>
          </div>
        </div>
      </aside>
    );
  }

  if (!draft) return null;

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(task.id, draft);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    await onDelete(task.id);
  };

  return (
    <aside className="hidden max-h-[calc(100vh-40px)] overflow-auto bg-white xl:block">
      <div className="flex min-h-16 items-center justify-between border-b border-[#EFE3E6] px-5">
        <div className="flex min-w-0 items-center gap-3 text-sm font-bold text-[#8A8186]">
          <button className={`grid h-6 w-6 place-items-center border ${task.status === "completed" ? "border-[#EC6F8B] bg-[#FFF2F5] text-[#EC6F8B]" : "border-[#CFC7CB] text-transparent"}`} disabled={!canEdit} onClick={() => void onToggle(task, task.status !== "completed")} type="button">
            <Check className="h-4 w-4" />
          </button>
          <span className="truncate">{task.dueDate ? getDueBadge(task) : "日付を設定"}</span>
        </div>
        <button className="text-[#AAA]" type="button" aria-label="フラグ"><Circle className="h-5 w-5" /></button>
      </div>
      <div className="p-5">
        <TaskFormFields companies={companies} draft={draft} onChange={setDraft} products={products} readOnly={!canEdit} />
        {!canEdit ? <p className="mt-4 rounded-none bg-[#FFF7F8] px-4 py-3 text-sm font-semibold text-[#8A6A70]">他メンバーのタスクは閲覧のみです。</p> : null}
        <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-[#EFE3E6] pt-4">
          <div className="flex gap-2">
            <button className="h-10 rounded-none border border-[#F0DEE2] px-3 text-sm font-bold text-[#6F676B]" onClick={() => void onDuplicate(task)} type="button">複製</button>
            {canDelete ? <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F6CBD2] px-3 text-sm font-bold text-[#E65A78]" onClick={() => void remove()} type="button"><Trash2 className="h-4 w-4" />削除</button> : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <ShareTargetSelect currentMember={currentMember} disabled={!canEdit || (!isAdmin && task.createdBy !== currentUserId)} draft={draft} members={members} onChange={setDraft} />
            <button className="h-10 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={!canEdit || saving || !draft.title.trim()} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存"}</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ShareTargetSelect({
  draft,
  members,
  currentMember,
  disabled = false,
  onChange
}: {
  draft: TaskDraft;
  members: MemberOption[];
  currentMember: MemberOption;
  disabled?: boolean;
  onChange: (draft: TaskDraft) => void;
}) {
  const otherMembers = members.filter((member) => member.id && member.id !== currentMember.id);
  const value = getShareTargetValue(draft, currentMember.id);
  const options = [
    { value: "self", label: "自分のタスク" },
    ...otherMembers.map((member) => ({ value: `assign:${member.id}`, label: member.name })),
    ...otherMembers.map((member) => ({ value: `collaborate:${member.id}`, label: `共同作業: ${member.name}` }))
  ];

  return (
    <label className="grid min-w-[220px] gap-1 text-xs font-black text-[#8A8186]">
      共有先
      <SingleSelect disabled={disabled} options={options} value={value} onChange={(nextValue) => onChange(applyShareTarget(draft, nextValue, currentMember, members))} />
    </label>
  );
}

function getShareTargetValue(draft: TaskDraft, currentUserId: string): string {
  const collaboratorIds = draft.collaboratorIds ?? [];
  const otherCollaboratorId = collaboratorIds.find((id) => id && id !== currentUserId);
  if (otherCollaboratorId) return `collaborate:${otherCollaboratorId}`;
  if (draft.assigneeId && draft.assigneeId !== currentUserId) return `assign:${draft.assigneeId}`;
  return "self";
}

function applyShareTarget(draft: TaskDraft, value: string, currentMember: MemberOption, members: MemberOption[]): TaskDraft {
  if (value === "self") {
    return { ...draft, assigneeId: currentMember.id, assigneeName: currentMember.name, collaboratorIds: [], collaboratorNames: [] };
  }

  const [mode, memberId] = value.split(":");
  const member = members.find((entry) => entry.id === memberId);
  const assigneeName = member?.name ?? memberId;
  if (mode === "collaborate") {
    return {
      ...draft,
      assigneeId: memberId,
      assigneeName,
      collaboratorIds: [currentMember.id, memberId],
      collaboratorNames: [currentMember.name, assigneeName]
    };
  }

  return { ...draft, assigneeId: memberId, assigneeName, collaboratorIds: [], collaboratorNames: [] };
}

function TaskRowsSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 8 }).map((_, index) => <div className="h-12 animate-pulse rounded-none bg-[#F7F5F5]" key={index} />)}
    </div>
  );
}
