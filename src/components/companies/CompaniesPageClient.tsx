"use client";

import { AlertTriangle, Archive, Bookmark, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Edit2, FileUp, Mail, MoreHorizontal, Phone, Plus, Search, Target, Trash2, UserRound, X } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { CompanyProjectsTab } from "@/components/projects/CompanyProjectsTab";
import { SkeletonList } from "@/components/ui/loading";
import { MultiSelect, SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { useCompanies } from "@/hooks/useCompanies";
import { activityTone, activityTypeLabels, monthKey } from "@/lib/company-utils";
import { activityTypeLabels as commonActivityTypeLabels } from "@/lib/lead-utils";
import { subscribeProductsMaster } from "@/lib/products";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import { createTask, deleteTask, setTaskCompleted } from "@/lib/tasks";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayNameById } from "@/lib/user-display";
import type { ActivityLogType, Company, CompanyActivityLog, CompanyContactPerson, ContactMethod } from "@/types/company";
import type { Product } from "@/types/product";
import type { Activity } from "@/types/lead";
import type { CalendarEvent } from "@/types/calendar";
import type { Task, TaskDraft } from "@/types/task";
import type { TeleapoRecord } from "@/types/teleapo";

type SortKey = "lastContact" | "updated" | "name";
type TabKey = "overview" | "timeline" | "projects" | "services" | "tasks" | "files" | "notes";
type NextActionDraft = { nextActionTitle: string };

const tabs: Array<[TabKey, string]> = [["overview", "概要"], ["timeline", "活動"], ["projects", "プロジェクト"], ["tasks", "タスク"], ["files", "ファイル"], ["services", "サービス"], ["notes", "メモ"]];
const sortOptions: Array<[SortKey, string]> = [["lastContact", "最終接触日が新しい順"], ["updated", "更新日が新しい順"], ["name", "会社名順"]];

const contactMethodOptions: Array<[ContactMethod, string]> = [["phone", "電話"], ["email", "メール"], ["chat", "チャット"]];
const companyStatusOptions: Array<[Company["status"], string]> = [["lead", "営業前"], ["prospect", "提案中"], ["customer", "運用中"], ["inactive", "停止中"], ["archived", "アーカイブ"]];

export function CompaniesPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const requestedTab = params.get("tab");
  const routeTab: TabKey = requestedTab === "deals" || requestedTab === "meetings" ? "timeline" : requestedTab === "access" ? "services" : tabs.some(([value]) => value === requestedTab) ? requestedTab as TabKey : "overview";
  const q = params.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [sort, setSort] = useState<SortKey>("lastContact");
  const [logLimit, setLogLimit] = useState(30);
  const store = useCompanies(selectedId, logLimit);
  const selectedTab = routeTab;
  const [createOpen, setCreateOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState<NextActionDraft>({ nextActionTitle: "" });
  const [nextActionSaving, setNextActionSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<{ uid: string; name: string; email: string }>>(DEFAULT_WORKSPACE_MEMBERS);
  const [products, setProducts] = useState<Product[]>([]);
  const [analysisRecords, setAnalysisRecords] = useState<TeleapoRecord[]>([]);

  useEffect(() => {
    if (!store.user) return undefined;
    let cancelled = false;
    void store.user.getIdToken()
      .then(async (token) => {
        const response = await fetch("/api/users/members", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("メンバーを取得できませんでした");
        return response.json() as Promise<{ members: Array<{ uid: string; name: string; email: string }> }>;
      })
      .then((data) => {
        if (!cancelled) setMembers(data.members.length ? data.members : DEFAULT_WORKSPACE_MEMBERS);
      })
      .catch(() => {
        if (!cancelled) setMembers(DEFAULT_WORKSPACE_MEMBERS);
      });
    return () => {
      cancelled = true;
    };
  }, [store.user]);

  useEffect(() => {
    if (!store.user) return undefined;
    return subscribeProductsMaster((nextProducts) => setProducts(nextProducts.filter((product) => product.status !== "archived")), () => setProducts([]));
  }, [store.user]);

  useEffect(() => {
    if (!store.user) return undefined;
    return subscribeTeleapoRecords(setAnalysisRecords, () => setAnalysisRecords([]));
  }, [store.user]);

  const setRoute = useCallback((next: { id?: string | null; tab?: TabKey; q?: string }) => {
    const search = new URLSearchParams(params.toString());
    if (next.id !== undefined) next.id ? search.set("id", next.id) : search.delete("id");
    if (next.tab) search.set("tab", next.tab);
    if (next.q !== undefined) next.q ? search.set("q", next.q) : search.delete("q");
    const nextPath = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
    const currentPath = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    if (nextPath === currentPath) return;
    router.replace(nextPath as Route, { scroll: false });
  }, [params, pathname, router]);

  const showCompanyList = useCallback(() => {
    const search = new URLSearchParams(params.toString());
    search.delete("id");
    search.delete("tab");
    const nextPath = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
    router.replace(nextPath as Route, { scroll: false });
  }, [params, pathname, router]);

  const selectDetailTab = useCallback((tab: TabKey) => {
    if (selectedId) setRoute({ id: selectedId, tab });
  }, [selectedId, setRoute]);

  useEffect(() => {
    if (query === q) return undefined;
    const timer = window.setTimeout(() => setRoute({ q: query }), 300);
    return () => window.clearTimeout(timer);
  }, [q, query, setRoute]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return store.companies
      .filter((company) => company.status !== "archived")
      .filter((company) => !needle || [company.name, company.nameKana, company.primaryContactName, company.contacts?.map((contact) => [contact.name, contact.role, contact.email, contact.phone, formatContactMethods(contact.contactMethods)].join(" ")).join(" "), company.address, company.phone, company.email, company.tags.join(" "), company.productNames?.join(" "), companyStatusLabel(company.status)].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ja");
        if (sort === "updated") return b.updatedAt.toMillis() - a.updatedAt.toMillis();
        return (b.lastContactAt?.toMillis() ?? 0) - (a.lastContactAt?.toMillis() ?? 0);
      });
  }, [q, sort, store.companies]);

  const selectedCompany = selectedId ? filtered.find((company) => company.id === selectedId) ?? null : null;

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  const openNextAction = () => {
    if (!selectedCompany) return;
    setNextActionDraft({
      nextActionTitle: selectedCompany.nextActionTitle ?? ""
    });
    setNextActionOpen(true);
  };

  const saveNextAction = async () => {
    if (!selectedCompany || !store.user) return;
    setNextActionSaving(true);
    try {
      const title = nextActionDraft.nextActionTitle.trim();
      await store.updateCompany(selectedCompany.id, {
        nextActionAt: null,
        nextActionTitle: title || null
      });
      setNextActionOpen(false);
      flash(title ? "次回予定を保存しました" : "次回予定を空欄にしました");
    } finally {
      setNextActionSaving(false);
    }
  };

  const toggleCompanyTask = async (task: Task) => {
    try { await setTaskCompleted(task, task.status !== "completed"); flash(task.status === "completed" ? "タスクを未完了に戻しました" : "タスクを完了しました"); }
    catch (error) { flash(error instanceof Error ? error.message : "タスクを更新できませんでした"); }
  };

  const deleteCompanyTask = async (task: Task) => {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
    try { await deleteTask(task.id); flash("タスクを削除しました"); }
    catch (error) { flash(error instanceof Error ? error.message : "タスクを削除できませんでした"); }
  };

  return (
    <div className="">
      {!selectedCompany ? (
        <PageHeader
          title="会社一覧"
          description="契約後の顧客状況、活動、サービスをまとめて確認します"
          actions={<button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-medium text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しい会社を追加</button>}
        />
      ) : null}
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className={selectedCompany ? "" : "mt-4"}><StatusBanner message={store.error} type="error" /></div>
      <div className={selectedCompany ? "mt-0" : "mt-5"}>
        {!selectedCompany ? (
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <label className="flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-medium text-[#777]">
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="会社名・サービス・状態で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Search className="h-4 w-4" />
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#6F676B]">{filtered.length}件の会社</p>
            <div className="w-48">
              <SingleSelect options={sortOptions.map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setSort(value as SortKey)} />
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[680px] grid-cols-[1.5fr_1.1fr_1fr_110px] gap-4 border-b border-[#F0E7E9] px-3 py-3 text-xs font-medium text-[#8A8186]">
              <span>会社</span><span>利用サービス</span><span>最終接触</span><span>次回予定</span>
            </div>
            {store.loading ? <CompanySkeleton /> : null}
            {!store.loading && filtered.length === 0 ? <EmptyCompanies hasQuery={Boolean(q)} onCreate={() => setCreateOpen(true)} /> : null}
            {filtered.map((company) => <CompanyListItem active={false} company={company} favorite={company.favoriteUserIds.includes(store.user?.uid ?? "")} key={company.id} onFavorite={() => void store.toggleFavorite(company)} onSelect={() => setRoute({ id: company.id, tab: "overview" })} />)}
          </div>
        </section>
        ) : (
        <section className="min-w-0">
            <div className="space-y-5">
              <CompanyDetailHeader company={selectedCompany} canDelete={store.isAdmin} favorite={selectedCompany.favoriteUserIds.includes(store.user?.uid ?? "")} onDelete={() => { void store.deleteCompany(selectedCompany.id); showCompanyList(); }} onEdit={() => setEditCompany(selectedCompany)} onFavorite={() => void store.toggleFavorite(selectedCompany)} onLog={() => setLogOpen(true)} onStatusChange={async (status) => { await store.updateCompany(selectedCompany.id, { status }); flash("ステータスを更新しました"); }} />
              <CompanySummaryCards company={selectedCompany} tasks={store.tasks} />
              <CompanyDetailTabs selectedTab={selectedTab} onSelect={selectDetailTab} />
              <div className={selectedTab === "overview" ? "" : "rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"}>
                  {selectedTab === "overview" ? <OverviewTab company={selectedCompany} calendarEvents={store.calendarEvents} now={store.now} commonActivities={store.commonActivities} logs={store.logs} records={analysisRecords} tasks={store.tasks} onActivity={() => selectDetailTab("timeline")} onEdit={() => setEditCompany(selectedCompany)} onLog={() => setLogOpen(true)} onNextAction={openNextAction} onCreateTask={async (title) => { await createTask(companyTaskDraft(selectedCompany, title, store.currentUser.id, store.currentUser.name), { id: store.currentUser.id, uid: store.currentUser.id, name: store.currentUser.name }); flash("タスクを追加しました"); }} onToggleTask={toggleCompanyTask} onDeleteTask={deleteCompanyTask} /> : null}
                  {selectedTab === "timeline" ? <TimelineTab calendarEvents={store.calendarEvents} now={store.now} commonActivities={store.commonActivities} hasMore={store.hasMoreLogs} logs={store.logs} records={analysisRecords} company={selectedCompany} onMore={() => setLogLimit((current) => current + 30)} /> : null}
                  {selectedTab === "projects" ? <CompanyProjectsTab companyId={selectedCompany.id} companyName={selectedCompany.name} tasks={store.tasks} /> : null}
                  {selectedTab === "services" ? <ServicesTab company={selectedCompany} products={products} user={store.user} /> : null}
                  {selectedTab === "tasks" ? <TasksTab tasks={store.tasks} onToggle={toggleCompanyTask} onDelete={deleteCompanyTask} /> : null}
                  {selectedTab === "files" ? <FilesTab files={store.files} onUpload={(file, onProgress) => store.uploadFile(selectedCompany.id, file, onProgress)} /> : null}
                  {selectedTab === "notes" ? <NotesTab commonActivities={store.commonActivities} currentUserId={store.user?.uid ?? ""} isAdmin={store.isAdmin} logs={store.logs} memos={store.memos} onCreate={() => setMemoOpen(true)} onDelete={async (memoId) => { await store.deleteMemo(selectedCompany.id, memoId); flash("メモを削除しました"); }} onMore={() => setLogLimit((current) => current + 30)} onUpdate={async (memoId, input) => { await store.updateMemo(selectedCompany.id, memoId, input); flash("メモを更新しました"); }} /> : null}
              </div>
            </div>
        </section>
        )}
      </div>
      {createOpen ? <CompanyFormModal mode="create" products={products} onClose={() => setCreateOpen(false)} onSubmit={async (patch) => { const id = await store.createCompany(patch); setCreateOpen(false); flash("会社を作成しました"); setRoute({ id, tab: "overview" }); }} /> : null}
      {editCompany ? <CompanyFormModal company={editCompany} mode="edit" products={products} onClose={() => setEditCompany(null)} onSubmit={async (patch) => { await store.updateCompany(editCompany.id, patch); setEditCompany(null); flash("会社情報を更新しました"); }} /> : null}
      {selectedCompany && logOpen ? <LogFormModal company={selectedCompany} currentUser={store.currentUser} existingTasks={store.tasks} members={members} onClose={() => setLogOpen(false)} onSubmit={async (input, generateTasks) => { await store.addLog(selectedCompany.id, input); setLogOpen(false); flash("ログを追加しました"); if (generateTasks) await createSuggestedTasks(selectedCompany, input, store.currentUser); }} /> : null}
      {selectedCompany && memoOpen ? <MemoFormModal onClose={() => setMemoOpen(false)} onSubmit={async (input) => { await store.addMemo(selectedCompany.id, input); setMemoOpen(false); flash("メモを追加しました"); }} /> : null}
      {selectedCompany && nextActionOpen ? <NextActionModal draft={nextActionDraft} saving={nextActionSaving} onChange={setNextActionDraft} onClose={() => setNextActionOpen(false)} onSave={saveNextAction} /> : null}
    </div>
  );
}

function CompanyListItem({ company, active, favorite, onSelect, onFavorite }: { company: Company; active: boolean; favorite: boolean; onSelect: () => void; onFavorite: () => void }) {
  return <button className={`grid min-w-[680px] w-full grid-cols-[1.5fr_1.1fr_1fr_110px] items-center gap-4 border-b border-[#F0E7E9] px-3 py-4 text-left transition ${active ? "bg-[#FFF0F3]" : "bg-white hover:bg-[#FFFBFC]"}`} onClick={onSelect} type="button">
    <span className="flex min-w-0 items-center gap-2">
      <Bookmark className={`h-4 w-4 shrink-0 text-[#EC6F8B] ${favorite ? "fill-current" : ""}`} onClick={(event) => { event.stopPropagation(); onFavorite(); }} />
      <span className="min-w-0 truncate font-medium text-[#2B2B2B]">{company.name}</span>
    </span>
    <span className="truncate text-sm font-semibold text-[#655D62]">{company.productNames?.join(" / ") || "未設定"}</span>
    <span className="text-sm font-semibold text-[#655D62]">{company.lastContactAt ? relativeDate(company.lastContactAt.toDate()) : "未接触"}</span>
    <span className={`truncate text-sm font-medium ${company.nextActionTitle ? "text-[#655D62]" : "text-[#D94F6E]"}`}>{company.nextActionTitle || "未設定 ⚠"}</span>
  </button>;
}

function CompanyDetailHeader({ company, favorite, canDelete, onFavorite, onEdit, onLog, onDelete, onStatusChange }: { company: Company; favorite: boolean; canDelete: boolean; onFavorite: () => void; onEdit: () => void; onLog: () => void; onDelete: () => void; onStatusChange: (status: Company["status"]) => Promise<void> }) {
  const [menu, setMenu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const changeStatus = async (status: Company["status"]) => {
    if (status === company.status) return;
    setUpdatingStatus(true);
    try {
      await onStatusChange(status);
    } finally {
      setUpdatingStatus(false);
    }
  };
  return (
    <section className="bg-white/80 px-4 pb-3 pt-1 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 pr-0 xl:pr-8">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="break-words text-xl font-medium tracking-normal text-[#111827]">{company.name}</h2>
            <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#EC6F8B] hover:bg-[#FFF0F3]" onClick={onFavorite} type="button" aria-label="お気に入り"><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-[#4B5563]">
            <StatusSelect disabled={updatingStatus} status={company.status} onChange={(status) => void changeStatus(status)} />
            <span>最終接触：{company.lastContactAt ? relativeDate(company.lastContactAt.toDate()) : "未接触"}</span>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2 xl:justify-end">
          {company.email ? <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151]" href={`mailto:${company.email}`}><Mail className="h-4 w-4" />メール</a> : null}
          {company.phone ? <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151]" href={`tel:${company.phone}`}><Phone className="h-4 w-4" />電話</a> : null}
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white shadow-[0_8px_18px_rgba(236,111,139,0.2)]" onClick={onLog} type="button"><Plus className="h-4 w-4" />活動を追加</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151]" onClick={onEdit} type="button"><Edit2 className="h-4 w-4" />編集</button>
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#374151]" onClick={() => setMenu((current) => !current)} type="button" aria-label="その他"><MoreHorizontal className="h-5 w-5" /></button>
          {menu ? <div className="absolute right-0 top-12 z-10 grid w-40 gap-1 rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-lg"><button className="h-9 rounded-md px-2 text-left text-sm font-semibold text-[#374151] hover:bg-[#F9FAFB]" onClick={() => void navigator.clipboard.writeText(window.location.href)} type="button">URLをコピー</button><button className="h-9 rounded-md px-2 text-left text-sm font-semibold text-[#374151] hover:bg-[#F9FAFB]" type="button"><Archive className="mr-2 inline h-4 w-4" />アーカイブ</button>{canDelete ? <button className="h-9 rounded-md px-2 text-left text-sm font-semibold text-[#D94F6E] hover:bg-[#FFF0F3]" onClick={() => window.confirm("会社を削除しますか？") && onDelete()} type="button"><Trash2 className="mr-2 inline h-4 w-4" />削除</button> : null}</div> : null}
        </div>
      </div>
    </section>
  );
}

function StatusSelect({ status, disabled, onChange }: { status: Company["status"]; disabled: boolean; onChange: (status: Company["status"]) => void }) {
  return (
    <label className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium ${companyStatusClass(status)}`}>
      <span>ステータス</span>
      <select className="bg-transparent text-xs font-medium outline-none" disabled={disabled} value={status} onChange={(event) => onChange(event.target.value as Company["status"])}>
        {companyStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function CompanySummaryCards({ company, tasks }: { company: Company; tasks: Array<{ status: string; dueDate?: { toDate: () => Date } | null; title: string }> }) {
  const openTasks = sortedOpenTasks(tasks);
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><SummaryCard icon={<Target className="h-5 w-5" />} label="ステータス" value={companyStatusLabel(company.status)} tone="yellow" /><SummaryCard icon={<UserRound className="h-5 w-5" />} label="最終接触" value={company.lastContactAt ? relativeDate(company.lastContactAt.toDate()) : "未接触"} /><SummaryCard icon={<CalendarDays className="h-5 w-5" />} label="次回予定" value={company.nextActionTitle || "未設定"} tone="pink" /><SummaryCard icon={<CheckCircle2 className="h-5 w-5" />} label="未完了タスク" value={`${openTasks.length}件`} tone="green" /></div>;
}

function SummaryCard({ icon, label, value, tone = "gray" }: { icon: React.ReactNode; label: string; value: string; tone?: "gray" | "yellow" | "pink" | "green" }) {
  const toneClass = tone === "yellow" ? "bg-[#FFF8E6] text-[#B7791F]" : tone === "pink" ? "bg-[#FFF0F3] text-[#EC6F8B]" : tone === "green" ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#F3F4F6] text-[#6B7280]";
  return <section className="flex min-h-24 items-center gap-4 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${toneClass}`}>{icon}</span><div className="min-w-0"><p className="text-xs font-semibold text-[#6B7280]">{label}</p><p className="mt-1 truncate text-base font-medium text-[#111827]">{value}</p></div></section>;
}

function CompanyDetailTabs({ selectedTab, onSelect }: { selectedTab: TabKey; onSelect: (tab: TabKey) => void }) {
  return <nav className="flex gap-6 overflow-x-auto border-b border-[#E5E7EB]" aria-label="会社詳細タブ">{tabs.map(([value, label]) => <button className={`h-12 shrink-0 border-b-2 text-sm font-medium transition ${selectedTab === value ? "border-[#EC6F8B] text-[#EC6F8B]" : "border-transparent text-[#111827] hover:text-[#EC6F8B]"}`} key={value} onClick={() => onSelect(value)} type="button">{label}</button>)}</nav>;
}

function OverviewTab({ company, tasks, calendarEvents, now, commonActivities, logs, records, onActivity, onEdit, onLog, onNextAction, onCreateTask, onToggleTask, onDeleteTask }: { company: Company; tasks: Task[]; calendarEvents: CalendarEvent[]; now: number; commonActivities: Activity[]; logs: CompanyActivityLog[]; records: TeleapoRecord[]; onActivity: () => void; onEdit: () => void; onLog: () => void; onNextAction: () => void; onCreateTask: (title: string) => Promise<void>; onToggleTask: (task: Task) => Promise<void>; onDeleteTask: (task: Task) => Promise<void> }) {
  const commonLegacyIds = new Set(commonActivities.map((item) => item.legacyCompanyActivityLogId).filter(Boolean));
  const recent = [
    ...calendarEvents.filter((event) => (event.endAt ?? event.startAt).toMillis() <= now).map((event) => ({ id: `c-${event.id}`, date: event.startAt.toDate(), type: "カレンダー", title: event.title, content: event.description ?? "" })),
    ...commonActivities.filter((item) => item.type !== "note").map((item) => ({ id: `a-${item.id}`, date: item.occurredAt.toDate(), type: commonActivityTypeLabels[item.type], title: item.title, content: item.content })),
    ...logs.filter((item) => item.type !== "memo" && !commonLegacyIds.has(item.id)).map((item) => ({ id: `l-${item.id}`, date: item.occurredAt.toDate(), type: activityTypeLabels[item.type], title: item.title, content: item.content })),
    ...records.filter((item) => item.companyId === company.id || (!item.companyId && item.customerName === company.name)).map((item) => ({ id: `r-${item.id}`, date: item.recordedAt.toDate(), type: item.salesDomain === "teleapo" ? "テレアポ" : "商談", title: item.meetingTitle || item.productName || "音声分析", content: item.aiAdvice?.summary || "" }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-5">
      <DetailCard action={<button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#374151]" onClick={onEdit} type="button"><Edit2 className="h-4 w-4" />編集</button>} title="会社情報">
        <InfoGrid compact rows={[["状態", companyStatusLabel(company.status)], ["最終接触", company.lastContactAt ? company.lastContactAt.toDate().toLocaleDateString("ja-JP") : "未接触"], ["次回予定", company.nextActionTitle || "未設定"]]} />
      </DetailCard>
      <DetailCard action={<button className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#374151]" onClick={onActivity} type="button">すべての活動を見る</button>} title="最近の活動">
        {recent.length ? <div className="space-y-4">{recent.map((item) => <div className="grid gap-3 border-b border-[#F3F4F6] pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[80px_92px_minmax(0,1fr)]" key={item.id}><time className="text-xs font-semibold text-[#6B7280]">{item.date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</time><span className="inline-flex h-7 w-fit items-center rounded-full bg-[#FFF0F3] px-3 text-xs font-medium text-[#EC6F8B]">{item.type}</span><span className="min-w-0"><strong className="block text-sm font-medium text-[#111827]">{item.title}</strong>{item.content ? <span className="mt-1 line-clamp-2 block text-sm font-medium leading-6 text-[#6B7280]">{item.content}</span> : null}</span></div>)}</div> : <div className="grid min-h-48 place-items-center text-center"><div><Clock3 className="mx-auto h-9 w-9 text-[#C7CBD1]" /><p className="mt-3 text-sm font-medium text-[#111827]">活動履歴はまだありません</p><p className="mt-1 text-sm font-medium text-[#6B7280]">最初の活動を登録して、顧客との関係を記録しましょう。</p><button className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={onLog} type="button"><Plus className="h-4 w-4" />活動を追加</button></div></div>}
      </DetailCard>
    </div>
    <aside className="space-y-4">
      <SideCard icon={<CalendarDays className="h-5 w-5" />} title="次回予定">{company.nextActionTitle ? <InfoPair label="内容" value={company.nextActionTitle} /> : <div className="rounded-lg bg-[#FFF0F3] p-4"><p className="flex items-center gap-2 text-sm font-medium text-[#9F1239]"><AlertTriangle className="h-4 w-4" />次回予定が設定されていません</p><p className="mt-2 text-sm font-medium text-[#6B4B55]">次回の予定はカレンダーか、ここから登録できます。</p></div>}<button className="mt-4 h-10 w-full rounded-lg border border-[#F7CAD2] bg-white text-sm font-medium text-[#EC6F8B]" onClick={onNextAction} type="button">＋ 次回予定を設定</button></SideCard>
      <QuickTaskCard key={company.id} tasks={tasks} onCreate={onCreateTask} onToggle={onToggleTask} onDelete={onDeleteTask} />
    </aside>
  </div>;
}

function QuickTaskCard({ tasks, onCreate, onToggle, onDelete }: { tasks: Task[]; onCreate: (title: string) => Promise<void>; onToggle: (task: Task) => Promise<void>; onDelete: (task: Task) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate(title.trim());
      setTitle("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "タスクを追加できませんでした。");
    } finally {
      setSaving(false);
    }
  };
  return <SideCard icon={<CheckCircle2 className="h-5 w-5" />} title="タスク">
    <div className="flex gap-2">
      <input aria-label="タスク内容" className="min-w-0 flex-1 rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#EC6F8B]" placeholder="タスクを入力" value={title} onChange={(event) => setTitle(event.target.value)} />
      <button className="h-10 shrink-0 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !title.trim()} onClick={() => void save()} type="button">{saving ? "保存中" : "追加"}</button>
    </div>
    {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
    {tasks.length ? <div className="mt-4 space-y-2">{tasks.slice(0, 5).map((task) => <CompanyTaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}</div> : <p className="mt-4 text-sm text-[#6B7280]">タスクはありません。</p>}
  </SideCard>;
}

function CompanyTaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: (task: Task) => Promise<void>; onDelete: (task: Task) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => { setBusy(true); try { await operation(); } finally { setBusy(false); } };
  return <div className="flex items-center gap-2 rounded-lg border border-[#F0E7E9] px-2 py-1.5">
    <button aria-label={task.status === "completed" ? "未完了に戻す" : "完了にする"} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#EC6F8B] hover:bg-[#FFF0F3] disabled:opacity-50" disabled={busy} onClick={() => void run(() => onToggle(task))} type="button">{task.status === "completed" ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-[#BCAFB5]" />}</button>
    <span className={`min-w-0 flex-1 break-words text-sm ${task.status === "completed" ? "text-[#9A9296] line-through" : "text-[#374151]"}`}>{task.title}</span>
    <button aria-label="タスクを削除" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#A0969B] hover:bg-red-50 hover:text-[#D94F6E] disabled:opacity-50" disabled={busy} onClick={() => void run(() => onDelete(task))} type="button"><Trash2 className="h-4 w-4" /></button>
  </div>;
}

function DetailCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-medium text-[#111827]">{title}</h3>{action}</div>{children}</section>;
}

function SideCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#FFF0F3] text-[#EC6F8B]">{icon}</span><h3 className="text-base font-medium text-[#111827]">{title}</h3></div>{children}</section>;
}

type UnifiedCompanyTimelineItem =
  | { id: string; occurredAt: Timestamp; kind: "legacy"; log: CompanyActivityLog }
  | { id: string; occurredAt: Timestamp; kind: "common"; activity: Activity }
  | { id: string; occurredAt: Timestamp; kind: "calendar"; event: CalendarEvent }
  | { id: string; occurredAt: Timestamp; kind: "analysis"; record: TeleapoRecord };

function TimelineTab({ logs, calendarEvents, now, commonActivities, records, company, hasMore, onMore }: { logs: CompanyActivityLog[]; calendarEvents: CalendarEvent[]; now: number; commonActivities: Activity[]; records: TeleapoRecord[]; company: Company; hasMore: boolean; onMore: () => void }) {
  const commonLegacyIds = new Set(commonActivities.map((activity) => activity.legacyCompanyActivityLogId).filter(Boolean));
  const legacyItems: UnifiedCompanyTimelineItem[] = logs
    .filter((log) => log.source !== "system" && log.type !== "status_change" && log.type !== "memo" && !commonLegacyIds.has(log.id))
    .map((log) => ({ id: `legacy-${log.id}`, occurredAt: log.occurredAt, kind: "legacy", log }));
  const commonItems: UnifiedCompanyTimelineItem[] = commonActivities.filter((activity) => activity.type !== "note").map((activity) => ({ id: `common-${activity.id}`, occurredAt: activity.occurredAt, kind: "common", activity }));
  const calendarItems: UnifiedCompanyTimelineItem[] = calendarEvents.filter((event) => (event.endAt ?? event.startAt).toMillis() <= now).map((event) => ({ id: `calendar-${event.id}`, occurredAt: event.startAt, kind: "calendar", event }));
  const analysisItems: UnifiedCompanyTimelineItem[] = records
    .filter((record) => record.companyId === company.id || (!record.companyId && record.customerName === company.name))
    .map((record) => ({ id: `analysis-${record.id}`, occurredAt: record.recordedAt, kind: "analysis", record }));
  const timelineItems = [...legacyItems, ...commonItems, ...calendarItems, ...analysisItems].sort((left, right) => right.occurredAt.toMillis() - left.occurredAt.toMillis());
  const groups = groupUnifiedByMonth(timelineItems);

  return (
    <div>
      {timelineItems.length === 0 ? <ActivityLogEmptyCard description="電話、メール、訪問、テレアポ、商談分析などの履歴を追加すると、ここに時系列で表示されます。" title="まだ活動ログがありません" /> : (
      <div className="space-y-8">
        {Object.entries(groups).map(([month, items]) => (
          <section key={month}>
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-[#655D62]">{month}</h3>
              <span className="h-px flex-1 bg-[#F0E7E9]" />
              <span className="text-xs font-medium text-[#A0979B]">{items.length}件</span>
            </div>
            <div className="relative pl-9">
              <span className="absolute bottom-4 left-3 top-3 w-px bg-[#F0E7E9]" />
              <div className="grid gap-4">
                {items.map((item) => {
                  if (item.kind === "common") return <CommonActivityTimelineItem activity={item.activity} key={item.id} />;
                  if (item.kind === "calendar") return <CalendarActivityTimelineItem event={item.event} key={item.id} />;
                  if (item.kind === "analysis") return <AnalysisTimelineItem key={item.id} record={item.record} />;
                  return <ActivityTimelineItem key={item.id} log={item.log} />;
                })}
              </div>
            </div>
          </section>
        ))}
      </div>
      )}
      {hasMore ? <button className="mt-5 h-11 w-full rounded-none border border-[#F0E7E9] text-sm font-medium text-[#EC6F8B]" onClick={onMore} type="button">さらに過去の履歴を表示</button> : null}
    </div>
  );
}

function CalendarActivityTimelineItem({ event }: { event: CalendarEvent }) {
  return <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
    <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-semibold text-[#EC6F8B]">予</span>
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-medium text-[#EC6F8B]">カレンダー</span><time className="text-xs font-medium text-[#8A8186]">{event.startAt.toDate().toLocaleDateString("ja-JP")}</time></div>
    <h3 className="mt-2 text-base font-semibold text-[#2B2B2B]">{event.title}</h3>
    {event.description ? <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#2B2B2B]">{event.description}</p> : null}
  </article>;
}

function CommonActivityTimelineItem({ activity }: { activity: Activity }) {
  const occurredAt = activity.occurredAt.toDate();
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-semibold text-[#EC6F8B]">{commonActivityTypeLabels[activity.type]?.slice(0, 1) ?? "・"}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-medium text-[#EC6F8B]">{commonActivityTypeLabels[activity.type]}</span>
        <span className="text-xs font-medium text-[#8A8186]">{occurredAt.toLocaleDateString("ja-JP")}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-[#2B2B2B]">{activity.title || commonActivityTypeLabels[activity.type]}</h3>
      {activity.content ? <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#2B2B2B]">{activity.content}</p> : null}
      {activity.nextActionTitle ? <p className="mt-3 text-sm font-medium text-[#D94F6E]">次回予定: {activity.nextActionTitle}</p> : null}
    </article>
  );
}

function AnalysisTimelineItem({ record }: { record: TeleapoRecord }) {
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-semibold text-[#EC6F8B]">分</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-medium text-[#EC6F8B]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
        <span className="text-xs font-medium text-[#8A8186]">{record.recordedAt.toDate().toLocaleDateString("ja-JP")}</span>
        {record.audioDownloadUrl ? <span className="rounded-none bg-white px-2 py-1 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9]">音声あり</span> : null}
        {record.aiAdvice ? <span className="rounded-none bg-white px-2 py-1 text-xs font-medium text-[#6F676B] ring-1 ring-[#F0E7E9]">AI分析あり</span> : null}
      </div>
      <h3 className="mt-2 text-base font-semibold text-[#2B2B2B]">{record.meetingTitle || record.productName || "分析データ"}</h3>
      {record.audioDownloadUrl ? <audio className="mt-3 w-full" controls src={record.audioDownloadUrl} /> : null}
      {record.aiAdvice?.summary ? <p className="mt-3 whitespace-pre-wrap text-sm text-[#6F676B]">{record.aiAdvice.summary}</p> : null}
    </article>
  );
}

function ActivityTimelineItem({ log }: { log: CompanyActivityLog }) {
  const occurredAt = log.occurredAt.toDate();
  const date = occurredAt.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-semibold text-[#EC6F8B]">{activityTypeLabels[log.type]?.slice(0, 1) ?? "・"}</span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-none px-3 py-1 text-xs font-medium ${activityTone(log.type)}`}>{activityTypeLabels[log.type]}</span>
            <span className="text-xs font-medium text-[#8A8186]">{date}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-[#2B2B2B]">{log.title || "無題のログ"}</h3>
        </div>
        {log.nextAction?.title ? <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-medium text-[#D94F6E]">次アクションあり</span> : null}
      </div>
      <dl className="mt-3 grid gap-2 text-sm font-semibold text-[#6F676B]">
        <div className="grid gap-1 md:grid-cols-[120px_1fr]"><dt className="font-medium text-[#8A8186]">対応者・相手先</dt><dd>{formatActivityParties(log)}</dd></div>
      </dl>
      <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#2B2B2B]">{log.content || "内容は未登録です。"}</p>
      {log.nextAction?.title ? (
        <div className="mt-3 border-l-2 border-[#EC6F8B] bg-[#FFF7F8] px-3 py-2">
          <p className="text-xs font-semibold text-[#D94F6E]">次のアクション</p>
          <p className="mt-1 text-sm font-medium text-[#2B2B2B]">{log.nextAction.title}</p>
          <p className="mt-1 text-xs font-semibold text-[#8A8A8A]">{log.nextAction.dueAt?.toDate().toLocaleDateString("ja-JP") ?? "期限未設定"}</p>
        </div>
      ) : null}
    </article>
  );
}

function ActivityLogEmptyCard({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <section className={`rounded-none border border-[#F0E7E9] bg-[#FFFBFC] ${compact ? "p-6" : "mb-5 p-8"}`}>
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="grid h-12 w-12 place-items-center rounded-none bg-white text-[#EC6F8B] shadow-sm">
          <Mail className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-base font-medium text-[#2B2B2B]">{title}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#8A8186]">{description}</p>
      </div>
    </section>
  );
}

function TasksTab({ tasks, onToggle, onDelete }: { tasks: Task[]; onToggle: (task: Task) => Promise<void>; onDelete: (task: Task) => Promise<void> }) {
  return <div className="space-y-3">{tasks.length === 0 ? <p className="text-sm font-medium text-[#8A8A8A]">会社に紐づくタスクはありません。</p> : tasks.map((task) => <CompanyTaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}</div>;
}

type AuthTokenUser = { getIdToken: () => Promise<string> } | null;
type CompanyServiceValue = { id: string; productId: string | null; serviceName: string; accountName: string; status: string; startedAt: string | null; endedAt: string | null; price: number | null; billingCycle: string; ownerUserId: string | null; ownerUserName: string | null; adminUrl: string | null; productionUrl: string | null; repositoryUrl: string | null; hosting: string | null; domain: string | null; maintenanceStatus: string | null; renewedAt: string | null; memo: string };

type CredentialValue = { id: string; serviceId: string | null; label: string; url: string | null; username: string };

function ServicesTab({ company, products, user }: { company: Company; products: Product[]; user: AuthTokenUser }) {
  const empty = { serviceName: "", accountName: "", secret: "", productId: "", status: "active", startedAt: "", endedAt: "", price: "", billingCycle: "monthly", ownerUserId: "", ownerUserName: "", adminUrl: "", productionUrl: "", repositoryUrl: "", hosting: "", domain: "", maintenanceStatus: "", renewedAt: "", memo: "" };
  const [services, setServices] = useState<CompanyServiceValue[]>([]);
  const [credentials, setCredentials] = useState<CredentialValue[]>([]);
  const [form, setForm] = useState(empty);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [accessFieldsOpen, setAccessFieldsOpen] = useState(false);
  const [formSecretVisible, setFormSecretVisible] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [expandedServices, setExpandedServices] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [serviceData, credentialData] = await Promise.all([
        companyApi<{ services: CompanyServiceValue[] }>(user, `/api/companies/${company.id}/services`),
        companyApi<{ credentials: CredentialValue[] }>(user, `/api/companies/${company.id}/credentials`)
      ]);
      setServices(serviceData.services); setCredentials(credentialData.credentials); setError(null);
    } catch (next) { setError(errorMessage(next)); }
  }, [company.id, user]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const credentialFor = (service: CompanyServiceValue) => credentials.find((item) => item.serviceId === service.id) ?? credentials.find((item) => !item.serviceId && item.label === service.serviceName);
  const reset = () => { setForm(empty); setEditingId(null); setEditingCredentialId(null); setAccessFieldsOpen(false); setFormSecretVisible(false); setFormOpen(false); };
  const save = async () => {
    if (!form.serviceName.trim() || !user) return;
    setSaving(true);
    try {
      const payload = { ...form, accountName: form.accountName.trim(), price: form.price ? Number(form.price) : null };
      const result = await companyApi<{ id: string }>(user, `/api/companies/${company.id}/services${editingId ? `/${editingId}` : ""}`, editingId ? "PATCH" : "POST", payload);
      const serviceId = editingId ?? result.id;
      const credentialPayload = { serviceId, serviceType: "other", label: form.serviceName.trim(), url: form.productionUrl || null, username: form.accountName.trim(), secret: form.secret };
      if (editingCredentialId) await companyApi(user, `/api/companies/${company.id}/credentials/${editingCredentialId}`, "PATCH", credentialPayload);
      else if (form.secret) await companyApi(user, `/api/companies/${company.id}/credentials`, "POST", credentialPayload);
      reset(); await load();
    } catch (next) { setError(errorMessage(next)); }
    finally { setSaving(false); }
  };
  const edit = (service: CompanyServiceValue) => {
    const credential = credentialFor(service);
    setEditingId(service.id); setEditingCredentialId(credential?.id ?? null); setAccessFieldsOpen(Boolean(service.accountName || credential)); setFormSecretVisible(false); setFormOpen(true);
    setForm({ serviceName: service.serviceName, accountName: service.accountName || credential?.username || "", secret: "", productId: service.productId ?? "", status: service.status, startedAt: dateInput(service.startedAt), endedAt: dateInput(service.endedAt), price: service.price?.toString() ?? "", billingCycle: service.billingCycle, ownerUserId: service.ownerUserId ?? "", ownerUserName: service.ownerUserName ?? "", adminUrl: service.adminUrl ?? "", productionUrl: service.productionUrl ?? credential?.url ?? "", repositoryUrl: service.repositoryUrl ?? "", hosting: service.hosting ?? "", domain: service.domain ?? "", maintenanceStatus: service.maintenanceStatus ?? "", renewedAt: dateInput(service.renewedAt), memo: service.memo ?? "" });
  };
  const remove = async (service: CompanyServiceValue) => {
    if (!user || !window.confirm(`「${service.serviceName}」を削除しますか？`)) return;
    try {
      const credential = credentialFor(service);
      if (credential && !credential.serviceId) await companyApi(user, `/api/companies/${company.id}/credentials/${credential.id}`, "DELETE");
      await companyApi(user, `/api/companies/${company.id}/services/${service.id}`, "DELETE"); await load();
    } catch (next) { setError(errorMessage(next)); }
  };
  const accessSecret = async (credential: CredentialValue, action: "reveal" | "copy") => {
    if (!user) return;
    try {
      const data = await companyApi<{ secret: string }>(user, `/api/companies/${company.id}/credentials/${credential.id}/secret?action=${action}`);
      if (action === "copy") await navigator.clipboard.writeText(data.secret);
      else { setRevealed((current) => ({ ...current, [credential.id]: data.secret })); window.setTimeout(() => setRevealed((current) => { const next = { ...current }; delete next[credential.id]; return next; }), 30_000); }
    } catch (next) { setError(errorMessage(next)); }
  };
  const showCurrentSecretInForm = async () => {
    if (!user || !editingCredentialId) return;
    try {
      const data = await companyApi<{ secret: string }>(user, `/api/companies/${company.id}/credentials/${editingCredentialId}/secret?action=reveal`);
      setForm((current) => ({ ...current, secret: data.secret })); setFormSecretVisible(true);
    } catch (next) { setError(errorMessage(next)); }
  };
  return <div className="w-full space-y-4">
    <StatusBanner message={error} type="error" />
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-[#6B7280]">利用中のサービス、URL、料金などを管理</p>{!formOpen ? <button className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#EC6F8B] px-3.5 text-sm font-medium text-white" onClick={() => { reset(); setFormOpen(true); }} type="button"><Plus className="h-4 w-4" />追加</button> : null}</div>
    {formOpen ? <section className="rounded-lg border border-[#E5E7EB] bg-[#FFFBFC] p-4"><h4 className="font-semibold text-[#2B2B2B]">{editingId ? "サービスを編集" : "サービスを追加"}</h4><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="grid gap-2 text-sm font-semibold text-[#655D62]"><span>名称 <span className="text-[#EC6F8B]">*</span></span><input className="task-input border-[#E5E7EB] bg-white" list="company-service-options" placeholder="例：Instagram、公式サイト" value={form.serviceName} onChange={(event) => { const serviceName = event.target.value; const product = products.find((item) => item.name === serviceName); setForm({ ...form, serviceName, productId: product?.id ?? "" }); }} /><datalist id="company-service-options">{products.map((item) => <option key={item.id} value={item.name} />)}</datalist></label></div>
      <div className="sm:col-span-2"><Input label="URL" type="url" placeholder="https://" value={form.productionUrl} onChange={(productionUrl) => setForm({ ...form, productionUrl })} /></div>
      <div className="sm:col-span-2">{accessFieldsOpen ? <div className="grid gap-3 rounded-lg border border-[#E5E7EB] bg-white p-3 sm:grid-cols-2"><Input label="アカウント名・ログインID" placeholder="メールアドレスやユーザー名" value={form.accountName} onChange={(accountName) => setForm({ ...form, accountName })} /><label className="grid gap-2 text-sm font-semibold text-[#655D62]"><span>{editingCredentialId ? "パスワード" : "パスワード（任意）"}</span><span className="flex"><input className="task-input min-w-0 flex-1 rounded-r-none border-[#E5E7EB] bg-white" type={formSecretVisible ? "text" : "password"} value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} /><button className="shrink-0 rounded-r-lg border border-l-0 border-[#E5E7EB] bg-white px-3 text-xs text-[#EC6F8B]" onClick={() => setFormSecretVisible((current) => !current)} type="button">{formSecretVisible ? "隠す" : "表示"}</button></span>{editingCredentialId && !form.secret ? <button className="w-fit text-xs font-medium text-[#EC6F8B]" onClick={() => void showCurrentSecretInForm()} type="button">保存済みパスワードを表示</button> : null}</label></div> : <button className="text-sm font-medium text-[#EC6F8B]" onClick={() => setAccessFieldsOpen(true)} type="button"><Plus className="mr-1 inline h-4 w-4" />ログイン情報がある場合のみ追加</button>}</div>
      <Input label="料金" type="number" placeholder="例：10000" value={form.price} onChange={(price) => setForm({ ...form, price })} />
      <Select label="料金の単位" value={form.billingCycle} options={[["monthly", "月額"], ["yearly", "年額"], ["one_time", "一括"], ["other", "その他"]]} onChange={(billingCycle) => setForm({ ...form, billingCycle })} />
      <Select label="状態" value={form.status} options={[["active", "利用中"], ["paused", "一時停止"], ["ended", "終了"]]} onChange={(status) => setForm({ ...form, status })} />
      <Input label="メモ" placeholder="管理内容や補足" value={form.memo} onChange={(memo) => setForm({ ...form, memo })} />
    </div><div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm" onClick={reset} type="button">キャンセル</button><button className="h-9 rounded-lg bg-[#EC6F8B] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !form.serviceName.trim()} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存"}</button></div></section> : null}
    {services.length ? <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white"><div className="grid min-w-[720px] grid-cols-[minmax(180px,1.4fr)_120px_minmax(120px,.8fr)_minmax(150px,1fr)_120px] gap-4 border-b border-[#E5E7EB] bg-[#FAFAFA] px-4 py-3 text-xs font-medium text-[#8A8186]"><span>サービス</span><span>状態</span><span>URL</span><span>料金</span><span className="text-right">操作</span></div>{services.map((service) => { const credential = credentialFor(service); const expanded = expandedServices.has(service.id); const hasDetails = Boolean(service.accountName || credential?.username || credential || service.memo); return <div className="border-b border-[#EEE8EA] last:border-b-0" key={service.id}><div className="grid min-w-[720px] grid-cols-[minmax(180px,1.4fr)_120px_minmax(120px,.8fr)_minmax(150px,1fr)_120px] items-center gap-4 px-4 py-3"><button className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default" disabled={!hasDetails} onClick={() => setExpandedServices((current) => { const next = new Set(current); if (next.has(service.id)) next.delete(service.id); else next.add(service.id); return next; })} type="button">{hasDetails ? expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-[#8A8186]" /> : <ChevronRight className="h-4 w-4 shrink-0 text-[#8A8186]" /> : <span className="w-4 shrink-0" />}<span className="truncate text-sm font-semibold text-[#2B2B2B]">{service.serviceName}</span></button><span><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${service.status === "active" ? "bg-[#ECFDF3] text-[#15803D]" : service.status === "paused" ? "bg-[#FFF8E6] text-[#B7791F]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>{serviceStatusLabel(service.status)}</span></span><span className="truncate text-sm">{service.productionUrl ? <a className="text-[#EC6F8B] hover:underline" href={service.productionUrl} rel="noreferrer" target="_blank">開く</a> : <span className="text-[#C0B9BC]">—</span>}</span><span className="truncate text-sm text-[#4B5563]">{service.price !== null ? `¥${service.price.toLocaleString()} / ${billingLabel(service.billingCycle)}` : <span className="text-[#C0B9BC]">—</span>}</span><span className="flex justify-end gap-2"><button className="h-8 rounded-md border border-[#E5E7EB] px-3 text-xs text-[#4B5563]" onClick={() => edit(service)} type="button">編集</button><button aria-label={`${service.serviceName}を削除`} className="grid h-8 w-8 place-items-center rounded-md border border-[#E5E7EB] text-[#D94F6E]" onClick={() => void remove(service)} type="button"><Trash2 className="h-3.5 w-3.5" /></button></span></div>{expanded && hasDetails ? <div className="min-w-[720px] border-t border-[#F3EEF0] bg-[#FFFBFC] px-10 py-4"><dl className="grid gap-3 text-sm sm:grid-cols-2">{service.accountName || credential?.username ? <div><dt className="text-xs text-[#8A8186]">アカウント</dt><dd className="mt-1 break-all text-[#4B5563]">{service.accountName || credential?.username}</dd></div> : null}{service.memo ? <div><dt className="text-xs text-[#8A8186]">メモ</dt><dd className="mt-1 break-words text-[#4B5563]">{service.memo}</dd></div> : null}{credential ? <div><dt className="text-xs text-[#8A8186]">パスワード</dt><dd className="mt-1 break-all text-[#4B5563]">{revealed[credential.id] ?? "••••••••"}</dd><div className="mt-1 flex gap-3 text-xs"><button className="text-[#EC6F8B]" onClick={() => revealed[credential.id] ? setRevealed((current) => { const next = { ...current }; delete next[credential.id]; return next; }) : void accessSecret(credential, "reveal")} type="button">{revealed[credential.id] ? "隠す" : "表示する"}</button><button className="text-[#EC6F8B]" onClick={() => void accessSecret(credential, "copy")} type="button">コピー</button></div></div> : null}</dl></div> : null}</div>; })}</div> : !formOpen ? <div className="rounded-lg border border-dashed border-[#D9DDE3] p-8 text-center"><p className="text-sm font-medium text-[#4B5563]">管理サービスはまだありません</p><p className="mt-1 text-sm text-[#8A8186]">SNSやWebサイトから登録できます。</p><button className="mt-3 text-sm font-medium text-[#EC6F8B]" onClick={() => setFormOpen(true)} type="button">最初のサービスを追加</button></div> : null}
  </div>;
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-[#8A8186]">{label}</p><p className="mt-1 text-sm font-medium text-[#2B2B2B]">{value}</p></div>;
}

function FilesTab({ files, onUpload }: { files: Array<{ id: string; name: string; url: string; createdAt: { toDate: () => Date }; createdByName?: string; size?: number }>; onUpload: (file: File, onProgress: (progress: number) => void) => Promise<void> }) {
  const [progress, setProgress] = useState(0);
  return <div><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-medium text-white"><FileUp className="h-4 w-4" />ファイル追加<input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file, setProgress); }} /></label>{progress > 0 ? <span className="ml-3 text-sm font-medium text-[#EC6F8B]">{progress}%</span> : null}<div className="mt-4 grid gap-3">{files.length === 0 ? <p className="text-sm font-medium text-[#8A8A8A]">ファイルはまだありません。</p> : files.map((file) => <a className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-sm font-medium text-[#2B2B2B]" href={file.url} key={file.id} rel="noreferrer" target="_blank">{file.name}{file.createdByName ? <span className="ml-3 text-xs text-[#777]">{file.createdByName}</span> : null}</a>)}</div></div>;
}

function NotesTab({
  memos,
  logs,
  commonActivities,
  currentUserId,
  isAdmin,
  onCreate,
  onDelete,
  onMore,
  onUpdate
}: {
  memos: Array<{ id: string; title: string; content: string; pinned: boolean; createdBy: string; createdByName?: string; createdAt: { toDate: () => Date } }>;
  logs: CompanyActivityLog[];
  commonActivities: Activity[];
  currentUserId: string;
  isAdmin: boolean;
  onCreate: () => void;
  onDelete: (memoId: string) => Promise<void>;
  onMore: () => void;
  onUpdate: (memoId: string, input: { title: string; content: string; pinned: boolean }) => Promise<void>;
}) {
  const sortedMemos = useMemo(() => [...memos].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime()), [memos]);
  const commonLegacyIds = new Set(commonActivities.map((activity) => activity.legacyCompanyActivityLogId).filter(Boolean));
  const activityMemos = [
    ...commonActivities.filter((activity) => activity.type === "note").map((activity) => ({ id: `activity-${activity.id}`, title: activity.title, content: activity.content, at: activity.occurredAt.toMillis() })),
    ...logs.filter((log) => log.type === "memo" && !commonLegacyIds.has(log.id)).map((log) => ({ id: `log-${log.id}`, title: log.title, content: log.content, at: log.occurredAt.toMillis() }))
  ].sort((a, b) => b.at - a.at);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [editingMemo, setEditingMemo] = useState<typeof sortedMemos[number] | null>(null);
  const selectedMemo = sortedMemos.find((memo) => memo.id === selectedMemoId) ?? sortedMemos[0] ?? null;
  const canManageSelectedMemo = selectedMemo ? isAdmin || selectedMemo.createdBy === currentUserId : false;

  const remove = async (memoId: string) => {
    if (!window.confirm("このメモを削除しますか？")) return;
    await onDelete(memoId);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#6F676B]">{sortedMemos.length + activityMemos.length}件のメモ</p>
        <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={onCreate} type="button"><Plus className="h-4 w-4" />メモを追加</button>
      </div>
      {sortedMemos.length === 0 && activityMemos.length === 0 ? <p className="text-sm font-medium text-[#8A8A8A]">メモはまだありません。</p> : null}
      {sortedMemos.length > 0 ? (
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          {sortedMemos.map((memo) => {
            const active = selectedMemo?.id === memo.id;
            return (
              <button className={`w-full rounded-none border p-3 text-left transition ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} key={memo.id} onClick={() => setSelectedMemoId(memo.id)} type="button">
                <span className="block truncate text-sm font-semibold text-[#2B2B2B]">{memo.pinned ? "固定: " : ""}{memo.title || "無題のメモ"}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-[#8A8186]">{memo.createdByName ?? "作成者未設定"}</span>
              </button>
            );
          })}
        </div>
        <article className="min-h-80 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-5">
          {selectedMemo ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-base font-semibold text-[#2B2B2B]">{selectedMemo.pinned ? "固定: " : ""}{selectedMemo.title || "無題のメモ"}</h4>
                  <p className="mt-1 text-xs font-semibold text-[#777]">{selectedMemo.createdByName ?? "作成者未設定"}</p>
                </div>
                {canManageSelectedMemo ? (
                  <div className="flex shrink-0 gap-2">
                    <button className="grid h-9 w-9 place-items-center border border-[#F0E7E9] bg-white text-[#EC6F8B] transition hover:bg-[#FFF0F3]" onClick={() => setEditingMemo(selectedMemo)} type="button" aria-label="メモを編集">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button className="grid h-9 w-9 place-items-center border border-[#F6CBD2] bg-white text-[#E65A78] transition hover:bg-[#FFF0F3]" onClick={() => void remove(selectedMemo.id)} type="button" aria-label="メモを削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="mt-5 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#2B2B2B]">{selectedMemo.content || "内容は未入力です。"}</p>
            </>
          ) : null}
        </article>
      </div>
      ) : null}
      {activityMemos.length > 0 ? <div className="mt-6 grid gap-3">{activityMemos.map((memo) => <article className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={memo.id}><h4 className="text-sm font-semibold text-[#2B2B2B]">{memo.title || "メモ"}</h4>{memo.content ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#4B5563]">{memo.content}</p> : null}</article>)}</div> : null}
      {logs.length > 0 ? <button className="mt-5 h-11 w-full rounded-none border border-[#F0E7E9] text-sm font-medium text-[#EC6F8B]" onClick={onMore} type="button">さらに過去のメモを表示</button> : null}
      {editingMemo ? <MemoFormModal initial={editingMemo} mode="edit" onClose={() => setEditingMemo(null)} onSubmit={async (input) => { await onUpdate(editingMemo.id, input); setEditingMemo(null); }} /> : null}
    </div>
  );
}

function CompanyFormModal({ mode, company, products, onClose, onSubmit }: { mode: "create" | "edit"; company?: Company; products: Product[]; onClose: () => void; onSubmit: (patch: Partial<Company>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: company?.name ?? "",
    nameKana: company?.nameKana ?? "",
    companyType: company?.companyType ?? "",
    prefecture: company?.prefecture ?? "",
    city: company?.city ?? "",
    region: "",
    address: company?.address ?? "",
    website: company?.website ?? "",
    status: company?.status ?? "lead",
    customerRank: company?.customerRank ?? "C",
    productIds: company?.productIds ?? [],
    productNames: company?.productNames ?? [],
    contacts: company?.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: crypto.randomUUID(), name: company?.primaryContactName ?? "", role: "", email: company?.email ?? "", phone: company?.phone ?? "" })],
    tags: company?.tags.join(", ") ?? "",
    notes: company?.notes ?? ""
  });
  const [saving, setSaving] = useState(false);
  const selectedProducts = products.filter((product) => form.productIds.includes(product.id));
  const updateContact = (contactId: string, patch: Partial<{ name: string; role: string; email: string; phone: string; contactMethods: ContactMethod[] }>) => {
    setForm({ ...form, contacts: form.contacts.map((contact) => (contact.id === contactId ? { ...contact, ...patch } : contact)) });
  };
  const toggleContactMethod = (contactId: string, method: ContactMethod) => {
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact) => {
        if (contact.id !== contactId) return contact;
        const methods = contact.contactMethods ?? [];
        return { ...contact, contactMethods: methods.includes(method) ? methods.filter((item) => item !== method) : [...methods, method] };
      })
    }));
  };
  const addContact = () => setForm({ ...form, contacts: [...form.contacts, { id: crypto.randomUUID(), name: "", role: "", email: "", phone: "", contactMethods: [] }] });
  const removeContact = (contactId: string) => setForm({ ...form, contacts: form.contacts.filter((contact) => contact.id !== contactId) });
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const contacts = form.contacts.map((contact) => ({
      ...contact,
      name: contact.name.trim(),
      role: contact.role?.trim() ?? "",
      email: contact.email?.trim() ?? "",
      phone: contact.phone?.trim() ?? "",
      contactMethods: contact.contactMethods ?? []
    })).filter((contact) => contact.name || contact.role || contact.email || contact.phone);
    const primaryContact = contacts[0] ?? null;
    try {
      await onSubmit({
        ...form,
        contacts,
        primaryContactId: primaryContact?.id ?? null,
        phone: primaryContact?.phone ?? "",
        email: primaryContact?.email ?? "",
        primaryContactName: primaryContact?.name ?? "",
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        productNames: selectedProducts.map((product) => product.name)
      });
    } finally {
      setSaving(false);
    }
  };
  const title = mode === "create" ? "新しい会社を追加" : "会社情報を編集";
  return (
    <Modal subtitle="会社の基本情報と先方担当者を登録してください。" title={title} onClose={onClose}>
      <div className="grid gap-5">
        <FormSection icon={<Building2 className="h-4 w-4" />} title="基本情報">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="会社名" placeholder="会社名を入力してください" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Input label="所在地" placeholder="町名・番地・ビル名などを入力してください" value={form.address} onChange={(address) => setForm({ ...form, address })} />
            <div className="sm:col-span-2">
              <Input label="Webサイト" placeholder="https://example.com" type="url" value={form.website} onChange={(website) => setForm({ ...form, website })} />
            </div>
          </div>
        </FormSection>

        <FormSection icon={<Target className="h-4 w-4" />} title="営業情報">
          <div className="grid gap-4 sm:grid-cols-2">
            <MultiSelect
              emptyLabel="商材が未登録です。"
              label="関連商材"
              options={products.map((product) => ({ value: product.id, label: product.name, description: product.tagline }))}
              placeholder="商材を選択してください"
              values={form.productIds}
              onChange={(productIds) => setForm((current) => ({ ...current, productIds }))}
            />
          </div>
        </FormSection>

        <FormSection icon={<UserRound className="h-4 w-4" />} title="先方担当者">
          <div className="grid gap-3">
            {form.contacts.map((contact, index) => (
              <div className="grid gap-4 rounded-xl border border-[#E5E7EB] bg-white p-4" key={contact.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#2B2B2B]">担当者{index + 1}</p>
                  {form.contacts.length > 1 ? (
                    <button className="inline-flex h-9 items-center gap-2 border border-[#F6CBD2] bg-white px-3 text-xs font-medium text-[#D94F6E] transition hover:bg-[#FFF0F3]" onClick={() => removeContact(contact.id)} type="button">
                      <Trash2 className="h-3.5 w-3.5" />
                      削除
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ContactInput label="担当者名" placeholder="担当者名を入力" value={contact.name} onChange={(name) => updateContact(contact.id, { name })} />
                  <ContactInput label="役職" placeholder="例）支配人・マネージャー" value={contact.role ?? ""} onChange={(role) => updateContact(contact.id, { role })} />
                  <ContactInput label="メールアドレス" placeholder="メールアドレスを入力" type="email" value={contact.email ?? ""} onChange={(email) => updateContact(contact.id, { email })} />
                  <ContactInput label="電話番号" placeholder="電話番号を入力" type="tel" value={contact.phone ?? ""} onChange={(phone) => updateContact(contact.id, { phone })} />
                </div>
                <Field label="連絡方法">
                  <div className="flex flex-wrap items-center gap-2">
                    {contactMethodOptions.map(([method, label]) => (
                      <ContactMethodToggle checked={(contact.contactMethods ?? []).includes(method)} key={method} label={label} onClick={() => toggleContactMethod(contact.id, method)} />
                    ))}
                  </div>
                </Field>
              </div>
            ))}
            <button className="inline-flex h-11 w-fit items-center gap-2 border border-dashed border-[#F7AFC0] bg-white px-4 text-sm font-medium text-[#EC6F8B] transition hover:bg-[#FFF7F9]" onClick={addContact} type="button">
              <Plus className="h-4 w-4" />
              担当者を追加
            </button>
          </div>
        </FormSection>
      </div>
      <Actions primaryLabel={mode === "create" ? "会社を登録" : "変更を保存"} savingLabel={mode === "create" ? "登録中..." : "保存中..."} saving={saving} onClose={onClose} onSave={save} disabled={!form.name.trim()} />
    </Modal>
  );
}

function LogFormModal({ company, currentUser, existingTasks, members, onClose, onSubmit }: { company: Company; currentUser: { id: string; name: string }; existingTasks: Array<{ title: string; status: string }>; members: Array<{ uid: string; name: string; email: string }>; onClose: () => void; onSubmit: (input: Parameters<ReturnType<typeof useCompanies>["addLog"]>[1], generateTasks: boolean) => Promise<void> }) {
  const contacts = company.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: "primary", name: company.primaryContactName ?? "", role: "", email: company.email ?? "", phone: company.phone ?? "" })].filter((contact) => contact.name || contact.email || contact.phone);
  const now = new Date();
  const [form, setForm] = useState({ type: "phone" as ActivityLogType, occurredDate: toDateInputValue(now), title: "", actorUserIds: [currentUser.id].filter(Boolean), contactIds: contacts[0]?.id ? [contacts[0].id] : [], content: "", aiTaskRequested: false });
  const [saving, setSaving] = useState(false);
  const selectedActors = members.filter((member) => form.actorUserIds.includes(member.uid));
  const selectedContacts = contacts.filter((contact) => form.contactIds.includes(contact.id));
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSubmit({
      type: form.type,
      direction: "unknown",
      title: form.title,
      content: form.content,
      occurredAt: Timestamp.fromDate(dateFromInput(form.occurredDate)),
      source: "manual",
      actorUserIds: form.actorUserIds,
      actorNames: selectedActors.map((member) => member.name),
      contactIds: form.contactIds,
      contactNames: selectedContacts.map(formatContactName),
      aiTaskRequested: form.aiTaskRequested,
      nextAction: null
    }, form.aiTaskRequested);
    setSaving(false);
  };
  return (
    <Modal title={`${company.name} のログを追加`} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="ログ種類" value={form.type} options={(["phone", "email", "chat", "visit", "meeting", "file", "other"] as ActivityLogType[]).map((type) => [type, activityTypeLabels[type]])} onChange={(type) => setForm({ ...form, type: type as ActivityLogType })} />
        <Input label="日付" value={form.occurredDate} type="date" onChange={(occurredDate) => setForm({ ...form, occurredDate })} />
        <Input label="タイトル" required value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <MultiSelect
          label="社内側"
          options={members.map((member) => ({ value: member.uid, label: member.name, description: member.email }))}
          placeholder="社内側の担当者を選択"
          values={form.actorUserIds}
          onChange={(actorUserIds) => setForm({ ...form, actorUserIds })}
        />
        <Field label="先方側">
          <MultiSelect
            emptyLabel="先方担当者が未登録です。"
            options={contacts.map((contact) => ({ value: contact.id, label: formatContactName(contact), description: formatContactSummary(contact) }))}
            placeholder="先方担当者を選択"
            values={form.contactIds}
            onChange={(contactIds) => setForm({ ...form, contactIds })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Text label={form.type === "email" ? "メール本文 / 内容" : "内容"} value={form.content} minHeight="min-h-[28rem]" onChange={(content) => setForm({ ...form, content })} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-[#655D62]"><input checked={form.aiTaskRequested} onChange={(event) => setForm({ ...form, aiTaskRequested: event.target.checked })} type="checkbox" />この内容からAIにタスクを作成してもらう</label>
        <p className="text-xs font-semibold text-[#8A8A8A]">未完了タスク: {existingTasks.filter((task) => task.status !== "completed").map((task) => task.title).join(" / ") || "なし"}</p>
      </div>
      <Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim() || form.actorUserIds.length === 0} />
    </Modal>
  );
}

function NextActionModal({ draft, saving, onChange, onClose, onSave }: { draft: NextActionDraft; saving: boolean; onChange: (draft: NextActionDraft) => void; onClose: () => void; onSave: () => void }) {
  return (
    <Modal title="次回予定を編集" onClose={onClose}>
      <div className="grid gap-4">
        <Input label="次回予定" value={draft.nextActionTitle} onChange={(nextActionTitle) => onChange({ ...draft, nextActionTitle })} />
      </div>
      <Actions saving={saving} onClose={onClose} onSave={onSave} disabled={false} />
    </Modal>
  );
}

function MemoFormModal({ mode = "create", initial, onClose, onSubmit }: { mode?: "create" | "edit"; initial?: { title: string; content: string; pinned: boolean }; onClose: () => void; onSubmit: (input: { title: string; content: string; pinned: boolean }) => Promise<void> }) {
  const [form, setForm] = useState({ title: initial?.title ?? "", content: initial?.content ?? "", pinned: initial?.pinned ?? false });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSubmit({ title: form.title.trim(), content: form.content.trim(), pinned: form.pinned });
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={mode === "edit" ? "メモを編集" : "メモを追加"} onClose={onClose}><div className="grid gap-4"><Input label="タイトル" required value={form.title} onChange={(title) => setForm({ ...form, title })} /><Text label="内容" value={form.content} minHeight="min-h-[36rem]" onChange={(content) => setForm({ ...form, content })} /><label className="flex items-center gap-2 text-sm font-medium text-[#655D62]"><input checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} type="checkbox" />固定表示</label></div><Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim()} /></Modal>;
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="flex max-h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_24px_80px_rgba(31,31,34,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#F3F4F6] px-6 py-5">
          <div>
        <h2 className="text-xl font-medium text-[#2B2B2B]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-semibold text-[#8A8186]">{subtitle}</p> : null}
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#E5E7EB] bg-white text-[#6F676B] transition hover:bg-[#FFF7F9]" onClick={onClose} type="button" aria-label="閉じる">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </section>
    </div>
  );
}

function Actions({ saving, disabled, primaryLabel = "保存", savingLabel = "保存中...", onClose, onSave }: { saving: boolean; disabled: boolean; primaryLabel?: string; savingLabel?: string; onClose: () => void; onSave: () => void }) {
  return <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-3 border-t border-[#F3F4F6] bg-white px-6 py-4"><button className="h-11 border border-[#E5E7EB] bg-white px-5 text-sm font-medium text-[#6F676B] transition hover:bg-[#F9FAFB]" onClick={onClose} type="button">キャンセル</button><button className="h-11 bg-[#EC6F8B] px-6 text-sm font-medium text-white transition hover:bg-[#E45E7D] disabled:opacity-50" disabled={saving || disabled} onClick={onSave} type="button">{saving ? savingLabel : primaryLabel}</button></div>;
}

function InfoGrid({ rows, compact = false }: { rows: Array<[string, string]>; compact?: boolean }) {
  return <div className={compact ? "grid gap-3" : "grid gap-4"}>{rows.map(([label, value]) => <div className={`grid gap-2 ${compact ? "md:grid-cols-[150px_1fr]" : "md:grid-cols-[150px_1fr]"}`} key={label}><p className="text-sm font-semibold text-[#6B7280]">{label}</p><p className="whitespace-pre-wrap text-sm font-medium leading-6 text-[#111827]">{value}</p></div>)}</div>;
}

function formatContacts(company: Company): string {
  const contacts = company.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: "primary", name: company.primaryContactName ?? "", role: "", email: company.email ?? "", phone: company.phone ?? "" })];
  const rows = contacts
    .map((contact) => [formatContactName(contact), formatContactSummary(contact)].filter(Boolean).join(" / "))
    .filter(Boolean);
  return rows.length ? rows.join("\n") : "未設定";
}

function companyStatusLabel(status: Company["status"]): string {
  return companyStatusOptions.find(([value]) => value === status)?.[1] ?? status;
}

function companyStatusClass(status: Company["status"]): string {
  return ({
    lead: "bg-[#FFF4CC] text-[#8A5A00]",
    prospect: "bg-[#F5ECFF] text-[#6D3FB5]",
    customer: "bg-[#EAFBF0] text-[#147A3C]",
    inactive: "bg-[#F3F4F6] text-[#6B7280]",
    archived: "bg-[#F3F4F6] text-[#6B7280]"
  } as const)[status] ?? "bg-[#F3F4F6] text-[#6B7280]";
}

function StatusBadge({ status }: { status: Company["status"] }) {
  return <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ${companyStatusClass(status)}`}>{companyStatusLabel(status)}</span>;
}

function sortedOpenTasks<T extends { status: string; dueDate?: { toDate: () => Date } | null }>(tasks: T[]): T[] {
  return tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").sort((a, b) => (a.dueDate?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER));
}

function relativeDate(date: Date): string {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  if (days > 1 && days < 7) return `${days}日前`;
  return date.toLocaleDateString("ja-JP");
}

async function companyApi<T = { id: string }>(user: Exclude<AuthTokenUser, null>, path: string, method = "GET", body?: unknown): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(response.ok ? "APIの応答形式が正しくありません。" : "APIが見つからないか、処理に失敗しました。");
  }
  const payload = await response.json() as { success: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "処理に失敗しました。");
  return payload.data;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "処理に失敗しました。"; }
function dateInput(value?: string | null): string { return value ? value.slice(0, 10) : ""; }
function serviceStatusLabel(status: string): string { return status === "active" ? "利用中" : status === "paused" ? "一時停止" : "終了"; }
function billingLabel(value: string): string { return value === "monthly" ? "月" : value === "yearly" ? "年" : value === "one_time" ? "一括" : "その他"; }

function formatContactName(contact: { name?: string; role?: string; email?: string; phone?: string }): string {
  const name = contact.name || contact.email || contact.phone || "名前未設定";
  return contact.role ? `${name}（${contact.role}）` : name;
}

function normalizeContactPerson(contact: CompanyContactPerson): CompanyContactPerson {
  return {
    ...contact,
    contactMethods: contact.contactMethods?.length ? contact.contactMethods : inferContactMethods(contact)
  };
}

function inferContactMethods(contact: { email?: string; phone?: string }): ContactMethod[] {
  return [
    ...(contact.phone ? ["phone" as const] : []),
    ...(contact.email ? ["email" as const] : [])
  ];
}

function formatContactSummary(contact: CompanyContactPerson): string {
  return [contact.email, contact.phone, formatContactMethods(contact.contactMethods)].filter(Boolean).join(" / ");
}

function formatContactMethods(methods?: ContactMethod[]): string {
  return methods?.length ? methods.map((method) => contactMethodOptions.find(([value]) => value === method)?.[1] ?? method).join("・") : "";
}

function formatActivityParties(log: CompanyActivityLog): string {
  const actors = log.actorNames?.length ? log.actorNames.join(" / ") : getUserDisplayNameById(log.userId, log.userName);
  const contacts = log.contactNames?.length ? log.contactNames.join(" / ") : "先方未設定";
  return `対応者: ${actors} / 相手先: ${contacts}`;
}

function FormSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#E5E7EB] bg-[#FFFBFC] p-5"><h3 className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-[#2B2B2B]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#FFF0F3] text-[#EC6F8B]">{icon}</span>{title}</h3>{children}</section>;
}

function Input({ label, value, onChange, placeholder, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-[#655D62]"><span className="inline-flex items-center gap-1.5">{label}{required ? <span className="text-[#EC6F8B]">*</span> : null}</span><input className="task-input border-[#E5E7EB] bg-white placeholder:text-[#B8B0B4] focus:border-[#EC6F8B] focus:ring-2 focus:ring-[#F7CAD2]" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ContactInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="grid gap-2 text-xs font-medium text-[#6F676B]">{label}<input className="task-input border-[#E5E7EB] bg-white placeholder:text-[#B8B0B4] focus:border-[#EC6F8B] focus:ring-2 focus:ring-[#F7CAD2]" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ContactMethodToggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`inline-flex h-9 min-w-16 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium ${checked ? "bg-[#EC6F8B] text-white" : "border border-[#E5E7EB] bg-white text-[#6F676B]"}`} onClick={onClick} type="button" aria-pressed={checked}>
      {checked ? <Check className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2 text-sm font-semibold text-[#655D62]"><span>{label}</span>{children}</div>;
}

function Text({ label, value, onChange, minHeight = "min-h-24" }: { label: string; value: string; onChange: (value: string) => void; minHeight?: string }) {
  return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}<textarea className={`task-input ${minHeight} resize-none`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <SingleSelect label={label} options={options.map(([nextValue, nextLabel]) => ({ value: nextValue, label: nextLabel }))} value={value} onChange={onChange} />;
}

function CompanySkeleton() {
  return <SkeletonList count={6} media />;
}

function EmptyCompanies({ hasQuery, onCreate }: { hasQuery: boolean; onCreate: () => void }) {
  return <EmptyState actionLabel={hasQuery ? undefined : "新しい会社を追加"} description={hasQuery ? "別のキーワードで検索してください。" : "取引先企業を登録して、活動履歴やタスクをまとめていきましょう。"} onAction={hasQuery ? undefined : onCreate} title={hasQuery ? "条件に一致する会社がありません" : "会社がまだ登録されていません"} />;
}

function groupByMonth(logs: CompanyActivityLog[]) {
  return logs.reduce<Record<string, CompanyActivityLog[]>>((groups, log) => {
    const key = monthKey(log.occurredAt.toDate());
    return { ...groups, [key]: [...(groups[key] ?? []), log] };
  }, {});
}

function groupUnifiedByMonth(items: UnifiedCompanyTimelineItem[]) {
  return items.reduce<Record<string, UnifiedCompanyTimelineItem[]>>((groups, item) => {
    const key = monthKey(item.occurredAt.toDate());
    return { ...groups, [key]: [...(groups[key] ?? []), item] };
  }, {});
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function toLines(value?: string[]): string {
  return (value ?? []).join("\n");
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromInput(date: string): Date {
  const value = new Date(`${date || toDateInputValue(new Date())}T00:00`);
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

function companyTaskDraft(company: Company, title: string, currentUserId: string, currentUserName: string): TaskDraft {
  const productName = company.productNames?.[0] ?? "";
  const productId = company.productIds?.[0] ?? "";
  return {
    title: title.trim(),
    description: [company.name, company.primaryContactName, productName].filter(Boolean).join(" / "),
    status: "todo",
    priority: "medium",
    source: "manual",
    assigneeId: currentUserId,
    assigneeName: currentUserName,
    collaboratorIds: [],
    collaboratorNames: [],
    companyId: company.id,
    companyName: company.name,
    leadId: "",
    leadName: "",
    productId,
    productName,
    projectId: "",
    projectName: "",
    meetingId: "",
    meetingTitle: "",
    dueDate: "",
    dueTime: "",
    aiReason: "",
    comments: "",
    checklistText: ""
  };
}

async function createSuggestedTasks(company: Company, input: { title: string; content?: string; occurredAt: Timestamp; type?: ActivityLogType; meetingId?: string; meetingTitle?: string; productNames?: string[]; contactNames?: string[] }, user: { id: string; name: string }, authUser?: { getIdToken: () => Promise<string> } | null) {
  if (!window.confirm("内容からAIタスクを作成しますか？")) return;
  const suggestions = await fetchTaskSuggestions(company, input, authUser);
  const productName = input.productNames?.[0] ?? company.productNames?.[0] ?? "";
  const productIndex = productName ? (company.productNames ?? []).findIndex((name) => name === productName) : -1;
  const productId = productIndex >= 0 ? company.productIds?.[productIndex] ?? "" : company.productIds?.[0] ?? "";
  const drafts: TaskDraft[] = suggestions.map((task) => ({
    title: `${company.name}: ${task.title}`,
    description: task.description || `${input.title}\n${input.content ?? ""}`.trim(),
    status: "todo",
    priority: task.priority,
    source: "ai",
    assigneeId: user.id,
    assigneeName: user.name,
    collaboratorIds: [],
    collaboratorNames: [],
    companyId: company.id,
    companyName: company.name,
    productId,
    productName,
    projectId: "",
    projectName: "",
    meetingId: input.meetingId ?? "",
    meetingTitle: input.meetingTitle ?? input.title,
    dueDate: task.dueDate ?? "",
    dueTime: "",
    aiReason: task.reason || "打ち合わせ内容と次回アクションから生成",
    comments: "",
    checklistText: ""
  }));
  await Promise.all(drafts.map((draft) => createTask(draft, { id: user.id, uid: user.id, name: user.name })));
}

async function fetchTaskSuggestions(company: Company, input: { title: string; content?: string; productNames?: string[]; contactNames?: string[] }, authUser?: { getIdToken: () => Promise<string> } | null): Promise<Array<{ title: string; description: string; priority: "high" | "medium" | "low"; dueDate: string | null; reason: string }>> {
  const fallback = localTaskSuggestions(input.title, input.content ?? "");
  if (!authUser) return fallback;
  try {
    const token = await authUser.getIdToken();
    const response = await fetch("/api/companies/suggest-tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: company.name, title: input.title, content: input.content ?? "", productNames: input.productNames ?? [], contactNames: input.contactNames ?? [] })
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { tasks?: Array<{ title: string; description: string; priority: "high" | "medium" | "low"; dueDate: string | null; reason: string }> };
    return data.tasks?.length ? data.tasks : fallback;
  } catch {
    return fallback;
  }
}

function localTaskSuggestions(title: string, content: string): Array<{ title: string; description: string; priority: "high" | "medium" | "low"; dueDate: string | null; reason: string }> {
  return content
    .split(/\n|。|・/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => ({
      title: item.length > 40 ? `${item.slice(0, 40)}...` : item,
      description: `${title}\n${content}`.trim(),
      priority: "medium",
      dueDate: null,
      reason: "打ち合わせ内容と次回アクションから生成"
    }));
}
