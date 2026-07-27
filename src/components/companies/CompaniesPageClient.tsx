"use client";

import { Archive, Bookmark, Check, ChevronDown, Edit2, FileUp, Mail, MoreHorizontal, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskCard } from "@/components/tasks/TaskCard";
import { SkeletonList } from "@/components/ui/loading";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { useCompanies } from "@/hooks/useCompanies";
import { activityTone, activityTypeLabels, monthKey } from "@/lib/company-utils";
import { subscribeProductsMaster } from "@/lib/products";
import { createTask } from "@/lib/tasks";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayNameById } from "@/lib/user-display";
import type { ActivityDirection, ActivityLogType, Company, CompanyActivityLog, CompanyMeeting } from "@/types/company";
import type { Product } from "@/types/product";
import type { TaskDraft } from "@/types/task";

type SortKey = "lastContact" | "updated" | "name" | "owner";
type TabKey = "overview" | "timeline" | "deals" | "meetings" | "tasks" | "files" | "notes";

const tabs: Array<[TabKey, string]> = [["overview", "概要"], ["timeline", "活動ログ"], ["deals", "案件・商談"], ["meetings", "打ち合わせ"], ["tasks", "タスク"], ["files", "ファイル"], ["notes", "メモ"]];
const sortOptions: Array<[SortKey, string]> = [["lastContact", "最終接触日が新しい順"], ["updated", "更新日が新しい順"], ["name", "会社名順"], ["owner", "担当者順"]];
const activityDirectionLabels: Record<ActivityDirection, string> = {
  outbound: "こちらから",
  inbound: "先方から",
  internal: "社内対応",
  unknown: "未設定"
};

export function CompaniesPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const selectedTab = (params.get("tab") as TabKey | null) ?? "overview";
  const q = params.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [sort, setSort] = useState<SortKey>("lastContact");
  const [logLimit, setLogLimit] = useState(30);
  const store = useCompanies(selectedId, logLimit);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<{ uid: string; name: string; email: string }>>(DEFAULT_WORKSPACE_MEMBERS);
  const [products, setProducts] = useState<Product[]>([]);

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

  useEffect(() => {
    if (query === q) return undefined;
    const timer = window.setTimeout(() => setRoute({ q: query }), 300);
    return () => window.clearTimeout(timer);
  }, [q, query, setRoute]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return store.companies
      .filter((company) => company.status !== "archived")
      .filter((company) => !needle || [company.name, company.nameKana, company.primaryContactName, company.contacts?.map((contact) => [contact.name, contact.email, contact.phone].join(" ")).join(" "), company.industry, company.address, company.phone, company.email, company.tags.join(" "), company.internalOwnerName, company.companionNames?.join(" ")].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ja");
        if (sort === "owner") return (a.internalOwnerName ?? "").localeCompare(b.internalOwnerName ?? "", "ja");
        if (sort === "updated") return b.updatedAt.toMillis() - a.updatedAt.toMillis();
        return (b.lastContactAt?.toMillis() ?? 0) - (a.lastContactAt?.toMillis() ?? 0);
      });
  }, [q, sort, store.companies]);

  const selectedCompany = filtered.find((company) => company.id === selectedId) ?? filtered[0] ?? null;
  useEffect(() => {
    if (!selectedId && selectedCompany) setRoute({ id: selectedCompany.id, tab: selectedTab });
  }, [selectedCompany, selectedId, selectedTab, setRoute]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader
        title="会社一覧"
        description="取引先企業を管理・把握できます"
        actions={<button className="inline-flex h-11 items-center gap-2 rounded-full bg-[#EC6F8B] px-5 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しい会社を追加</button>}
      />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={store.error} type="error" /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-lg border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <label className="flex h-11 items-center gap-2 rounded-md border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#777]">
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="会社名・担当者・業種で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Search className="h-4 w-4" />
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#6F676B]">{filtered.length}件の会社</p>
            <select className="h-10 rounded-full border border-[#F0E7E9] bg-white px-3 text-sm font-bold text-[#6F676B]" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {store.loading ? <CompanySkeleton /> : null}
            {!store.loading && filtered.length === 0 ? <EmptyCompanies hasQuery={Boolean(q)} onCreate={() => setCreateOpen(true)} /> : null}
            {filtered.map((company) => <CompanyListItem active={selectedCompany?.id === company.id} company={company} favorite={company.favoriteUserIds.includes(store.user?.uid ?? "")} key={company.id} onFavorite={() => void store.toggleFavorite(company)} onSelect={() => setRoute({ id: company.id, tab: selectedTab })} />)}
          </div>
        </section>
        <section className="min-w-0">
          {selectedCompany ? (
            <div className="space-y-4">
              <CompanyDetailHeader company={selectedCompany} canDelete={store.isAdmin} favorite={selectedCompany.favoriteUserIds.includes(store.user?.uid ?? "")} onDelete={() => void store.deleteCompany(selectedCompany.id)} onEdit={() => setEditCompany(selectedCompany)} onFavorite={() => void store.toggleFavorite(selectedCompany)} onLog={() => setLogOpen(true)} />
              <div className="rounded-lg border border-[#F0E7E9] bg-white shadow-sm">
                <div className="flex overflow-x-auto border-b border-[#F0E7E9]">{tabs.map(([value, label]) => <button className={`h-12 shrink-0 px-5 text-sm font-bold ${selectedTab === value ? "border-b-2 border-[#EC6F8B] text-[#EC6F8B]" : "text-[#6F676B]"}`} key={value} onClick={() => setRoute({ id: selectedCompany.id, tab: value })} type="button">{label}</button>)}</div>
                <div className="p-5">
                  {selectedTab === "overview" ? <OverviewTab company={selectedCompany} tasks={store.tasks} /> : null}
                  {selectedTab === "timeline" ? <TimelineTab logs={store.logs} onMore={() => setLogLimit((current) => current + 30)} /> : null}
                  {selectedTab === "deals" ? <DealsTab /> : null}
                  {selectedTab === "meetings" ? <MeetingsTab meetings={store.meetings} onCreate={() => setMeetingOpen(true)} /> : null}
                  {selectedTab === "tasks" ? <TasksTab tasks={store.tasks} /> : null}
                  {selectedTab === "files" ? <FilesTab files={store.files} onUpload={(file, onProgress) => store.uploadFile(selectedCompany.id, file, onProgress)} /> : null}
                  {selectedTab === "notes" ? <NotesTab memos={store.memos} onCreate={() => setMemoOpen(true)} /> : null}
                </div>
              </div>
            </div>
          ) : <div className="rounded-lg border border-dashed border-[#F0E7E9] bg-white p-12 text-center text-sm font-bold text-[#8A8A8A]">左の一覧から会社を選択してください</div>}
        </section>
      </div>
      {createOpen ? <CompanyFormModal mode="create" currentUser={store.currentUser} members={members} products={products} onClose={() => setCreateOpen(false)} onSubmit={async (patch) => { const id = await store.createCompany(patch); setCreateOpen(false); flash("会社を作成しました"); setRoute({ id, tab: "overview" }); }} /> : null}
      {editCompany ? <CompanyFormModal company={editCompany} mode="edit" currentUser={store.currentUser} members={members} products={products} onClose={() => setEditCompany(null)} onSubmit={async (patch) => { await store.updateCompany(editCompany.id, patch); setEditCompany(null); flash("会社情報を更新しました"); }} /> : null}
      {selectedCompany && logOpen ? <LogFormModal company={selectedCompany} currentUser={store.currentUser} existingTasks={store.tasks} members={members} onClose={() => setLogOpen(false)} onSubmit={async (input, generateTasks) => { await store.addLog(selectedCompany.id, input); setLogOpen(false); flash("ログを追加しました"); if (generateTasks) await createSuggestedTasks(selectedCompany, input, store.currentUser); }} /> : null}
      {selectedCompany && meetingOpen ? <MeetingFormModal company={selectedCompany} products={products} onClose={() => setMeetingOpen(false)} onSubmit={async (input, generateTasks) => { const meetingId = await store.addMeeting(selectedCompany, input); setMeetingOpen(false); flash("打ち合わせを登録しました"); if (generateTasks) await createSuggestedTasks(selectedCompany, { type: "meeting", title: input.title, content: `${input.summary ?? ""}\n\n次回アクション:\n${input.nextActions?.join("\n") ?? ""}`.trim(), occurredAt: input.startAt, meetingId, meetingTitle: input.title, productNames: input.productNames, contactNames: input.contactNames }, store.currentUser, store.user); }} /> : null}
      {selectedCompany && memoOpen ? <MemoFormModal onClose={() => setMemoOpen(false)} onSubmit={async (input) => { await store.addMemo(selectedCompany.id, input); setMemoOpen(false); flash("メモを追加しました"); }} /> : null}
    </div>
  );
}

function CompanyListItem({ company, active, favorite, onSelect, onFavorite }: { company: Company; active: boolean; favorite: boolean; onSelect: () => void; onFavorite: () => void }) {
  return <button className={`grid w-full grid-cols-[56px_1fr_32px] gap-3 rounded-lg border p-3 text-left ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} onClick={onSelect} type="button"><span className="grid h-14 w-14 place-items-center rounded-md bg-[#FFE4EA] text-sm font-bold text-[#D94F6E]">{company.name.slice(0, 2)}</span><span className="min-w-0"><span className="block truncate font-bold text-[#2B2B2B]">{company.name}</span><span className="mt-1 block truncate text-sm font-semibold text-[#777]">{company.industry || "業種未設定"}</span><span className="mt-2 block text-xs font-semibold text-[#777]">担当: {company.internalOwnerName || "未設定"} / 最終接触: {company.lastContactAt?.toDate().toLocaleDateString("ja-JP") ?? "未接触"}</span></span><span role="button" tabIndex={0} className="grid h-8 w-8 place-items-center text-[#EC6F8B]" onClick={(event) => { event.stopPropagation(); onFavorite(); }} onKeyDown={(event) => { if (event.key === "Enter") onFavorite(); }}><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></span></button>;
}

function CompanyDetailHeader({ company, favorite, canDelete, onFavorite, onEdit, onLog, onDelete }: { company: Company; favorite: boolean; canDelete: boolean; onFavorite: () => void; onEdit: () => void; onLog: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  return <section className="rounded-lg border border-[#F0E7E9] bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-4"><span className="grid h-20 w-20 place-items-center rounded-md bg-[#FFE4EA] text-xl font-bold text-[#D94F6E]">{company.name.slice(0, 2)}</span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-[#2B2B2B]">{company.name}</h2><button className="text-[#EC6F8B]" onClick={onFavorite} type="button"><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></button></div><p className="mt-2 text-sm font-semibold text-[#777]">{company.industry || "業種未設定"} / {company.address || "所在地未設定"} / 担当: {company.internalOwnerName || "未設定"}</p></div></div><div className="relative flex flex-wrap gap-2"><button className="h-10 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" onClick={onEdit} type="button"><Edit2 className="mr-2 inline h-4 w-4" />編集</button>{company.email ? <a className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" href={`mailto:${company.email}`}><Mail className="h-4 w-4" />メール</a> : null}{company.phone ? <a className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" href={`tel:${company.phone}`}><Phone className="h-4 w-4" />電話</a> : null}<button className="h-10 rounded-full bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onLog} type="button">ログを追加</button><button className="grid h-10 w-10 place-items-center rounded-full border border-[#F0E7E9]" onClick={() => setMenu((current) => !current)} type="button"><MoreHorizontal className="h-5 w-5" /></button>{menu ? <div className="absolute right-0 top-12 z-10 grid w-40 gap-1 rounded-lg border border-[#F0E7E9] bg-white p-2 shadow-lg"><button className="h-9 rounded-md text-left text-sm font-bold text-[#6F676B]" onClick={() => void navigator.clipboard.writeText(window.location.href)} type="button">URLをコピー</button><button className="h-9 rounded-md text-left text-sm font-bold text-[#6F676B]" type="button"><Archive className="mr-2 inline h-4 w-4" />アーカイブ</button>{canDelete ? <button className="h-9 rounded-md text-left text-sm font-bold text-[#D94F6E]" onClick={() => window.confirm("会社を削除しますか？") && onDelete()} type="button"><Trash2 className="mr-2 inline h-4 w-4" />削除</button> : null}</div> : null}</div></div></section>;
}

function OverviewTab({ company, tasks }: { company: Company; tasks: Array<{ status: string; dueDate?: { toDate: () => Date } | null; title: string; assigneeName?: string }> }) {
  const nextTask = tasks.filter((task) => task.status !== "completed").sort((a, b) => (a.dueDate?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER))[0];
  return <InfoGrid rows={[["会社名", company.name], ["会社名カナ", company.nameKana || "未設定"], ["業種", company.industry || "未設定"], ["所在地", company.address || "未設定"], ["Webサイト", company.website || "未設定"], ["関連商材", company.productNames?.join(" / ") || "未設定"], ["営業担当者", company.internalOwnerName || "未設定"], ["同行者", company.companionNames?.join(" / ") || "未設定"], ["先方担当者", formatContacts(company)], ["最終接触日", company.lastContactAt?.toDate().toLocaleString("ja-JP") ?? "未接触"], ["次回アクション", nextTask ? `${nextTask.title} / ${nextTask.dueDate?.toDate().toLocaleDateString("ja-JP") ?? "期限未設定"} / ${nextTask.assigneeName ?? "未設定"}` : company.nextActionTitle || "未設定"]]} />;
}

function TimelineTab({ logs, onMore }: { logs: CompanyActivityLog[]; onMore: () => void }) {
  const [filter, setFilter] = useState<ActivityLogType | "all">("all");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const activityLogs = logs.filter((log) => log.source !== "system" && log.type !== "status_change");
  const filtered = filter === "all" ? activityLogs : activityLogs.filter((log) => log.type === filter);
  const groups = groupByMonth(filtered);
  const selectedLog = filtered.find((log) => log.id === selectedLogId) ?? filtered[0] ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "meeting", "phone", "email", "visit", "memo", "other"] as Array<ActivityLogType | "all">).map((type) => (
          <button className={`h-9 rounded-full px-3 text-xs font-bold ${filter === type ? "bg-[#EC6F8B] text-white" : "border border-[#F0E7E9] text-[#6F676B]"}`} key={type} onClick={() => setFilter(type)} type="button">
            {type === "all" ? "すべて" : activityTypeLabels[type]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="rounded-lg border border-dashed border-[#F0E7E9] p-8 text-center text-sm font-bold text-[#8A8A8A]">まだ活動ログがありません</p> : null}
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-5">
          {Object.entries(groups).map(([month, items]) => (
            <section key={month}>
              <h3 className="mb-3 text-sm font-bold text-[#8A8186]">{month}</h3>
              <div className="space-y-2">
                {items.map((log) => (
                  <button className={`w-full rounded-lg border p-3 text-left text-sm font-bold transition ${selectedLog?.id === log.id ? "border-[#F7CAD2] bg-[#FFF0F3] text-[#D94F6E]" : "border-[#F0E7E9] bg-white text-[#2B2B2B] hover:bg-[#FFFBFC]"}`} key={log.id} onClick={() => setSelectedLogId(log.id)} type="button">
                    {log.title || "無題のログ"}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <ActivityLogDetail log={selectedLog} />
      </div>
      <button className="mt-5 h-11 w-full rounded-full border border-[#F0E7E9] text-sm font-bold text-[#EC6F8B]" onClick={onMore} type="button">さらに過去の履歴を表示</button>
    </div>
  );
}

function ActivityLogDetail({ log }: { log: CompanyActivityLog | null }) {
  if (!log) return <div className="rounded-lg border border-dashed border-[#F0E7E9] bg-white p-8 text-center text-sm font-bold text-[#8A8A8A]">活動ログを選択してください</div>;
  return (
    <article className="rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${activityTone(log.type)}`}>{activityTypeLabels[log.type]}</span>
        <span className="rounded-full border border-[#F0E7E9] bg-white px-3 py-1 text-xs font-bold text-[#D94F6E]">{activityDirectionLabels[log.direction ?? "unknown"]}</span>
      </div>
      <h3 className="mt-3 text-xl font-bold text-[#2B2B2B]">{log.title || "無題のログ"}</h3>
      <dl className="mt-4 grid gap-3 text-sm font-semibold text-[#6F676B]">
        <div className="grid gap-1 md:grid-cols-[110px_1fr]"><dt className="font-bold text-[#8A8186]">日時</dt><dd>{log.occurredAt.toDate().toLocaleString("ja-JP")}</dd></div>
        <div className="grid gap-1 md:grid-cols-[110px_1fr]"><dt className="font-bold text-[#8A8186]">関係者</dt><dd>{formatActivityParties(log)}</dd></div>
        {log.contactNote ? <div className="grid gap-1 md:grid-cols-[110px_1fr]"><dt className="font-bold text-[#8A8186]">相手メモ</dt><dd>{log.contactNote}</dd></div> : null}
      </dl>
      <div className="mt-5">
        <p className="text-sm font-bold text-[#8A8186]">内容</p>
        <p className="mt-2 min-h-32 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm font-semibold leading-6 text-[#2B2B2B]">{log.content || "内容は未登録です。"}</p>
      </div>
      {log.nextAction?.title ? (
        <div className="mt-4 rounded-lg border border-[#F0E7E9] bg-white p-4">
          <p className="text-sm font-bold text-[#D94F6E]">次のアクション</p>
          <p className="mt-1 text-sm font-semibold text-[#2B2B2B]">{log.nextAction.title}</p>
          <p className="mt-1 text-xs font-semibold text-[#8A8A8A]">{log.nextAction.dueAt?.toDate().toLocaleString("ja-JP") ?? "期限未設定"}</p>
        </div>
      ) : null}
    </article>
  );
}

function MeetingsTab({ meetings, onCreate }: { meetings: CompanyMeeting[]; onCreate: () => void }) {
  return <div><button className="mb-4 h-10 rounded-full bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onCreate} type="button">＋ 打ち合わせ情報を入力</button><div className="grid gap-3">{meetings.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">打ち合わせはまだありません。</p> : meetings.map((meeting) => <div className="rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={meeting.id}><p className="text-sm font-bold text-[#777]">{meeting.startAt.toDate().toLocaleString("ja-JP")} / {meeting.source === "manual" ? "手動入力" : "録音アップロード"}</p><h4 className="mt-1 font-bold text-[#2B2B2B]">{meeting.title}</h4><p className="mt-2 text-xs font-bold text-[#8A8186]">商材: {meeting.productNames?.join(" / ") || "未設定"} / 先方: {meeting.contactNames?.join(" / ") || meeting.participants?.join(" / ") || "未設定"}</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#6F676B]">{meeting.summary || "内容未登録"}</p>{meeting.nextActions?.length ? <p className="mt-2 text-sm font-bold text-[#D94F6E]">次回アクション: {meeting.nextActions.join(" / ")}</p> : null}</div>)}</div></div>;
}

function TasksTab({ tasks }: { tasks: Parameters<typeof TaskCard>[0]["task"][] }) {
  return <div className="space-y-3">{tasks.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">会社に紐づくタスクはありません。</p> : tasks.map((task) => <TaskCard canEdit={false} key={task.id} onOpen={() => undefined} onToggle={() => undefined} task={task} />)}</div>;
}

function DealsTab() {
  return <p className="rounded-lg border border-dashed border-[#F0E7E9] p-8 text-center text-sm font-bold text-[#8A8A8A]">案件・商談は、今後の商談管理機能と接続します。</p>;
}

function FilesTab({ files, onUpload }: { files: Array<{ id: string; name: string; url: string; createdAt: { toDate: () => Date }; createdByName?: string; size?: number }>; onUpload: (file: File, onProgress: (progress: number) => void) => Promise<void> }) {
  const [progress, setProgress] = useState(0);
  return <div><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[#EC6F8B] px-4 text-sm font-bold text-white"><FileUp className="h-4 w-4" />ファイル追加<input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file, setProgress); }} /></label>{progress > 0 ? <span className="ml-3 text-sm font-bold text-[#EC6F8B]">{progress}%</span> : null}<div className="mt-4 grid gap-3">{files.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">ファイルはまだありません。</p> : files.map((file) => <a className="rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-sm font-bold text-[#2B2B2B]" href={file.url} key={file.id} rel="noreferrer" target="_blank">{file.name}<span className="ml-3 text-xs text-[#777]">{file.createdByName ?? ""} / {file.createdAt.toDate().toLocaleString("ja-JP")}</span></a>)}</div></div>;
}

function NotesTab({ memos, onCreate }: { memos: Array<{ id: string; title: string; content: string; pinned: boolean; createdByName?: string; createdAt: { toDate: () => Date } }>; onCreate: () => void }) {
  return <div><button className="mb-4 h-10 rounded-full bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onCreate} type="button">メモを追加</button><div className="grid gap-3">{memos.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">メモはまだありません。</p> : memos.sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((memo) => <div className="rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={memo.id}><h4 className="font-bold text-[#2B2B2B]">{memo.pinned ? "固定: " : ""}{memo.title}</h4><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#6F676B]">{memo.content}</p><p className="mt-2 text-xs font-semibold text-[#777]">{memo.createdByName ?? ""} / {memo.createdAt.toDate().toLocaleString("ja-JP")}</p></div>)}</div></div>;
}

function CompanyFormModal({ mode, company, currentUser, members, products, onClose, onSubmit }: { mode: "create" | "edit"; company?: Company; currentUser: { id: string; name: string }; members: Array<{ uid: string; name: string; email: string }>; products: Product[]; onClose: () => void; onSubmit: (patch: Partial<Company>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: company?.name ?? "",
    nameKana: company?.nameKana ?? "",
    industry: company?.industry ?? "",
    companyType: company?.companyType ?? "",
    address: company?.address ?? "",
    website: company?.website ?? "",
    status: company?.status ?? "lead",
    customerRank: company?.customerRank ?? "C",
    internalOwnerId: company?.internalOwnerId ?? currentUser.id,
    internalOwnerName: company?.internalOwnerName ?? currentUser.name,
    companionUserIds: company?.companionUserIds ?? [],
    companionNames: company?.companionNames ?? [],
    productIds: company?.productIds ?? [],
    productNames: company?.productNames ?? [],
    contacts: company?.contacts?.length ? company.contacts : [{ id: crypto.randomUUID(), name: company?.primaryContactName ?? "", email: company?.email ?? "", phone: company?.phone ?? "" }],
    tags: company?.tags.join(", ") ?? "",
    notes: company?.notes ?? ""
  });
  const [companionsOpen, setCompanionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedCompanions = members.filter((member) => form.companionUserIds.includes(member.uid));
  const selectedProducts = products.filter((product) => form.productIds.includes(product.id));
  const toggleCompanion = (member: { uid: string; name: string }) => {
    const selected = form.companionUserIds.includes(member.uid);
    const companionUserIds = selected ? form.companionUserIds.filter((uid) => uid !== member.uid) : [...form.companionUserIds, member.uid];
    const companionNames = members.filter((item) => companionUserIds.includes(item.uid)).map((item) => item.name);
    setForm({ ...form, companionUserIds, companionNames });
  };
  const updateContact = (contactId: string, patch: Partial<{ name: string; email: string; phone: string }>) => {
    setForm({ ...form, contacts: form.contacts.map((contact) => (contact.id === contactId ? { ...contact, ...patch } : contact)) });
  };
  const addContact = () => setForm({ ...form, contacts: [...form.contacts, { id: crypto.randomUUID(), name: "", email: "", phone: "" }] });
  const removeContact = (contactId: string) => setForm({ ...form, contacts: form.contacts.filter((contact) => contact.id !== contactId) });
  const toggleProduct = (productId: string) => setForm((current) => ({ ...current, productIds: current.productIds.includes(productId) ? current.productIds.filter((id) => id !== productId) : [...current.productIds, productId] }));
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const contacts = form.contacts.map((contact) => ({ ...contact, name: contact.name.trim(), email: contact.email?.trim() ?? "", phone: contact.phone?.trim() ?? "" })).filter((contact) => contact.name || contact.email || contact.phone);
    const primaryContact = contacts[0] ?? null;
    await onSubmit({
      ...form,
      contacts,
      primaryContactId: primaryContact?.id ?? null,
      phone: primaryContact?.phone ?? "",
      email: primaryContact?.email ?? "",
      primaryContactName: primaryContact?.name ?? "",
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      internalOwnerId: form.internalOwnerId || currentUser.id,
      internalOwnerName: form.internalOwnerName || currentUser.name,
      companionNames: selectedCompanions.map((member) => member.name),
      productNames: selectedProducts.map((product) => product.name)
    });
    setSaving(false);
  };
  return (
    <Modal title={mode === "create" ? "新しい会社を追加" : "会社情報を編集"} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="会社名" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Input label="会社名カナ" value={form.nameKana} onChange={(nameKana) => setForm({ ...form, nameKana })} />
        <Input label="業種" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
        <Input label="所在地" value={form.address} onChange={(address) => setForm({ ...form, address })} />
        <Input label="Webサイト" value={form.website} onChange={(website) => setForm({ ...form, website })} />
        <Field label="関連商材">
          <div className="grid max-h-56 gap-2 overflow-auto rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-2">
            {products.length ? products.map((product) => <CheckboxRow checked={form.productIds.includes(product.id)} key={product.id} label={product.name} subLabel={product.tagline} onChange={() => toggleProduct(product.id)} />) : <p className="px-3 py-3 text-sm font-bold text-[#8A8186]">商材が未登録です。</p>}
          </div>
        </Field>
        <Field label="社内担当者">
          <div className="flex h-11 items-center rounded-md border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#655D62]">{form.internalOwnerName || currentUser.name}</div>
        </Field>
        <Field label="同行者">
          <button className="min-h-11 w-auto min-w-56 max-w-full justify-self-start rounded-md border border-[#F0E7E9] bg-[#FFFBFC] px-3 py-2 text-left transition hover:bg-white" onClick={() => setCompanionsOpen((current) => !current)} type="button">
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-[#EC6F8B]" />
                {selectedCompanions.length ? selectedCompanions.map((member) => <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#D94F6E] ring-1 ring-[#F7CAD2]" key={member.uid}>{member.name}</span>) : <span className="text-sm font-bold text-[#9A9296]">同行者を選択</span>}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-[#EC6F8B] transition ${companionsOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {companionsOpen ? (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-[#F0E7E9] bg-white p-2 shadow-sm">
              {members.length === 0 ? <p className="px-3 py-4 text-sm font-bold text-[#8A8186]">Authユーザーを取得できませんでした。</p> : null}
              {members.filter((member) => member.uid !== form.internalOwnerId).map((member) => {
                const checked = form.companionUserIds.includes(member.uid);
                return (
                  <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-bold transition ${checked ? "bg-[#FFF0F3] text-[#D94F6E]" : "text-[#5E565A] hover:bg-[#FFFBFC]"}`} key={member.uid}>
                    <input checked={checked} className="sr-only" onChange={() => toggleCompanion(member)} type="checkbox" />
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${checked ? "border-[#EC6F8B] bg-[#EC6F8B] text-white" : "border-[#E3D7DA] bg-white text-transparent"}`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{member.name}</span>
                      {member.email ? <span className="block truncate text-xs text-[#8A8186]">{member.email}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </Field>
        <Field label="先方担当者">
          <div className="grid gap-3">
            {form.contacts.map((contact, index) => (
              <div className="grid gap-2 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-3" key={contact.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-[#8A8186]">担当者 {index + 1}</p>
                  {form.contacts.length > 1 ? <button className="text-xs font-bold text-[#D94F6E]" onClick={() => removeContact(contact.id)} type="button">削除</button> : null}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <input className="task-input" placeholder="担当者名" value={contact.name} onChange={(event) => updateContact(contact.id, { name: event.target.value })} />
                  <input className="task-input" placeholder="メールアドレス" value={contact.email ?? ""} onChange={(event) => updateContact(contact.id, { email: event.target.value })} />
                  <input className="task-input" placeholder="電話番号" value={contact.phone ?? ""} onChange={(event) => updateContact(contact.id, { phone: event.target.value })} />
                </div>
              </div>
            ))}
            <button className="h-10 rounded-full border border-[#F0E7E9] bg-white text-sm font-bold text-[#EC6F8B]" onClick={addContact} type="button">担当者を追加</button>
          </div>
        </Field>
      </div>
      <Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.name.trim()} />
    </Modal>
  );
}

function LogFormModal({ company, currentUser, existingTasks, members, onClose, onSubmit }: { company: Company; currentUser: { id: string; name: string }; existingTasks: Array<{ title: string; status: string }>; members: Array<{ uid: string; name: string; email: string }>; onClose: () => void; onSubmit: (input: Parameters<ReturnType<typeof useCompanies>["addLog"]>[1], generateTasks: boolean) => Promise<void> }) {
  const contacts = company.contacts?.length ? company.contacts : [{ id: "primary", name: company.primaryContactName ?? "", email: company.email ?? "", phone: company.phone ?? "" }].filter((contact) => contact.name || contact.email || contact.phone);
  const [form, setForm] = useState({ type: "phone" as ActivityLogType, direction: "outbound" as ActivityDirection, occurredAt: toDatetimeLocalValue(new Date()), title: "", actorUserIds: [currentUser.id].filter(Boolean), contactIds: contacts[0]?.id ? [contacts[0].id] : [], contactNote: "", content: "", nextActionTitle: "", nextActionDue: "", aiTaskRequested: false });
  const [saving, setSaving] = useState(false);
  const selectedActors = members.filter((member) => form.actorUserIds.includes(member.uid));
  const selectedContacts = contacts.filter((contact) => form.contactIds.includes(contact.id));
  const toggleActor = (uid: string) => setForm((current) => ({ ...current, actorUserIds: current.actorUserIds.includes(uid) ? current.actorUserIds.filter((id) => id !== uid) : [...current.actorUserIds, uid] }));
  const toggleContact = (contactId: string) => setForm((current) => ({ ...current, contactIds: current.contactIds.includes(contactId) ? current.contactIds.filter((id) => id !== contactId) : [...current.contactIds, contactId] }));
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSubmit({
      type: form.type,
      direction: form.direction,
      title: form.title,
      content: form.content,
      occurredAt: Timestamp.fromDate(new Date(form.occurredAt)),
      source: "manual",
      actorUserIds: form.actorUserIds,
      actorNames: selectedActors.map((member) => member.name),
      contactIds: form.contactIds,
      contactNames: selectedContacts.map((contact) => contact.name || contact.email || contact.phone || "先方担当者"),
      contactNote: form.contactNote,
      aiTaskRequested: form.aiTaskRequested,
      nextAction: form.nextActionTitle ? { title: form.nextActionTitle, dueAt: form.nextActionDue ? Timestamp.fromDate(new Date(form.nextActionDue)) : null, assigneeId: currentUser.id } : null
    }, form.aiTaskRequested);
    setSaving(false);
  };
  return (
    <Modal title={`${company.name} のログを追加`} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="ログ種類" value={form.type} options={(["phone", "email", "visit", "memo", "file", "other"] as ActivityLogType[]).map((type) => [type, activityTypeLabels[type]])} onChange={(type) => setForm({ ...form, type: type as ActivityLogType })} />
        <Select label="アクション方向" value={form.direction} options={Object.entries(activityDirectionLabels)} onChange={(direction) => setForm({ ...form, direction: direction as ActivityDirection })} />
        <Input label="日時" value={form.occurredAt} type="datetime-local" onChange={(occurredAt) => setForm({ ...form, occurredAt })} />
        <Input label="タイトル" required value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Field label="社内側">
          <div className="grid gap-2 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-2">
            {members.map((member) => {
              const checked = form.actorUserIds.includes(member.uid);
              return <CheckboxRow checked={checked} key={member.uid} label={member.name} subLabel={member.email} onChange={() => toggleActor(member.uid)} />;
            })}
          </div>
        </Field>
        <Field label="先方側">
          <div className="grid gap-2 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-2">
            {contacts.length ? contacts.map((contact) => {
              const checked = form.contactIds.includes(contact.id);
              return <CheckboxRow checked={checked} key={contact.id} label={contact.name || "名前未設定"} subLabel={[contact.email, contact.phone].filter(Boolean).join(" / ")} onChange={() => toggleContact(contact.id)} />;
            }) : <p className="px-3 py-3 text-sm font-bold text-[#8A8186]">先方担当者が未登録です。</p>}
          </div>
        </Field>
        <Input label="相手メモ" value={form.contactNote} onChange={(contactNote) => setForm({ ...form, contactNote })} />
        <Input label="次のアクション" value={form.nextActionTitle} onChange={(nextActionTitle) => setForm({ ...form, nextActionTitle })} />
        <Input label="次のアクション期限" type="datetime-local" value={form.nextActionDue} onChange={(nextActionDue) => setForm({ ...form, nextActionDue })} />
        <div className="sm:col-span-2">
          <Text label={form.type === "email" ? "メール本文 / 内容" : "内容"} value={form.content} minHeight="min-h-48" onChange={(content) => setForm({ ...form, content })} />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[#655D62]"><input checked={form.aiTaskRequested} onChange={(event) => setForm({ ...form, aiTaskRequested: event.target.checked })} type="checkbox" />この内容からAIにタスクを作成してもらう</label>
        <p className="text-xs font-semibold text-[#8A8A8A]">未完了タスク: {existingTasks.filter((task) => task.status !== "completed").map((task) => task.title).join(" / ") || "なし"}</p>
      </div>
      <Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim() || form.actorUserIds.length === 0} />
    </Modal>
  );
}

function MeetingFormModal({ company, products, onClose, onSubmit }: { company: Company; products: Product[]; onClose: () => void; onSubmit: (input: Parameters<ReturnType<typeof useCompanies>["addMeeting"]>[1], generateTasks: boolean) => Promise<void> }) {
  const contacts = company.contacts?.length ? company.contacts : [{ id: "primary", name: company.primaryContactName ?? "", email: company.email ?? "", phone: company.phone ?? "" }].filter((contact) => contact.name || contact.email || contact.phone);
  const [form, setForm] = useState({ startAt: toDatetimeLocalValue(new Date()), title: "", meetingType: "in_person" as CompanyMeeting["meetingType"], productIds: [] as string[], contactIds: contacts[0]?.id ? [contacts[0].id] : [] as string[], summary: "", nextActions: "", aiTaskRequested: false });
  const [saving, setSaving] = useState(false);
  const selectedProducts = products.filter((product) => form.productIds.includes(product.id));
  const selectedContacts = contacts.filter((contact) => form.contactIds.includes(contact.id));
  const toggleProduct = (productId: string) => setForm((current) => ({ ...current, productIds: current.productIds.includes(productId) ? current.productIds.filter((id) => id !== productId) : [...current.productIds, productId] }));
  const toggleContact = (contactId: string) => setForm((current) => ({ ...current, contactIds: current.contactIds.includes(contactId) ? current.contactIds.filter((id) => id !== contactId) : [...current.contactIds, contactId] }));
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSubmit({
      title: form.title,
      startAt: Timestamp.fromDate(new Date(form.startAt)),
      meetingType: form.meetingType,
      productIds: form.productIds,
      productNames: selectedProducts.map((product) => product.name),
      contactIds: form.contactIds,
      contactNames: selectedContacts.map((contact) => contact.name || contact.email || contact.phone || "先方担当者"),
      participants: selectedContacts.map((contact) => contact.name || contact.email || contact.phone || "先方担当者"),
      summary: form.summary,
      customerQuotes: [],
      problems: [],
      proposals: [],
      objections: [],
      decisions: [],
      nextActions: lines(form.nextActions),
      source: "manual",
      uploadedRecording: false,
      aiTaskRequested: form.aiTaskRequested
    }, form.aiTaskRequested);
    setSaving(false);
  };
  return (
    <Modal title={`${company.name} の打ち合わせ情報を入力`} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="打ち合わせ日時" type="datetime-local" value={form.startAt} onChange={(startAt) => setForm({ ...form, startAt })} />
        <Select label="打ち合わせ方法" value={form.meetingType} options={[["in_person", "対面"], ["online", "オンライン"], ["phone", "電話"], ["visit", "訪問"], ["other", "その他"]]} onChange={(meetingType) => setForm({ ...form, meetingType: meetingType as CompanyMeeting["meetingType"] })} />
        <Input label="タイトル" required value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Field label="関連商材">
          <div className="grid max-h-56 gap-2 overflow-auto rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-2">
            {products.length ? products.map((product) => <CheckboxRow checked={form.productIds.includes(product.id)} key={product.id} label={product.name} subLabel={product.tagline} onChange={() => toggleProduct(product.id)} />) : <p className="px-3 py-3 text-sm font-bold text-[#8A8186]">商材が未登録です。</p>}
          </div>
        </Field>
        <Field label="先方参加者">
          <div className="grid max-h-56 gap-2 overflow-auto rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-2">
            {contacts.length ? contacts.map((contact) => <CheckboxRow checked={form.contactIds.includes(contact.id)} key={contact.id} label={contact.name || "名前未設定"} subLabel={[contact.email, contact.phone].filter(Boolean).join(" / ")} onChange={() => toggleContact(contact.id)} />) : <p className="px-3 py-3 text-sm font-bold text-[#8A8186]">先方担当者が未登録です。</p>}
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Text label="内容" value={form.summary} minHeight="min-h-64" onChange={(summary) => setForm({ ...form, summary })} />
        </div>
        <div className="sm:col-span-2">
          <Text label="次回アクション" value={form.nextActions} minHeight="min-h-28" onChange={(nextActions) => setForm({ ...form, nextActions })} />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[#655D62]"><input checked={form.aiTaskRequested} onChange={(event) => setForm({ ...form, aiTaskRequested: event.target.checked })} type="checkbox" />保存後、AIにタスクを細かく作成してもらう</label>
      </div>
      <Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim()} />
    </Modal>
  );
}

function MemoFormModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { title: string; content: string; pinned: boolean }) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", content: "", pinned: false });
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); await onSubmit(form); setSaving(false); };
  return <Modal title="メモを追加" onClose={onClose}><div className="grid gap-4"><Input label="タイトル" required value={form.title} onChange={(title) => setForm({ ...form, title })} /><Text label="内容" value={form.content} onChange={(content) => setForm({ ...form, content })} /><label className="flex items-center gap-2 text-sm font-bold text-[#655D62]"><input checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} type="checkbox" />固定表示</label></div><Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim()} /></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm"><section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg border border-[#F0E7E9] bg-white p-5 shadow-2xl"><h2 className="text-2xl font-bold text-[#2B2B2B]">{title}</h2><div className="mt-5">{children}</div></section></div>;
}

function Actions({ saving, disabled, onClose, onSave }: { saving: boolean; disabled: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="mt-6 flex justify-end gap-3"><button className="h-11 rounded-full border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button><button className="h-11 rounded-full bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || disabled} onClick={onSave} type="button">保存</button></div>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return <div className="grid gap-4">{rows.map(([label, value]) => <div className="grid gap-2 md:grid-cols-[150px_1fr]" key={label}><p className="text-sm font-bold text-[#777]">{label}</p><p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#2B2B2B]">{value}</p></div>)}</div>;
}

function formatContacts(company: Company): string {
  const contacts = company.contacts?.length ? company.contacts : [{ id: "primary", name: company.primaryContactName ?? "", email: company.email ?? "", phone: company.phone ?? "" }];
  const rows = contacts
    .map((contact) => [contact.name || "名前未設定", contact.email, contact.phone].filter(Boolean).join(" / "))
    .filter(Boolean);
  return rows.length ? rows.join("\n") : "未設定";
}

function formatActivityParties(log: CompanyActivityLog): string {
  const actors = log.actorNames?.length ? log.actorNames.join(" / ") : getUserDisplayNameById(log.userId, log.userName);
  const contacts = log.contactNames?.length ? log.contactNames.join(" / ") : log.contactNote || "先方未設定";
  if (log.direction === "inbound") return `先方: ${contacts} → 社内: ${actors}`;
  if (log.direction === "internal") return `社内対応: ${actors}`;
  if (log.direction === "outbound") return `社内: ${actors} → 先方: ${contacts}`;
  return `担当: ${actors} / 相手: ${contacts}`;
}

function Input({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]"><span className="inline-flex items-center gap-2">{label}{required ? <span className="h-1.5 w-1.5 rounded-full bg-[#EC6F8B]" /> : null}</span><input className="task-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2 text-sm font-bold text-[#655D62]"><span>{label}</span>{children}</div>;
}

function Text({ label, value, onChange, minHeight = "min-h-24" }: { label: string; value: string; onChange: (value: string) => void; minHeight?: string }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<textarea className={`task-input ${minHeight} resize-none`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<select className="task-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([nextValue, nextLabel]) => <option key={nextValue} value={nextValue}>{nextLabel}</option>)}</select></label>;
}

function CheckboxRow({ checked, label, subLabel, onChange }: { checked: boolean; label: string; subLabel?: string; onChange: () => void }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-bold transition ${checked ? "bg-[#FFF0F3] text-[#D94F6E]" : "text-[#5E565A] hover:bg-white"}`}>
      <input checked={checked} className="sr-only" onChange={onChange} type="checkbox" />
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${checked ? "border-[#EC6F8B] bg-[#EC6F8B] text-white" : "border-[#E3D7DA] bg-white text-transparent"}`}>
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {subLabel ? <span className="block truncate text-xs text-[#8A8186]">{subLabel}</span> : null}
      </span>
    </label>
  );
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

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function createSuggestedTasks(company: Company, input: { title: string; content?: string; occurredAt: Timestamp; type?: ActivityLogType; meetingId?: string; meetingTitle?: string; productNames?: string[]; contactNames?: string[] }, user: { id: string; name: string }, authUser?: { getIdToken: () => Promise<string> } | null) {
  if (!window.confirm("内容と次回アクションからAIタスクを作成しますか？")) return;
  const suggestions = await fetchTaskSuggestions(company, input, authUser);
  const drafts: TaskDraft[] = suggestions.map((task) => ({
    title: `${company.name}: ${task.title}`,
    description: task.description || `${input.title}\n${input.content ?? ""}`.trim(),
    status: "todo",
    priority: task.priority,
    source: "ai",
    assigneeId: user.id,
    assigneeName: user.name,
    companyId: company.id,
    companyName: company.name,
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
