"use client";

import { Archive, Bookmark, CalendarDays, Check, CheckCircle2, Edit2, FileUp, Mail, MoreHorizontal, Phone, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskCard } from "@/components/tasks/TaskCard";
import { SkeletonList } from "@/components/ui/loading";
import { MultiSelect, SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { useCompanies } from "@/hooks/useCompanies";
import { activityTone, activityTypeLabels, monthKey } from "@/lib/company-utils";
import { activityTypeLabels as commonActivityTypeLabels } from "@/lib/lead-utils";
import { subscribeProductsMaster } from "@/lib/products";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import { createTask } from "@/lib/tasks";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayNameById } from "@/lib/user-display";
import type { ActivityLogType, Company, CompanyActivityLog, CompanyContactPerson, CompanyDecisionInfo, CompanyMeeting, CompanyProductAccountAccess, CompanyProductAccountCredential, CompanyProductSalesContext, ContactMethod, DealFinalResult } from "@/types/company";
import type { Product } from "@/types/product";
import type { Activity } from "@/types/lead";
import type { TaskDraft } from "@/types/task";
import type { TeleapoRecord } from "@/types/teleapo";

type SortKey = "lastContact" | "updated" | "name" | "owner";
type TabKey = "overview" | "timeline" | "deals" | "meetings" | "tasks" | "files" | "notes";

const tabs: Array<[TabKey, string]> = [["overview", "概要"], ["timeline", "活動ログ"], ["deals", "案件・商談"], ["meetings", "打ち合わせ"], ["tasks", "タスク"], ["files", "ファイル"], ["notes", "メモ"]];
const sortOptions: Array<[SortKey, string]> = [["lastContact", "最終接触日が新しい順"], ["updated", "更新日が新しい順"], ["name", "会社名順"], ["owner", "担当者順"]];

const contactMethodOptions: Array<[ContactMethod, string]> = [["phone", "電話"], ["email", "メール"], ["chat", "チャット"]];

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
  const [analysisRecords, setAnalysisRecords] = useState<TeleapoRecord[]>([]);

  useEffect(() => {
    if (!store.user) return undefined;
    let cancelled = false;
    void store.user.getIdToken()
      .then(async (token) => {
        const response = await fetch("/api/users/members", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("メンバーを取得できませんでした");
        return safeJson<{ members: Array<{ uid: string; name: string; email: string }> }>(response);
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

  useEffect(() => {
    if (query === q) return undefined;
    const timer = window.setTimeout(() => setRoute({ q: query }), 300);
    return () => window.clearTimeout(timer);
  }, [q, query, setRoute]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return store.companies
      .filter((company) => company.status !== "archived")
      .filter((company) => !needle || [company.name, company.nameKana, company.primaryContactName, company.contacts?.map((contact) => [contact.name, contact.role, contact.email, contact.phone, formatContactMethods(contact.contactMethods)].join(" ")).join(" "), company.industry, company.address, company.phone, company.email, company.tags.join(" "), company.internalOwnerName, company.companionNames?.join(" ")].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ja");
        if (sort === "owner") return (a.internalOwnerName ?? "").localeCompare(b.internalOwnerName ?? "", "ja");
        if (sort === "updated") return b.updatedAt.toMillis() - a.updatedAt.toMillis();
        return (b.lastContactAt?.toMillis() ?? 0) - (a.lastContactAt?.toMillis() ?? 0);
      });
  }, [q, sort, store.companies]);

  const selectedCompany = selectedId ? filtered.find((company) => company.id === selectedId) ?? null : null;

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="">
      {!selectedCompany ? (
        <PageHeader
          title="会社一覧"
          description="取引先企業を管理・把握できます"
          actions={<button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しい会社を追加</button>}
        />
      ) : null}
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className={selectedCompany ? "" : "mt-4"}><StatusBanner message={store.error} type="error" /></div>
      <div className={selectedCompany ? "mt-0" : "mt-5"}>
        {!selectedCompany ? (
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <label className="flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#777]">
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="会社名・担当者・業種で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Search className="h-4 w-4" />
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#6F676B]">{filtered.length}件の会社</p>
            <div className="w-48">
              <SingleSelect options={sortOptions.map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setSort(value as SortKey)} />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {store.loading ? <CompanySkeleton /> : null}
            {!store.loading && filtered.length === 0 ? <EmptyCompanies hasQuery={Boolean(q)} onCreate={() => setCreateOpen(true)} /> : null}
            {filtered.map((company) => <CompanyListItem active={false} company={company} favorite={company.favoriteUserIds.includes(store.user?.uid ?? "")} key={company.id} onFavorite={() => void store.toggleFavorite(company)} onSelect={() => setRoute({ id: company.id, tab: "overview" })} />)}
          </div>
        </section>
        ) : (
        <section className="min-w-0">
            <div className="space-y-4">
              <CompanyDetailHeader company={selectedCompany} canDelete={store.isAdmin} favorite={selectedCompany.favoriteUserIds.includes(store.user?.uid ?? "")} onBack={showCompanyList} onDelete={() => { void store.deleteCompany(selectedCompany.id); showCompanyList(); }} onEdit={() => setEditCompany(selectedCompany)} onFavorite={() => void store.toggleFavorite(selectedCompany)} onLog={() => setLogOpen(true)} />
              <div className="rounded-none border border-[#F0E7E9] bg-white shadow-sm">
                <div className="flex overflow-x-auto border-b border-[#F0E7E9]">{tabs.map(([value, label]) => <button className={`h-12 shrink-0 px-5 text-sm font-bold ${selectedTab === value ? "border-b-2 border-[#EC6F8B] text-[#EC6F8B]" : "text-[#6F676B]"}`} key={value} onClick={() => setRoute({ id: selectedCompany.id, tab: value })} type="button">{label}</button>)}</div>
                <div className="p-5">
                  {selectedTab === "overview" ? <OverviewTab company={selectedCompany} products={products} tasks={store.tasks} /> : null}
                  {selectedTab === "timeline" ? <TimelineTab commonActivities={store.commonActivities} logs={store.logs} records={analysisRecords} company={selectedCompany} onMore={() => setLogLimit((current) => current + 30)} /> : null}
                  {selectedTab === "deals" ? <DealsTab company={selectedCompany} records={analysisRecords} /> : null}
                  {selectedTab === "meetings" ? <MeetingsTab meetings={store.meetings} onCreate={() => setMeetingOpen(true)} /> : null}
                  {selectedTab === "tasks" ? <TasksTab tasks={store.tasks} /> : null}
                  {selectedTab === "files" ? <FilesTab files={store.files} onUpload={(file, onProgress) => store.uploadFile(selectedCompany.id, file, onProgress)} /> : null}
                  {selectedTab === "notes" ? <NotesTab currentUserId={store.user?.uid ?? ""} isAdmin={store.isAdmin} memos={store.memos} onCreate={() => setMemoOpen(true)} onDelete={async (memoId) => { await store.deleteMemo(selectedCompany.id, memoId); flash("メモを削除しました"); }} onUpdate={async (memoId, input) => { await store.updateMemo(selectedCompany.id, memoId, input); flash("メモを更新しました"); }} /> : null}
                </div>
              </div>
            </div>
        </section>
        )}
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
  const primaryContact = getPrimaryContactLabel(company);

  return <button className={`grid w-full grid-cols-[1fr_32px] gap-3 rounded-none border p-3 text-left ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} onClick={onSelect} type="button"><span className="min-w-0"><span className="block truncate font-bold text-[#2B2B2B]">{company.name}</span><span className="mt-1 block truncate text-sm font-semibold text-[#777]">{company.industry || "業種未設定"}</span>{primaryContact ? <span className="mt-2 block truncate text-xs font-semibold text-[#777]">先方: {primaryContact}</span> : null}</span><span role="button" tabIndex={0} className="grid h-8 w-8 place-items-center text-[#EC6F8B]" onClick={(event) => { event.stopPropagation(); onFavorite(); }} onKeyDown={(event) => { if (event.key === "Enter") onFavorite(); }}><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></span></button>;
}

function CompanyDetailHeader({ company, favorite, canDelete, onBack, onFavorite, onEdit, onLog, onDelete }: { company: Company; favorite: boolean; canDelete: boolean; onBack: () => void; onFavorite: () => void; onEdit: () => void; onLog: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  return <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><button className="mb-2 text-sm font-bold text-[#EC6F8B]" onClick={onBack} type="button">一覧へ戻る</button><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-[#2B2B2B]">{company.name}</h2><button className="text-[#EC6F8B]" onClick={onFavorite} type="button"><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></button></div>{company.industry ? <p className="mt-2 text-sm font-semibold text-[#777]">{company.industry}</p> : null}</div><div className="relative flex flex-wrap gap-2"><button className="h-10 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" onClick={onEdit} type="button"><Edit2 className="mr-2 inline h-4 w-4" />編集</button>{company.email ? <a className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" href={`mailto:${company.email}`}><Mail className="h-4 w-4" />メール</a> : null}{company.phone ? <a className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" href={`tel:${company.phone}`}><Phone className="h-4 w-4" />電話</a> : null}<button className="h-10 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onLog} type="button">ログを追加</button><button className="grid h-10 w-10 place-items-center rounded-none border border-[#F0E7E9]" onClick={() => setMenu((current) => !current)} type="button"><MoreHorizontal className="h-5 w-5" /></button>{menu ? <div className="absolute right-0 top-12 z-10 grid w-40 gap-1 rounded-none border border-[#F0E7E9] bg-white p-2 shadow-lg"><button className="h-9 rounded-none text-left text-sm font-bold text-[#6F676B]" onClick={() => void navigator.clipboard.writeText(window.location.href)} type="button">URLをコピー</button><button className="h-9 rounded-none text-left text-sm font-bold text-[#6F676B]" type="button"><Archive className="mr-2 inline h-4 w-4" />アーカイブ</button>{canDelete ? <button className="h-9 rounded-none text-left text-sm font-bold text-[#D94F6E]" onClick={() => window.confirm("会社を削除しますか？") && onDelete()} type="button"><Trash2 className="mr-2 inline h-4 w-4" />削除</button> : null}</div> : null}</div></div></section>;
}

function OverviewTab({ company, products, tasks }: { company: Company; products: Product[]; tasks: Array<{ status: string; dueDate?: { toDate: () => Date } | null; title: string; assigneeName?: string }> }) {
  const nextTask = tasks.filter((task) => task.status !== "completed").sort((a, b) => (a.dueDate?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER))[0];
  const hasCommoProduct = companyHasCommoProduct(company, products);
  const rows: Array<[string, string]> = [
    ["会社名", company.name],
    ["業種", company.industry || "未設定"],
    ["地域", [company.prefecture, company.city].filter(Boolean).join(" / ") || "未設定"],
    ["所在地", company.address || "未設定"],
    ["Webサイト", company.website || "未設定"],
    ["関連商材", company.productNames?.join(" / ") || "未設定"],
    ["営業担当者", company.internalOwnerName || "未設定"],
    ["同行者", company.companionNames?.join(" / ") || "未設定"],
    ["先方担当者", formatContacts(company)],
    ["決裁・予算", formatDecisionInfo(company.decisionInfo)],
  ];
  if (hasCommoProduct) {
    rows.push(["commo. 営業情報", formatCommoContext(company.productSalesContext?.commo)]);
  }
  rows.push(
    ["最終接触日", company.lastContactAt?.toDate().toLocaleString("ja-JP") ?? "未接触"],
    ["次回アクション", nextTask ? `${nextTask.title} / ${nextTask.dueDate?.toDate().toLocaleDateString("ja-JP") ?? "期限未設定"} / ${nextTask.assigneeName ?? "未設定"}` : company.nextActionTitle || "未設定"]
  );
  return <InfoGrid rows={rows} />;
}

type UnifiedCompanyTimelineItem =
  | { id: string; occurredAt: Timestamp; kind: "legacy"; log: CompanyActivityLog }
  | { id: string; occurredAt: Timestamp; kind: "common"; activity: Activity }
  | { id: string; occurredAt: Timestamp; kind: "analysis"; record: TeleapoRecord };

function TimelineTab({ logs, commonActivities, records, company, onMore }: { logs: CompanyActivityLog[]; commonActivities: Activity[]; records: TeleapoRecord[]; company: Company; onMore: () => void }) {
  const commonLegacyIds = new Set(commonActivities.map((activity) => activity.legacyCompanyActivityLogId).filter(Boolean));
  const legacyItems: UnifiedCompanyTimelineItem[] = logs
    .filter((log) => log.source !== "system" && log.type !== "status_change" && !commonLegacyIds.has(log.id))
    .map((log) => ({ id: `legacy-${log.id}`, occurredAt: log.occurredAt, kind: "legacy", log }));
  const commonItems: UnifiedCompanyTimelineItem[] = commonActivities.map((activity) => ({ id: `common-${activity.id}`, occurredAt: activity.occurredAt, kind: "common", activity }));
  const analysisItems: UnifiedCompanyTimelineItem[] = records
    .filter((record) => record.companyId === company.id || (!record.companyId && record.customerName === company.name))
    .map((record) => ({ id: `analysis-${record.id}`, occurredAt: record.recordedAt, kind: "analysis", record }));
  const timelineItems = [...legacyItems, ...commonItems, ...analysisItems].sort((left, right) => right.occurredAt.toMillis() - left.occurredAt.toMillis());
  const groups = groupUnifiedByMonth(timelineItems);

  return (
    <div>
      {timelineItems.length === 0 ? <ActivityLogEmptyCard description="電話、メール、訪問、メモ、テレアポ、商談分析などの履歴を追加すると、ここに時系列で表示されます。" title="まだ活動ログがありません" /> : (
      <div className="space-y-8">
        {Object.entries(groups).map(([month, items]) => (
          <section key={month}>
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-sm font-black text-[#655D62]">{month}</h3>
              <span className="h-px flex-1 bg-[#F0E7E9]" />
              <span className="text-xs font-bold text-[#A0979B]">{items.length}件</span>
            </div>
            <div className="relative pl-9">
              <span className="absolute bottom-4 left-3 top-3 w-px bg-[#F0E7E9]" />
              <div className="grid gap-4">
                {items.map((item) => {
                  if (item.kind === "common") return <CommonActivityTimelineItem activity={item.activity} key={item.id} />;
                  if (item.kind === "analysis") return <AnalysisTimelineItem key={item.id} record={item.record} />;
                  return <ActivityTimelineItem key={item.id} log={item.log} />;
                })}
              </div>
            </div>
          </section>
        ))}
      </div>
      )}
      {logs.length > 0 ? <button className="mt-5 h-11 w-full rounded-none border border-[#F0E7E9] text-sm font-bold text-[#EC6F8B]" onClick={onMore} type="button">さらに過去の履歴を表示</button> : null}
    </div>
  );
}

function CommonActivityTimelineItem({ activity }: { activity: Activity }) {
  const occurredAt = activity.occurredAt.toDate();
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-black text-[#EC6F8B]">{commonActivityTypeLabels[activity.type]?.slice(0, 1) ?? "・"}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]">{commonActivityTypeLabels[activity.type]}</span>
        <span className="text-xs font-bold text-[#8A8186]">{occurredAt.toLocaleString("ja-JP")}</span>
      </div>
      <h3 className="mt-2 text-base font-black text-[#2B2B2B]">{activity.title || commonActivityTypeLabels[activity.type]}</h3>
      {activity.content ? <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#2B2B2B]">{activity.content}</p> : null}
      {activity.nextActionTitle ? <p className="mt-3 text-sm font-bold text-[#D94F6E]">次回予定: {activity.nextActionTitle} / {activity.nextActionAt?.toDate().toLocaleString("ja-JP") ?? "期限未設定"}</p> : null}
    </article>
  );
}

function AnalysisTimelineItem({ record }: { record: TeleapoRecord }) {
  const href = `/sales/analysis?dealId=${[record.companyId || record.customerName || "unknown-company", record.productId || record.productName || "unknown-product"].map(encodeURIComponent).join("__")}` as Route;
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-black text-[#EC6F8B]">分</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#EC6F8B]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
        <span className="text-xs font-bold text-[#8A8186]">{record.recordedAt.toDate().toLocaleString("ja-JP")}</span>
        {record.audioDownloadUrl ? <span className="rounded-none bg-white px-2 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0E7E9]">音声あり</span> : null}
        {record.aiAdvice ? <span className="rounded-none bg-white px-2 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0E7E9]">AI分析あり</span> : null}
      </div>
      <h3 className="mt-2 text-base font-black text-[#2B2B2B]">{record.meetingTitle || record.productName || "分析データ"}</h3>
      {record.audioDownloadUrl ? <audio className="mt-3 w-full" controls src={record.audioDownloadUrl} /> : null}
      <Link className="mt-3 inline-flex h-9 items-center rounded-none border border-[#F0E7E9] bg-white px-3 text-xs font-bold text-[#EC6F8B]" href={href}>分析詳細を見る</Link>
    </article>
  );
}

function ActivityTimelineItem({ log }: { log: CompanyActivityLog }) {
  const occurredAt = log.occurredAt.toDate();
  const time = occurredAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const date = occurredAt.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-black text-[#EC6F8B]">{activityTypeLabels[log.type]?.slice(0, 1) ?? "・"}</span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-none px-3 py-1 text-xs font-bold ${activityTone(log.type)}`}>{activityTypeLabels[log.type]}</span>
            <span className="text-xs font-bold text-[#8A8186]">{date} {time}</span>
          </div>
          <h3 className="mt-2 text-base font-black text-[#2B2B2B]">{log.title || "無題のログ"}</h3>
        </div>
        {log.nextAction?.title ? <span className="rounded-none bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#D94F6E]">次アクションあり</span> : null}
      </div>
      <dl className="mt-3 grid gap-2 text-sm font-semibold text-[#6F676B]">
        <div className="grid gap-1 md:grid-cols-[120px_1fr]"><dt className="font-bold text-[#8A8186]">対応者・相手先</dt><dd>{formatActivityParties(log)}</dd></div>
        {log.contactNote ? <div className="grid gap-1 md:grid-cols-[120px_1fr]"><dt className="font-bold text-[#8A8186]">相手メモ</dt><dd>{log.contactNote}</dd></div> : null}
      </dl>
      <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#2B2B2B]">{log.content || "内容は未登録です。"}</p>
      {log.nextAction?.title ? (
        <div className="mt-3 border-l-2 border-[#EC6F8B] bg-[#FFF7F8] px-3 py-2">
          <p className="text-xs font-black text-[#D94F6E]">次のアクション</p>
          <p className="mt-1 text-sm font-bold text-[#2B2B2B]">{log.nextAction.title}</p>
          <p className="mt-1 text-xs font-semibold text-[#8A8A8A]">{log.nextAction.dueAt?.toDate().toLocaleString("ja-JP") ?? "期限未設定"}</p>
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
        <h3 className="mt-4 text-base font-bold text-[#2B2B2B]">{title}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#8A8186]">{description}</p>
      </div>
    </section>
  );
}

function MeetingsTab({ meetings, onCreate }: { meetings: CompanyMeeting[]; onCreate: () => void }) {
  return <div><button className="mb-4 h-10 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onCreate} type="button">＋ 打ち合わせ情報を入力</button><div className="grid gap-3">{meetings.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">打ち合わせはまだありません。</p> : meetings.map((meeting) => <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={meeting.id}><p className="text-sm font-bold text-[#777]">{meeting.startAt.toDate().toLocaleString("ja-JP")} / {meeting.source === "manual" ? "手動入力" : "録音アップロード"}</p><h4 className="mt-1 font-bold text-[#2B2B2B]">{meeting.title}</h4><p className="mt-2 text-xs font-bold text-[#8A8186]">商材: {meeting.productNames?.join(" / ") || "未設定"} / 先方: {meeting.contactNames?.join(" / ") || meeting.participants?.join(" / ") || "未設定"}</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#6F676B]">{meeting.summary || "内容未登録"}</p>{meeting.nextActions?.length ? <p className="mt-2 text-sm font-bold text-[#D94F6E]">次回アクション: {meeting.nextActions.join(" / ")}</p> : null}</div>)}</div></div>;
}

function TasksTab({ tasks }: { tasks: Parameters<typeof TaskCard>[0]["task"][] }) {
  return <div className="space-y-3">{tasks.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">会社に紐づくタスクはありません。</p> : tasks.map((task) => <TaskCard canEdit={false} currentUserId="" key={task.id} onOpen={() => undefined} onToggle={() => undefined} task={task} />)}</div>;
}

function DealsTab({ company, records }: { company: Company; records: TeleapoRecord[] }) {
  const companyRecords = records
    .filter((record) => record.companyId === company.id || (!record.companyId && record.customerName === company.name))
    .sort((left, right) => right.recordedAt.toMillis() - left.recordedAt.toMillis());

  if (companyRecords.length === 0) {
    return (
      <div className="rounded-none border border-dashed border-[#F0E7E9] bg-[#FFFBFC] p-8 text-center">
        <p className="text-sm font-bold text-[#2B2B2B]">分析済みの案件・商談はまだありません。</p>
        <p className="mt-2 text-sm font-semibold text-[#8A8186]">/sales/upload で会社一覧から反映してアップロードすると、ここに表示されます。</p>
        <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" href={"/sales/upload" as Route}>アップロードへ</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {companyRecords.map((record) => (
        <AnalysisDealCard key={record.id} record={record} />
      ))}
    </div>
  );
}

function AnalysisDealCard({ record }: { record: TeleapoRecord }) {
  const hasAdvice = record.aiAdviceStatus === "completed" && Boolean(record.aiAdvice);
  const score = record.aiAdvice?.prospectScore ?? record.aiAdvice?.meetingPreparation?.prospectScore.score ?? null;
  const rank = record.aiAdvice?.prospectRank ?? record.aiAdvice?.meetingPreparation?.prospectScore.rank ?? "";
  const summary = record.aiAdvice?.summary || record.aiAdvice?.meetingPreparation?.proposalStrategy.winningApproach.join(" / ") || record.transcriptText || "分析内容を確認できます。";
  return (
    <Link className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 transition hover:border-[#F7CAD2] lg:grid-cols-[1fr_auto]" href={`/sales/analysis?recordId=${record.id}` as Route}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-none bg-white px-2.5 py-1 text-xs font-bold text-[#EC6F8B] ring-1 ring-[#F0E7E9]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
          <span className={`inline-flex items-center gap-1 rounded-none px-2.5 py-1 text-xs font-bold ${hasAdvice ? "bg-[#EC6F8B] text-white" : "bg-white text-[#6F676B] ring-1 ring-[#F0E7E9]"}`}>
            {hasAdvice ? <Sparkles className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {hasAdvice ? "AI分析済み" : "話者分離済み"}
          </span>
          {rank || score !== null ? <span className="rounded-none bg-white px-2.5 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0E7E9]">{[rank, score !== null ? `${score}点` : ""].filter(Boolean).join(" / ")}</span> : null}
        </div>
        <h4 className="mt-3 truncate text-lg font-bold text-[#2B2B2B]">{record.productName || "商材未設定"}</h4>
        <p className="mt-1 text-sm font-semibold text-[#777]">{record.contactName || "先方担当者未設定"} / {record.userName || "担当未設定"}</p>
        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[#6F676B]">{summary}</p>
      </div>
      <div className="grid content-between gap-3 text-sm font-bold text-[#8A8186] lg:min-w-48 lg:text-right">
        <span className="inline-flex items-center gap-2 lg:justify-end"><CalendarDays className="h-4 w-4 text-[#EC6F8B]" />{record.recordedAt.toDate().toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}</span>
        <span>{record.conversationLogs.length}ブロック</span>
      </div>
    </Link>
  );
}

function FilesTab({ files, onUpload }: { files: Array<{ id: string; name: string; url: string; createdAt: { toDate: () => Date }; createdByName?: string; size?: number }>; onUpload: (file: File, onProgress: (progress: number) => void) => Promise<void> }) {
  const [progress, setProgress] = useState(0);
  return <div><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white"><FileUp className="h-4 w-4" />ファイル追加<input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file, setProgress); }} /></label>{progress > 0 ? <span className="ml-3 text-sm font-bold text-[#EC6F8B]">{progress}%</span> : null}<div className="mt-4 grid gap-3">{files.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">ファイルはまだありません。</p> : files.map((file) => <a className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-sm font-bold text-[#2B2B2B]" href={file.url} key={file.id} rel="noreferrer" target="_blank">{file.name}<span className="ml-3 text-xs text-[#777]">{file.createdByName ?? ""} / {file.createdAt.toDate().toLocaleString("ja-JP")}</span></a>)}</div></div>;
}

function NotesTab({
  memos,
  currentUserId,
  isAdmin,
  onCreate,
  onDelete,
  onUpdate
}: {
  memos: Array<{ id: string; title: string; content: string; pinned: boolean; createdBy: string; createdByName?: string; createdAt: { toDate: () => Date } }>;
  currentUserId: string;
  isAdmin: boolean;
  onCreate: () => void;
  onDelete: (memoId: string) => Promise<void>;
  onUpdate: (memoId: string, input: { title: string; content: string; pinned: boolean }) => Promise<void>;
}) {
  const sortedMemos = useMemo(() => [...memos].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime()), [memos]);
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
        <p className="text-sm font-bold text-[#6F676B]">{sortedMemos.length}件のメモ</p>
        <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onCreate} type="button"><Plus className="h-4 w-4" />メモを追加</button>
      </div>
      {sortedMemos.length === 0 ? <p className="text-sm font-bold text-[#8A8A8A]">メモはまだありません。</p> : (
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          {sortedMemos.map((memo) => {
            const active = selectedMemo?.id === memo.id;
            return (
              <button className={`w-full rounded-none border p-3 text-left transition ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} key={memo.id} onClick={() => setSelectedMemoId(memo.id)} type="button">
                <span className="block truncate text-sm font-black text-[#2B2B2B]">{memo.pinned ? "固定: " : ""}{memo.title || "無題のメモ"}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-[#8A8186]">{memo.createdByName ?? "作成者未設定"} / {memo.createdAt.toDate().toLocaleDateString("ja-JP")}</span>
              </button>
            );
          })}
        </div>
        <article className="min-h-80 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-5">
          {selectedMemo ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-lg font-black text-[#2B2B2B]">{selectedMemo.pinned ? "固定: " : ""}{selectedMemo.title || "無題のメモ"}</h4>
                  <p className="mt-1 text-xs font-semibold text-[#777]">{selectedMemo.createdByName ?? "作成者未設定"} / {selectedMemo.createdAt.toDate().toLocaleString("ja-JP")}</p>
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
      )}
      {editingMemo ? <MemoFormModal initial={editingMemo} mode="edit" onClose={() => setEditingMemo(null)} onSubmit={async (input) => { await onUpdate(editingMemo.id, input); setEditingMemo(null); }} /> : null}
    </div>
  );
}

function CompanyFormModal({ mode, company, currentUser, members, products, onClose, onSubmit }: { mode: "create" | "edit"; company?: Company; currentUser: { id: string; name: string }; members: Array<{ uid: string; name: string; email: string }>; products: Product[]; onClose: () => void; onSubmit: (patch: Partial<Company>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: company?.name ?? "",
    nameKana: company?.nameKana ?? "",
    industry: company?.industry ?? "",
    companyType: company?.companyType ?? "",
    prefecture: company?.prefecture ?? "",
    city: company?.city ?? "",
    region: "",
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
    productAccountAccess: normalizeProductAccountAccess(company?.productAccountAccess),
    productSalesContext: normalizeProductSalesContext(company?.productSalesContext),
    decisionInfo: normalizeDecisionInfo(company?.decisionInfo),
    contacts: company?.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: crypto.randomUUID(), name: company?.primaryContactName ?? "", role: "", email: company?.email ?? "", phone: company?.phone ?? "" })],
    tags: company?.tags.join(", ") ?? "",
    notes: company?.notes ?? ""
  });
  const [saving, setSaving] = useState(false);
  const selectedCompanions = members.filter((member) => form.companionUserIds.includes(member.uid));
  const selectedProducts = products.filter((product) => form.productIds.includes(product.id));
  const hasSnsProduct = selectedProducts.some(isSnsOperationProduct);
  const hasCommoProduct = selectedProducts.some(isCommoProduct);
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
  const updateProductAccount = (section: "instagram" | "tiktok" | "officialLine", key: keyof CompanyProductAccountCredential, value: string) => {
    setForm((current) => {
      const currentAccess = normalizeProductAccountAccess(current.productAccountAccess);
      if (section === "officialLine") {
        return { ...current, productAccountAccess: { ...currentAccess, commo: { officialLine: { ...currentAccess.commo?.officialLine, [key]: value } } } };
      }
      return { ...current, productAccountAccess: { ...currentAccess, sns: { ...currentAccess.sns, [section]: { ...currentAccess.sns?.[section], [key]: value } } } };
    });
  };
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
      productNames: selectedProducts.map((product) => product.name),
      productAccountAccess: compactProductAccountAccess(form.productAccountAccess, { sns: hasSnsProduct, commo: hasCommoProduct })
    });
    setSaving(false);
  };
  return (
    <Modal title={mode === "create" ? "新しい会社を追加" : "会社情報を編集"} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="会社名" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Input label="業種" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
        <Input label="都道府県" value={form.prefecture} onChange={(prefecture) => setForm({ ...form, prefecture })} />
        <Input label="市区町村" value={form.city} onChange={(city) => setForm({ ...form, city })} />
        <Input label="所在地" value={form.address} onChange={(address) => setForm({ ...form, address })} />
        <Input label="Webサイト" value={form.website} onChange={(website) => setForm({ ...form, website })} />
        <MultiSelect
          emptyLabel="商材が未登録です。"
          label="関連商材"
          options={products.map((product) => ({ value: product.id, label: product.name, description: product.tagline }))}
          placeholder="商材を選択"
          values={form.productIds}
          onChange={(productIds) => setForm((current) => ({ ...current, productIds }))}
        />
        {(hasSnsProduct || hasCommoProduct) ? (
          <div className="grid gap-3 sm:col-span-2">
            {hasSnsProduct ? (
              <div className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3">
                <p className="text-sm font-bold text-[#655D62]">SNS運用アカウント</p>
                <AccountAccessRow
                  accountLabel="Instagram アカウント名"
                  credential={form.productAccountAccess.sns?.instagram}
                  onChange={(key, value) => updateProductAccount("instagram", key, value)}
                />
                <AccountAccessRow
                  accountLabel="TikTok アカウント名"
                  credential={form.productAccountAccess.sns?.tiktok}
                  onChange={(key, value) => updateProductAccount("tiktok", key, value)}
                />
              </div>
            ) : null}
            {hasCommoProduct ? (
              <div className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3">
                <p className="text-sm font-bold text-[#655D62]">commo. 連携アカウント</p>
                <AccountAccessRow
                  accountLabel="公式LINE アカウント名"
                  credential={form.productAccountAccess.commo?.officialLine}
                  onChange={(key, value) => updateProductAccount("officialLine", key, value)}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {hasCommoProduct ? (
          <div className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 sm:col-span-2">
            <p className="text-sm font-bold text-[#655D62]">commo. 営業分析用情報</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="施設規模" value={form.productSalesContext.commo?.facilityScale ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { facilityScale: value }) }))} />
              <Input label="LINE活用状況" value={form.productSalesContext.commo?.currentLineUsage ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { currentLineUsage: value }) }))} />
              <Input label="OTA依存度" value={form.productSalesContext.commo?.otaDependency ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { otaDependency: value }) }))} />
              <Input label="既存CRM" value={form.productSalesContext.commo?.existingCrm ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { existingCrm: value }) }))} />
              <Input label="予約管理方法" value={form.productSalesContext.commo?.reservationManagement ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { reservationManagement: value }) }))} />
              <Input label="運用担当者" value={form.productSalesContext.commo?.operationOwner ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { operationOwner: value }) }))} />
              <Input label="リピーター状況" value={form.productSalesContext.commo?.repeatCustomerStatus ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { repeatCustomerStatus: value }) }))} />
              <Input label="休眠顧客状況" value={form.productSalesContext.commo?.dormantCustomerStatus ?? ""} onChange={(value) => setForm((current) => ({ ...current, productSalesContext: updateCommoContext(current.productSalesContext, { dormantCustomerStatus: value }) }))} />
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 sm:col-span-2">
          <p className="text-sm font-bold text-[#655D62]">決裁・予算情報</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="決裁者名" value={form.decisionInfo.decisionMakerName ?? ""} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, decisionMakerName: value } }))} />
            <Input label="決裁者役職" value={form.decisionInfo.decisionMakerRole ?? ""} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, decisionMakerRole: value } }))} />
            <Input label="予算感" value={form.decisionInfo.budgetRange ?? ""} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, budgetRange: value } }))} />
            <Input label="予算年度" value={form.decisionInfo.budgetYear ?? ""} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, budgetYear: value } }))} />
            <Input label="導入希望時期" value={form.decisionInfo.implementationTiming ?? ""} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, implementationTiming: value } }))} />
            <Field label="決裁者と接触済み">
              <button className={`h-11 rounded-none border px-3 text-left text-sm font-bold ${form.decisionInfo.decisionMakerContacted ? "border-[#EC6F8B] bg-[#FFF0F3] text-[#EC6F8B]" : "border-[#F0E7E9] bg-white text-[#6F676B]"}`} onClick={() => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, decisionMakerContacted: !current.decisionInfo.decisionMakerContacted } }))} type="button">{form.decisionInfo.decisionMakerContacted ? "接触済み" : "未接触 / 未確認"}</button>
            </Field>
            <Text label="競合（1行ずつ）" value={toLines(form.decisionInfo.competitors ?? [])} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, competitors: lines(value) } }))} />
            <Text label="稟議条件（1行ずつ）" value={toLines(form.decisionInfo.approvalConditions ?? [])} onChange={(value) => setForm((current) => ({ ...current, decisionInfo: { ...current.decisionInfo, approvalConditions: lines(value) } }))} />
          </div>
        </div>
        <Field label="社内担当者">
          <div className="flex h-11 items-center rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#655D62]">{form.internalOwnerName || currentUser.name}</div>
        </Field>
        <MultiSelect
          emptyLabel="Authユーザーを取得できませんでした。"
          label="同行者"
          options={members.filter((member) => member.uid !== form.internalOwnerId).map((member) => ({ value: member.uid, label: member.name, description: member.email }))}
          placeholder="同行者を選択"
          values={form.companionUserIds}
          onChange={(companionUserIds) => setForm((current) => ({ ...current, companionUserIds, companionNames: members.filter((member) => companionUserIds.includes(member.uid)).map((member) => member.name) }))}
        />
        <Field label="先方担当者">
          <div className="grid gap-3">
            {form.contacts.map((contact, index) => (
              <div className="grid gap-2 border-b border-[#F0E7E9] pb-3 last:border-b-0" key={contact.id}>
                <div className="grid gap-2 md:grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.8fr)]">
                  <input className="task-input" placeholder={`担当者名 ${index + 1}`} value={contact.name} onChange={(event) => updateContact(contact.id, { name: event.target.value })} />
                  <input className="task-input" placeholder="役職" value={contact.role ?? ""} onChange={(event) => updateContact(contact.id, { role: event.target.value })} />
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_minmax(180px,0.8fr)]">
                  <input className="task-input" placeholder="メールアドレス" value={contact.email ?? ""} onChange={(event) => updateContact(contact.id, { email: event.target.value })} />
                  <input className="task-input" placeholder="電話番号" value={contact.phone ?? ""} onChange={(event) => updateContact(contact.id, { phone: event.target.value })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {contactMethodOptions.map(([method, label]) => (
                    <ContactMethodToggle checked={(contact.contactMethods ?? []).includes(method)} key={method} label={label} onClick={() => toggleContactMethod(contact.id, method)} />
                  ))}
                  {form.contacts.length > 1 ? <button className="h-8 border border-[#F0E7E9] px-3 text-xs font-bold text-[#D94F6E]" onClick={() => removeContact(contact.id)} type="button">削除</button> : null}
                </div>
              </div>
            ))}
            <button className="h-10 rounded-none border border-[#F0E7E9] bg-white text-sm font-bold text-[#EC6F8B]" onClick={addContact} type="button">担当者を追加</button>
          </div>
        </Field>
      </div>
      <Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.name.trim()} />
    </Modal>
  );
}

function LogFormModal({ company, currentUser, existingTasks, members, onClose, onSubmit }: { company: Company; currentUser: { id: string; name: string }; existingTasks: Array<{ title: string; status: string }>; members: Array<{ uid: string; name: string; email: string }>; onClose: () => void; onSubmit: (input: Parameters<ReturnType<typeof useCompanies>["addLog"]>[1], generateTasks: boolean) => Promise<void> }) {
  const contacts = company.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: "primary", name: company.primaryContactName ?? "", role: "", email: company.email ?? "", phone: company.phone ?? "" })].filter((contact) => contact.name || contact.email || contact.phone);
  const now = new Date();
  const [form, setForm] = useState({ type: "phone" as ActivityLogType, occurredDate: toDateInputValue(now), occurredTime: toTimeInputValue(now), title: "", actorUserIds: [currentUser.id].filter(Boolean), contactIds: contacts[0]?.id ? [contacts[0].id] : [], contactNote: "", content: "", nextActionTitle: "", nextActionDue: "", aiTaskRequested: false });
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
      occurredAt: Timestamp.fromDate(dateTimeFromInputs(form.occurredDate, form.occurredTime)),
      source: "manual",
      actorUserIds: form.actorUserIds,
      actorNames: selectedActors.map((member) => member.name),
      contactIds: form.contactIds,
      contactNames: selectedContacts.map(formatContactName),
      contactNote: form.contactNote,
      aiTaskRequested: form.aiTaskRequested,
      nextAction: form.nextActionTitle ? { title: form.nextActionTitle, dueAt: form.nextActionDue ? Timestamp.fromDate(new Date(form.nextActionDue)) : null, assigneeId: currentUser.id } : null
    }, form.aiTaskRequested);
    setSaving(false);
  };
  return (
    <Modal title={`${company.name} のログを追加`} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="ログ種類" value={form.type} options={(["phone", "email", "chat", "visit", "memo", "file", "other"] as ActivityLogType[]).map((type) => [type, activityTypeLabels[type]])} onChange={(type) => setForm({ ...form, type: type as ActivityLogType })} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Input label="日付" value={form.occurredDate} type="date" onChange={(occurredDate) => setForm({ ...form, occurredDate })} />
          <Input label="時間" value={form.occurredTime} type="time" onChange={(occurredTime) => setForm({ ...form, occurredTime })} />
        </div>
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
          {selectedContacts.length ? (
            <div className="mt-2 rounded-none border border-[#F0E7E9] bg-white p-3">
              <p className="text-xs font-bold text-[#8A8186]">選択中の連絡方法</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["phone", "email", "chat", "memo"] as ActivityLogType[]).map((type) => (
                  <button className={`h-8 rounded-none px-3 text-xs font-bold ${form.type === type ? "bg-[#EC6F8B] text-white" : "border border-[#F0E7E9] text-[#6F676B]"}`} key={type} onClick={() => setForm({ ...form, type })} type="button">
                    {activityTypeLabels[type]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#8A8186]">{selectedContacts.map((contact) => `${formatContactName(contact)}: ${formatContactMethods(contact.contactMethods) || "連絡方法未設定"}`).join(" / ")}</p>
            </div>
          ) : null}
        </Field>
        <Input label="相手メモ" value={form.contactNote} onChange={(contactNote) => setForm({ ...form, contactNote })} />
        <Input label="次のアクション" value={form.nextActionTitle} onChange={(nextActionTitle) => setForm({ ...form, nextActionTitle })} />
        <Input label="次のアクション期限" type="datetime-local" value={form.nextActionDue} onChange={(nextActionDue) => setForm({ ...form, nextActionDue })} />
        <div className="sm:col-span-2">
          <Text label={form.type === "email" ? "メール本文 / 内容" : "内容"} value={form.content} minHeight="min-h-[28rem]" onChange={(content) => setForm({ ...form, content })} />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[#655D62]"><input checked={form.aiTaskRequested} onChange={(event) => setForm({ ...form, aiTaskRequested: event.target.checked })} type="checkbox" />この内容からAIにタスクを作成してもらう</label>
        <p className="text-xs font-semibold text-[#8A8A8A]">未完了タスク: {existingTasks.filter((task) => task.status !== "completed").map((task) => task.title).join(" / ") || "なし"}</p>
      </div>
      <Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim() || form.actorUserIds.length === 0} />
    </Modal>
  );
}

function MeetingFormModal({ company, products, onClose, onSubmit }: { company: Company; products: Product[]; onClose: () => void; onSubmit: (input: Parameters<ReturnType<typeof useCompanies>["addMeeting"]>[1], generateTasks: boolean) => Promise<void> }) {
  const contacts = company.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: "primary", name: company.primaryContactName ?? "", role: "", email: company.email ?? "", phone: company.phone ?? "" })].filter((contact) => contact.name || contact.email || contact.phone);
  const [form, setForm] = useState({ startAt: toDatetimeLocalValue(new Date()), title: "", meetingType: "in_person" as CompanyMeeting["meetingType"], productIds: [] as string[], contactIds: contacts[0]?.id ? [contacts[0].id] : [] as string[], summary: "", nextActions: "", aiTaskRequested: false });
  const [saving, setSaving] = useState(false);
  const selectedProducts = products.filter((product) => form.productIds.includes(product.id));
  const selectedContacts = contacts.filter((contact) => form.contactIds.includes(contact.id));
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
      contactNames: selectedContacts.map(formatContactName),
      participants: selectedContacts.map(formatContactName),
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
        <MultiSelect emptyLabel="商材が未登録です。" label="関連商材" options={products.map((product) => ({ value: product.id, label: product.name, description: product.tagline }))} placeholder="商材を選択" values={form.productIds} onChange={(productIds) => setForm({ ...form, productIds })} />
        <MultiSelect emptyLabel="先方担当者が未登録です。" label="先方参加者" options={contacts.map((contact) => ({ value: contact.id, label: formatContactName(contact), description: formatContactSummary(contact) }))} placeholder="先方参加者を選択" values={form.contactIds} onChange={(contactIds) => setForm({ ...form, contactIds })} />
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
  return <Modal title={mode === "edit" ? "メモを編集" : "メモを追加"} onClose={onClose}><div className="grid gap-4"><Input label="タイトル" required value={form.title} onChange={(title) => setForm({ ...form, title })} /><Text label="内容" value={form.content} minHeight="min-h-[36rem]" onChange={(content) => setForm({ ...form, content })} /><label className="flex items-center gap-2 text-sm font-bold text-[#655D62]"><input checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} type="checkbox" />固定表示</label></div><Actions saving={saving} onClose={onClose} onSave={save} disabled={!form.title.trim()} /></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm"><section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl"><h2 className="text-2xl font-bold text-[#2B2B2B]">{title}</h2><div className="mt-5">{children}</div></section></div>;
}

function Actions({ saving, disabled, onClose, onSave }: { saving: boolean; disabled: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="mt-6 flex justify-end gap-3"><button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button><button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || disabled} onClick={onSave} type="button">保存</button></div>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return <div className="grid gap-4">{rows.map(([label, value]) => <div className="grid gap-2 md:grid-cols-[150px_1fr]" key={label}><p className="text-sm font-bold text-[#777]">{label}</p><p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#2B2B2B]">{value}</p></div>)}</div>;
}

function formatContacts(company: Company): string {
  const contacts = company.contacts?.length ? company.contacts.map(normalizeContactPerson) : [normalizeContactPerson({ id: "primary", name: company.primaryContactName ?? "", role: "", email: company.email ?? "", phone: company.phone ?? "" })];
  const rows = contacts
    .map((contact) => [formatContactName(contact), formatContactSummary(contact)].filter(Boolean).join(" / "))
    .filter(Boolean);
  return rows.length ? rows.join("\n") : "未設定";
}

function formatDecisionInfo(info?: CompanyDecisionInfo): string {
  const normalized = normalizeDecisionInfo(info);
  const rows = [
    normalized.decisionMakerName || normalized.decisionMakerRole ? `決裁者: ${[normalized.decisionMakerName, normalized.decisionMakerRole].filter(Boolean).join(" / ")}` : "",
    `接触: ${normalized.decisionMakerContacted ? "済み" : "未接触 / 未確認"}`,
    normalized.budgetRange ? `予算感: ${normalized.budgetRange}` : "",
    normalized.budgetYear ? `予算年度: ${normalized.budgetYear}` : "",
    normalized.implementationTiming ? `導入希望時期: ${normalized.implementationTiming}` : "",
    normalized.competitors?.length ? `競合: ${normalized.competitors.join(" / ")}` : "",
    normalized.approvalConditions?.length ? `稟議条件: ${normalized.approvalConditions.join(" / ")}` : ""
  ].filter(Boolean);
  return rows.length ? rows.join("\n") : "未設定";
}

function formatCommoContext(context?: CompanyProductSalesContext["commo"]): string {
  if (!context) return "未設定";
  const rows = [
    context.facilityScale ? `施設規模: ${context.facilityScale}` : "",
    context.currentLineUsage ? `LINE活用: ${context.currentLineUsage}` : "",
    context.otaDependency ? `OTA依存度: ${context.otaDependency}` : "",
    context.existingCrm ? `既存CRM: ${context.existingCrm}` : "",
    context.reservationManagement ? `予約管理: ${context.reservationManagement}` : "",
    context.operationOwner ? `運用担当: ${context.operationOwner}` : "",
    context.repeatCustomerStatus ? `リピーター: ${context.repeatCustomerStatus}` : "",
    context.dormantCustomerStatus ? `休眠顧客: ${context.dormantCustomerStatus}` : ""
  ].filter(Boolean);
  return rows.length ? rows.join("\n") : "未設定";
}

function getPrimaryContactLabel(company: Company): string {
  const contact = company.contacts?.find((item) => item.id === company.primaryContactId) ?? company.contacts?.[0];
  if (contact) return formatContactName(contact);
  return company.primaryContactName ?? "";
}

function normalizeProductAccountAccess(access?: CompanyProductAccountAccess): CompanyProductAccountAccess {
  return {
    sns: {
      instagram: access?.sns?.instagram ?? {},
      tiktok: access?.sns?.tiktok ?? {}
    },
    commo: {
      officialLine: access?.commo?.officialLine ?? {}
    }
  };
}

function normalizeProductSalesContext(context?: CompanyProductSalesContext): CompanyProductSalesContext {
  return {
    commo: {
      facilityScale: context?.commo?.facilityScale ?? "",
      currentLineUsage: context?.commo?.currentLineUsage ?? "",
      otaDependency: context?.commo?.otaDependency ?? "",
      existingCrm: context?.commo?.existingCrm ?? "",
      reservationManagement: context?.commo?.reservationManagement ?? "",
      repeatCustomerStatus: context?.commo?.repeatCustomerStatus ?? "",
      dormantCustomerStatus: context?.commo?.dormantCustomerStatus ?? "",
      operationOwner: context?.commo?.operationOwner ?? ""
    }
  };
}

function updateCommoContext(context: CompanyProductSalesContext, patch: NonNullable<CompanyProductSalesContext["commo"]>): CompanyProductSalesContext {
  const normalized = normalizeProductSalesContext(context);
  return { ...normalized, commo: { ...normalized.commo, ...patch } };
}

function normalizeDecisionInfo(info?: CompanyDecisionInfo): CompanyDecisionInfo {
  return {
    decisionMakerName: info?.decisionMakerName ?? "",
    decisionMakerRole: info?.decisionMakerRole ?? "",
    decisionMakerContacted: Boolean(info?.decisionMakerContacted),
    budgetRange: info?.budgetRange ?? "",
    budgetYear: info?.budgetYear ?? "",
    implementationTiming: info?.implementationTiming ?? "",
    competitors: info?.competitors ?? [],
    approvalConditions: info?.approvalConditions ?? []
  };
}

function compactProductAccountAccess(access: CompanyProductAccountAccess, enabled: { sns: boolean; commo: boolean }): CompanyProductAccountAccess {
  const normalized = normalizeProductAccountAccess(access);
  return {
    ...(enabled.sns ? { sns: { instagram: cleanCredential(normalized.sns?.instagram), tiktok: cleanCredential(normalized.sns?.tiktok) } } : {}),
    ...(enabled.commo ? { commo: { officialLine: cleanCredential(normalized.commo?.officialLine) } } : {})
  };
}

function cleanCredential(credential?: CompanyProductAccountCredential): CompanyProductAccountCredential {
  const next = {
    accountName: credential?.accountName?.trim() ?? "",
    email: credential?.email?.trim() ?? "",
    password: credential?.password?.trim() ?? ""
  };
  return next.accountName || next.email || next.password ? next : {};
}

function isSnsOperationProduct(product: Product): boolean {
  return product.name.includes("SNS運用代行");
}

function isCommoProduct(product: Product): boolean {
  return product.name.toLowerCase().includes("commo");
}

function companyHasCommoProduct(company: Company, products: Product[]): boolean {
  const selectedProducts = products.filter((product) => company.productIds?.includes(product.id));
  return selectedProducts.some(isCommoProduct) || Boolean(company.productNames?.some((name) => name.toLowerCase().includes("commo")));
}

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
  const contacts = log.contactNames?.length ? log.contactNames.join(" / ") : log.contactNote || "先方未設定";
  return `対応者: ${actors} / 相手先: ${contacts}`;
}

function Input({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]"><span className="inline-flex items-center gap-2">{label}{required ? <span className="h-1.5 w-1.5 rounded-none bg-[#EC6F8B]" /> : null}</span><input className="task-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AccountAccessRow({ accountLabel, credential, onChange }: { accountLabel: string; credential?: CompanyProductAccountCredential; onChange: (key: keyof CompanyProductAccountCredential, value: string) => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <input className="task-input" placeholder={accountLabel} value={credential?.accountName ?? ""} onChange={(event) => onChange("accountName", event.target.value)} />
      <input className="task-input" placeholder="メールアドレス" value={credential?.email ?? ""} onChange={(event) => onChange("email", event.target.value)} />
      <input className="task-input" placeholder="パスワード" value={credential?.password ?? ""} onChange={(event) => onChange("password", event.target.value)} />
    </div>
  );
}

function ContactMethodToggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-none px-3 text-xs font-bold ${checked ? "bg-[#EC6F8B] text-white" : "border border-[#F0E7E9] bg-white text-[#6F676B]"}`} onClick={onClick} type="button">
      {checked ? <Check className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2 text-sm font-bold text-[#655D62]"><span>{label}</span>{children}</div>;
}

function Text({ label, value, onChange, minHeight = "min-h-24" }: { label: string; value: string; onChange: (value: string) => void; minHeight?: string }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<textarea className={`task-input ${minHeight} resize-none`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
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

function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dateTimeFromInputs(date: string, time: string): Date {
  const value = new Date(`${date || toDateInputValue(new Date())}T${time || "00:00"}`);
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

async function createSuggestedTasks(company: Company, input: { title: string; content?: string; occurredAt: Timestamp; type?: ActivityLogType; meetingId?: string; meetingTitle?: string; productNames?: string[]; contactNames?: string[] }, user: { id: string; name: string }, authUser?: { getIdToken: () => Promise<string> } | null) {
  if (!window.confirm("内容と次回アクションからAIタスクを作成しますか？")) return;
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
    const data = await safeJson<{ tasks?: Array<{ title: string; description: string; priority: "high" | "medium" | "low"; dueDate: string | null; reason: string }> }>(response);
    return data.tasks?.length ? data.tasks : fallback;
  } catch {
    return fallback;
  }
}

async function safeJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("サーバーからJSON以外の応答が返りました。");
  return response.json() as Promise<T>;
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
