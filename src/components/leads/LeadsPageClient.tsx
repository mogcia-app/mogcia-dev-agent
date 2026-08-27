"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { Archive, Building2, CalendarDays, CheckCircle2, FileText, LinkIcon, Mail, MessageSquarePlus, Mic2, Phone, Plus, Save, Search, StickyNote, UploadCloud } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { SearchSelect, SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { createEmptyLeadDraft, activityTypeLabels, activityTypeOptions, formatMaybeDate, leadStatusLabels, leadStatusOptions, leadStatusTone, toDatetimeLocalInput } from "@/lib/lead-utils";
import { createLead, createManualActivity, linkLeadToCompany, subscribeLeadActivities, subscribeLeads, updateLead } from "@/lib/leads";
import { subscribeCompaniesMaster } from "@/lib/companies";
import { subscribeProductsMaster } from "@/lib/products";
import { subscribeTeleapoRecords } from "@/lib/teleapo";
import { subscribeTasks } from "@/lib/tasks";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayName } from "@/lib/user-display";
import type { Company } from "@/types/company";
import type { Product } from "@/types/product";
import type { TeleapoRecord } from "@/types/teleapo";
import type { Task } from "@/types/task";
import type { Activity, ActivityDraft, Lead, LeadDraft, LeadSort, LeadStatus } from "@/types/lead";

type TabKey = "overview" | "activity" | "meetings" | "tasks" | "files" | "notes";

const tabs: Array<[TabKey, string]> = [["overview", "概要"], ["activity", "活動ログ"], ["meetings", "商談"], ["tasks", "タスク"], ["files", "ファイル"], ["notes", "メモ"]];
const sortOptions: Array<[LeadSort, string]> = [["updated", "更新日が新しい順"], ["nextAction", "次回予定が近い順"], ["lastActivity", "最終活動日が新しい順"], ["companyName", "会社名順"], ["rank", "見込みランク順"]];

export function LeadsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const selectedTab = (params.get("tab") as TabKey | null) ?? "overview";
  const [user, setUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<TeleapoRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [productId, setProductId] = useState("all");
  const [assigneeId, setAssigneeId] = useState("all");
  const [sort, setSort] = useState<LeadSort>("updated");
  const [draft, setDraft] = useState<LeadDraft>(() => createEmptyLeadDraft());
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>(() => createEmptyActivityDraft());
  const [createOpen, setCreateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    const onError = (source: string) => (nextError: Error) => {
      setError(`${source}: ${nextError.message}`);
      setLoading(false);
    };
    const unsubLeads = subscribeLeads((nextLeads) => {
      setLeads(nextLeads);
      setLoading(false);
    }, onError("leads"));
    const unsubCompanies = subscribeCompaniesMaster(setCompanies, onError("companies"));
    const unsubProducts = subscribeProductsMaster((nextProducts) => setProducts(nextProducts.filter((product) => product.status !== "archived")), onError("products"));
    const unsubRecords = subscribeTeleapoRecords(setRecords, onError("teleapoRecords"));
    const unsubTasks = subscribeTasks(setTasks, onError("tasks"));
    return () => {
      unsubLeads();
      unsubCompanies();
      unsubProducts();
      unsubRecords();
      unsubTasks();
    };
  }, [user]);

  useEffect(() => {
    if (!selectedId) {
      window.setTimeout(() => setActivities([]), 0);
      return undefined;
    }
    return subscribeLeadActivities(selectedId, setActivities, (nextError) => setError(nextError.message));
  }, [selectedId]);

  const members = useMemo(() => {
    const map = new Map<string, string>();
    DEFAULT_WORKSPACE_MEMBERS.forEach((member) => map.set(member.uid, member.name));
    leads.forEach((lead) => {
      if (lead.assignedUserId) map.set(lead.assignedUserId, lead.assignedUserName || lead.assignedUserId);
      if (lead.createdBy) map.set(lead.createdBy, lead.createdByName || lead.createdBy);
    });
    if (user) map.set(user.uid, getUserDisplayName(user));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [leads, user]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads
      .filter((lead) => status === "all" || lead.status === status)
      .filter((lead) => productId === "all" || lead.productId === productId)
      .filter((lead) => assigneeId === "all" || lead.assignedUserId === assigneeId)
      .filter((lead) => !needle || [lead.companyName, lead.contactName, lead.contactRole, lead.phone, lead.email, lead.productName, lead.notes].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((a, b) => compareLeads(a, b, sort));
  }, [assigneeId, leads, productId, query, sort, status]);

  const selectedLead = selectedId ? leads.find((lead) => lead.id === selectedId) ?? null : null;
  const selectedRecords = useMemo(() => {
    if (!selectedLead) return [];
    return records
      .filter((record) => record.leadId === selectedLead.id || (selectedLead.companyId && record.companyId === selectedLead.companyId) || (!record.companyId && record.customerName === selectedLead.companyName))
      .sort((a, b) => b.recordedAt.toMillis() - a.recordedAt.toMillis());
  }, [records, selectedLead]);
  const selectedTasks = useMemo(() => selectedLead ? tasks.filter((task) => task.leadId === selectedLead.id || (selectedLead.companyId && task.companyId === selectedLead.companyId)) : [], [selectedLead, tasks]);

  const currentUser = useMemo(() => ({ id: user?.uid ?? "", name: user ? getUserDisplayName(user) : "ログインユーザー" }), [user]);

  const setRoute = (next: { id?: string | null; tab?: TabKey }) => {
    const search = new URLSearchParams(params.toString());
    if (next.id !== undefined) next.id ? search.set("id", next.id) : search.delete("id");
    if (next.tab) search.set("tab", next.tab);
    router.replace(`${pathname}${search.toString() ? `?${search.toString()}` : ""}` as Route, { scroll: false });
  };

  const saveLead = async () => {
    if (!user || !draft.companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createLead(draft, currentUser);
      setDraft(createEmptyLeadDraft());
      setCreateOpen(false);
      setToast("見込み客を登録しました");
      setRoute({ id, tab: "overview" });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "見込み客を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const saveActivity = async () => {
    if (!selectedLead || !user) return;
    setSaving(true);
    setError(null);
    try {
      await createManualActivity({ leadId: selectedLead.id, companyId: selectedLead.companyId ?? null }, activityDraft, currentUser);
      setActivityDraft(createEmptyActivityDraft());
      setActivityOpen(false);
      setToast("活動ログを追加しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "活動ログを追加できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const linkCompany = async (companyId: string) => {
    if (!selectedLead || !user || !companyId) return;
    await linkLeadToCompany(selectedLead.id, companyId, currentUser);
    setToast("会社一覧に関連付けました");
  };

  return (
    <section>
      {!selectedLead ? (
        <PageHeader
          title="見込み客"
          description="テレアポ、問い合わせ、紹介、商談中の会社を管理します。"
          actions={<button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しい見込み客</button>}
        />
      ) : null}
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={error} type="error" /></div>

      {!selectedLead ? (
        <section className="mt-5 rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[1fr_180px_220px_220px_220px]">
            <label className="flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] px-3 text-sm font-bold text-[#777]">
              <Search className="h-4 w-4" />
              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="会社名・担当者・商材で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <SingleSelect options={[{ value: "all", label: "すべて" }, ...leadStatusOptions.map(([value, label]) => ({ value, label }))]} value={status} onChange={(value) => setStatus(value as LeadStatus | "all")} />
            <SingleSelect options={[{ value: "all", label: "商材すべて" }, ...products.map((product) => ({ value: product.id, label: product.name }))]} value={productId} onChange={setProductId} />
            <SingleSelect options={[{ value: "all", label: "担当者すべて" }, ...members.map((member) => ({ value: member.id, label: member.name }))]} value={assigneeId} onChange={setAssigneeId} />
            <SingleSelect options={sortOptions.map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setSort(value as LeadSort)} />
          </div>
          <div className="mt-4 space-y-3">
            {loading ? <SkeletonList count={6} media={false} /> : null}
            {!loading && filtered.length === 0 ? <EmptyState title="見込み客はまだありません" description="テレアポ対象や問い合わせを登録すると、ここに表示されます。" actionLabel="新規登録" onAction={() => setCreateOpen(true)} /> : null}
            {filtered.map((lead) => <LeadRow key={lead.id} lead={lead} onSelect={() => setRoute({ id: lead.id, tab: "overview" })} />)}
          </div>
        </section>
      ) : (
        <section className="mt-0 space-y-4">
          <LeadHeader lead={selectedLead} onActivity={() => setActivityOpen(true)} onBack={() => setRoute({ id: null })} />
          <div className="rounded-none border border-[#F0E7E9] bg-white shadow-sm">
            <div className="flex overflow-x-auto border-b border-[#F0E7E9]">
              {tabs.map(([value, label]) => <button className={`h-12 shrink-0 px-5 text-sm font-bold ${selectedTab === value ? "border-b-2 border-[#EC6F8B] text-[#EC6F8B]" : "text-[#6F676B]"}`} key={value} onClick={() => setRoute({ id: selectedLead.id, tab: value })} type="button">{label}</button>)}
            </div>
            <div className="p-5">
              {selectedTab === "overview" ? <OverviewTab companies={companies} lead={selectedLead} onLinkCompany={linkCompany} records={selectedRecords} /> : null}
              {selectedTab === "activity" ? <ActivityTab activities={activities} records={selectedRecords} /> : null}
              {selectedTab === "meetings" ? <MeetingsTab records={selectedRecords} /> : null}
              {selectedTab === "tasks" ? <TasksTab tasks={selectedTasks} /> : null}
              {selectedTab === "files" ? <EmptyState icon={UploadCloud} title="ファイルはまだありません" description="会社化後も参照できるファイル基盤として次フェーズで接続します。" /> : null}
              {selectedTab === "notes" ? <NotesTab lead={selectedLead} currentUser={currentUser} onSave={(nextDraft) => updateLead(selectedLead.id, nextDraft, currentUser)} /> : null}
            </div>
          </div>
        </section>
      )}

      {createOpen ? <LeadModal companies={companies} draft={draft} members={members} onChange={setDraft} onClose={() => setCreateOpen(false)} onSave={saveLead} products={products} saving={saving} /> : null}
      {activityOpen && selectedLead ? <ActivityModal draft={activityDraft} onChange={setActivityDraft} onClose={() => setActivityOpen(false)} onSave={saveActivity} products={products} saving={saving} /> : null}
    </section>
  );
}

function LeadRow({ lead, onSelect }: { lead: Lead; onSelect: () => void }) {
  return (
    <button className="grid w-full gap-3 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-left transition hover:border-[#F7CAD2] lg:grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr]" onClick={onSelect} type="button">
      <span className="min-w-0"><span className="block truncate font-black text-[#2B2B2B]">{lead.companyName}</span><span className="mt-1 block truncate text-sm font-semibold text-[#777]">{lead.contactName || "担当者未設定"}</span></span>
      <span className="truncate text-sm font-bold text-[#6F676B]">{lead.productName || "商材未設定"}</span>
      <span className={`h-fit rounded-none px-2.5 py-1 text-center text-xs font-black ${leadStatusTone(lead.status)}`}>{leadStatusLabels[lead.status]}</span>
      <span className="text-sm font-bold text-[#EC6F8B]">{lead.prospectRank || "未判定"}</span>
      <span className="text-sm font-semibold text-[#777]">{formatMaybeDate(lead.lastActivityAt?.toDate())}</span>
      <span className="text-sm font-semibold text-[#777]">{formatMaybeDate(lead.nextActionAt?.toDate())}</span>
      <span className="truncate text-sm font-bold text-[#6F676B]">{lead.assignedUserName || "未設定"}</span>
    </button>
  );
}

function LeadHeader({ lead, onBack, onActivity }: { lead: Lead; onBack: () => void; onActivity: () => void }) {
  return (
    <section className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <button className="mb-2 text-sm font-bold text-[#EC6F8B]" onClick={onBack} type="button">一覧へ戻る</button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-[#2B2B2B]">{lead.companyName}</h2>
            <span className={`rounded-none px-2.5 py-1 text-xs font-black ${leadStatusTone(lead.status)}`}>{leadStatusLabels[lead.status]}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-[#777]">{[lead.contactName, lead.contactRole, lead.productName].filter(Boolean).join(" / ") || "詳細未設定"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.email ? <a className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" href={`mailto:${lead.email}`}><Mail className="h-4 w-4" />メール</a> : null}
          {lead.phone ? <a className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" href={`tel:${lead.phone}`}><Phone className="h-4 w-4" />電話</a> : null}
          <button className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" onClick={onActivity} type="button"><MessageSquarePlus className="h-4 w-4" />活動ログを追加</button>
        </div>
      </div>
    </section>
  );
}

function OverviewTab({ lead, companies, records, onLinkCompany }: { lead: Lead; companies: Company[]; records: TeleapoRecord[]; onLinkCompany: (companyId: string) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <InfoGrid rows={[
        ["会社名", lead.companyName],
        ["担当者", [lead.contactName, lead.contactRole].filter(Boolean).join(" / ") || "未設定"],
        ["電話", lead.phone || "未設定"],
        ["メール", lead.email || "未設定"],
        ["流入元", lead.source || "未設定"],
        ["商材", lead.productName || "未設定"],
        ["見込みランク", lead.prospectRank || "未判定"],
        ["担当者", lead.assignedUserName || "未設定"],
        ["次回予定", formatMaybeDate(lead.nextActionAt?.toDate())],
        ["メモ", lead.notes || "未設定"]
      ]} />
      <aside className="space-y-4">
        <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4">
          <h3 className="font-bold text-[#2B2B2B]">会社一覧との関連</h3>
          {lead.companyId ? <Link className="mt-3 inline-flex h-10 items-center gap-2 rounded-none bg-white px-4 text-sm font-bold text-[#EC6F8B] ring-1 ring-[#F0E7E9]" href={`/sales/companies?id=${lead.companyId}&tab=overview` as Route}><Building2 className="h-4 w-4" />会社詳細を開く</Link> : (
            <div className="mt-3">
              <SearchSelect clearable emptyLabel="会社がありません。" options={companies.map((company) => ({ value: company.id, label: company.name, description: company.industry }))} placeholder="既存Companyへ関連付け" value="" onChange={onLinkCompany} />
            </div>
          )}
        </section>
        <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4">
          <h3 className="font-bold text-[#2B2B2B]">紐づく分析</h3>
          <p className="mt-2 text-sm font-semibold text-[#777]">{records.length}件のテレアポ・商談データ</p>
          <Link className="mt-3 inline-flex h-10 items-center gap-2 rounded-none bg-white px-4 text-sm font-bold text-[#EC6F8B] ring-1 ring-[#F0E7E9]" href={`/sales/upload?leadId=${lead.id}` as Route}><UploadCloud className="h-4 w-4" />アップロードへ</Link>
        </section>
      </aside>
    </div>
  );
}

function ActivityTab({ activities, records }: { activities: Activity[]; records: TeleapoRecord[] }) {
  const items = [
    ...activities.map((activity) => ({ id: `activity-${activity.id}`, at: activity.occurredAt, kind: "activity" as const, activity })),
    ...records.map((record) => ({ id: `record-${record.id}`, at: record.recordedAt, kind: "record" as const, record }))
  ].sort((a, b) => b.at.toMillis() - a.at.toMillis());
  if (items.length === 0) return <EmptyState icon={MessageSquarePlus} title="活動ログはまだありません" description="電話、資料送付、メモ、テレアポ音声などを時系列で確認できます。" />;
  return (
    <div className="relative pl-9">
      <span className="absolute bottom-4 left-3 top-3 w-px bg-[#F0E7E9]" />
      <div className="grid gap-4">
        {items.map((item) => item.kind === "activity" ? <ActivityItem activity={item.activity} key={item.id} /> : <RecordItem key={item.id} record={item.record} />)}
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-black text-[#EC6F8B]">{activityTypeLabels[activity.type].slice(0, 1)}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-black text-[#EC6F8B]">{activityTypeLabels[activity.type]}</span>
        <span className="text-xs font-bold text-[#8A8186]">{activity.occurredAt.toDate().toLocaleString("ja-JP")}</span>
      </div>
      <h3 className="mt-2 font-black text-[#2B2B2B]">{activity.title || activityTypeLabels[activity.type]}</h3>
      {activity.content ? <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-semibold leading-6 text-[#6F676B]">{activity.content}</p> : null}
      {activity.nextActionTitle ? <p className="mt-3 text-sm font-bold text-[#D94F6E]">次回予定: {activity.nextActionTitle} / {formatMaybeDate(activity.nextActionAt?.toDate())}</p> : null}
    </article>
  );
}

function RecordItem({ record }: { record: TeleapoRecord }) {
  const href = `/sales/analysis?dealId=${[record.companyId || record.customerName || "unknown-company", record.productId || record.productName || "unknown-product"].map(encodeURIComponent).join("__")}` as Route;
  return (
    <article className="relative rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-black text-[#EC6F8B]"><Mic2 className="h-4 w-4" /></span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-black text-[#EC6F8B]">{record.salesDomain === "teleapo" ? "テレアポ" : "商談"}</span>
        <span className="text-xs font-bold text-[#8A8186]">{record.recordedAt.toDate().toLocaleString("ja-JP")}</span>
        {record.audioDownloadUrl ? <span className="rounded-none bg-white px-2 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0E7E9]">音声あり</span> : null}
        {record.aiAdvice ? <span className="rounded-none bg-white px-2 py-1 text-xs font-bold text-[#6F676B] ring-1 ring-[#F0E7E9]">AI分析あり</span> : null}
      </div>
      <h3 className="mt-2 font-black text-[#2B2B2B]">{record.meetingTitle || record.productName || record.customerName}</h3>
      {record.audioDownloadUrl ? <audio className="mt-3 w-full" controls src={record.audioDownloadUrl} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="inline-flex h-9 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-3 text-xs font-bold text-[#EC6F8B]" href={href}><FileText className="h-4 w-4" />AI分析を見る</Link>
        {record.transcriptText || record.conversationLogs.length ? <Link className="inline-flex h-9 items-center gap-2 rounded-none border border-[#F0E7E9] bg-white px-3 text-xs font-bold text-[#6F676B]" href={href}>文字起こしを見る</Link> : null}
      </div>
    </article>
  );
}

function MeetingsTab({ records }: { records: TeleapoRecord[] }) {
  const meetings = records.filter((record) => record.salesDomain === "meeting");
  if (!meetings.length) return <EmptyState icon={CalendarDays} title="商談はまだありません" description="商談文字起こしをアップロードすると、ここに表示されます。" />;
  return <div className="grid gap-3">{meetings.map((record) => <RecordItem key={record.id} record={record} />)}</div>;
}

function TasksTab({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return <EmptyState icon={CheckCircle2} title="タスクはまだありません" description="見込み客または関連Companyに紐づくタスクを表示します。" />;
  return <div className="grid gap-3">{tasks.map((task) => <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={task.id}><p className="font-bold text-[#2B2B2B]">{task.title}</p><p className="mt-1 text-sm font-semibold text-[#777]">{task.assigneeName || "担当者未設定"} / {task.status}</p></div>)}</div>;
}

function NotesTab({ lead, currentUser, onSave }: { lead: Lead; currentUser: { id: string; name: string }; onSave: (draft: LeadDraft) => Promise<void> }) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(leadToDraft({ ...lead, notes }));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <textarea className="task-input min-h-80 resize-y text-base leading-7" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white" disabled={saving || !currentUser.id} onClick={() => void save()} type="button"><Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}</button>
    </div>
  );
}

function LeadModal({ draft, products, companies, members, saving, onChange, onSave, onClose }: { draft: LeadDraft; products: Product[]; companies: Company[]; members: Array<{ id: string; name: string }>; saving: boolean; onChange: (draft: LeadDraft) => void; onSave: () => void; onClose: () => void }) {
  return (
    <Modal title="見込み客を登録" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="会社名" value={draft.companyName} onChange={(companyName) => onChange({ ...draft, companyName })} required />
        <Input label="担当者" value={draft.contactName} onChange={(contactName) => onChange({ ...draft, contactName })} />
        <Input label="役職" value={draft.contactRole} onChange={(contactRole) => onChange({ ...draft, contactRole })} />
        <Input label="電話" value={draft.phone} onChange={(phone) => onChange({ ...draft, phone })} />
        <Input label="メール" value={draft.email} onChange={(email) => onChange({ ...draft, email })} />
        <Input label="流入元" value={draft.source} onChange={(source) => onChange({ ...draft, source })} />
        <SelectBox label="ステータス" value={draft.status} options={leadStatusOptions} onChange={(status) => onChange({ ...draft, status: status as LeadStatus })} />
        <Input label="見込みランク" value={draft.prospectRank} onChange={(prospectRank) => onChange({ ...draft, prospectRank })} />
        <SearchBox label="関連商材" value={draft.productId} options={products.map((product) => ({ value: product.id, label: product.name }))} onChange={(value) => { const product = products.find((item) => item.id === value); onChange({ ...draft, productId: value, productName: product?.name ?? "" }); }} />
        <SearchBox label="担当者" value={draft.assignedUserId} options={members.map((member) => ({ value: member.id, label: member.name }))} onChange={(value) => { const member = members.find((item) => item.id === value); onChange({ ...draft, assignedUserId: value, assignedUserName: member?.name ?? "" }); }} />
        <Input label="アポ日時" type="datetime-local" value={draft.appointmentAt} onChange={(appointmentAt) => onChange({ ...draft, appointmentAt })} />
        <Input label="次回予定日時" type="datetime-local" value={draft.nextActionAt} onChange={(nextActionAt) => onChange({ ...draft, nextActionAt })} />
        <Input label="次回予定" value={draft.nextActionTitle} onChange={(nextActionTitle) => onChange({ ...draft, nextActionTitle })} />
        <SearchBox label="既存Company" value={draft.companyId} options={companies.map((company) => ({ value: company.id, label: company.name }))} onChange={(companyId) => onChange({ ...draft, companyId })} />
        <div className="sm:col-span-2"><Text label="メモ" value={draft.notes} onChange={(notes) => onChange({ ...draft, notes })} /></div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
        <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !draft.companyName.trim()} onClick={() => void onSave()} type="button">{saving ? "保存中..." : "保存"}</button>
      </div>
    </Modal>
  );
}

function ActivityModal({ draft, products, saving, onChange, onSave, onClose }: { draft: ActivityDraft; products: Product[]; saving: boolean; onChange: (draft: ActivityDraft) => void; onSave: () => void; onClose: () => void }) {
  return (
    <Modal title="活動ログを追加" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectBox label="種類" value={draft.type} options={activityTypeOptions} onChange={(type) => onChange({ ...draft, type: type as ActivityDraft["type"] })} />
        <Input label="日時" type="datetime-local" value={draft.occurredAt} onChange={(occurredAt) => onChange({ ...draft, occurredAt })} />
        <SearchBox label="関連商材" value={draft.productId} options={products.map((product) => ({ value: product.id, label: product.name }))} onChange={(productId) => { const product = products.find((item) => item.id === productId); onChange({ ...draft, productId, productName: product?.name ?? "" }); }} />
        <Input label="次回予定日時" type="datetime-local" value={draft.nextActionAt} onChange={(nextActionAt) => onChange({ ...draft, nextActionAt })} />
        <Input label="タイトル" value={draft.title} onChange={(title) => onChange({ ...draft, title })} />
        <Input label="次回予定" value={draft.nextActionTitle} onChange={(nextActionTitle) => onChange({ ...draft, nextActionTitle })} />
        <div className="sm:col-span-2"><Text label="内容" value={draft.content} onChange={(content) => onChange({ ...draft, content })} /></div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
        <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void onSave()} type="button">{saving ? "保存中..." : "保存"}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm"><section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl"><h2 className="text-2xl font-bold text-[#2B2B2B]">{title}</h2><div className="mt-5">{children}</div></section></div>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return <div className="grid gap-3">{rows.map(([label, value]) => <div className="grid gap-1 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-3 md:grid-cols-[160px_1fr]" key={label}><dt className="text-sm font-black text-[#8A8186]">{label}</dt><dd className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#2B2B2B]">{value}</dd></div>)}</div>;
}

function Input({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="grid gap-1 text-sm font-bold text-[#655D62]">{label}{required ? <span className="sr-only">必須</span> : null}<input className="task-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-bold text-[#655D62]">{label}<textarea className="task-input min-h-40 resize-y" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectBox({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-bold text-[#655D62]">{label}<SingleSelect options={options.map(([nextValue, nextLabel]) => ({ value: nextValue, label: nextLabel }))} value={value} onChange={onChange} /></label>;
}

function SearchBox({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-bold text-[#655D62]">{label}<SearchSelect clearable emptyLabel="候補がありません。" options={options} placeholder="未選択" value={value} onChange={onChange} /></label>;
}

function createEmptyActivityDraft(): ActivityDraft {
  return { type: "call", title: "", content: "", productId: "", productName: "", occurredAt: toDatetimeLocalInput(new Date()), nextActionAt: "", nextActionTitle: "" };
}

function leadToDraft(lead: Lead): LeadDraft {
  return {
    companyName: lead.companyName,
    contactName: lead.contactName ?? "",
    contactRole: lead.contactRole ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "",
    productId: lead.productId ?? "",
    productName: lead.productName ?? "",
    status: lead.status,
    prospectRank: lead.prospectRank ?? "",
    appointmentAt: toDatetimeLocalInput(lead.appointmentAt?.toDate()),
    nextActionAt: toDatetimeLocalInput(lead.nextActionAt?.toDate()),
    nextActionTitle: lead.nextActionTitle ?? "",
    assignedUserId: lead.assignedUserId ?? "",
    assignedUserName: lead.assignedUserName ?? "",
    notes: lead.notes ?? "",
    companyId: lead.companyId ?? ""
  };
}

function compareLeads(a: Lead, b: Lead, sort: LeadSort): number {
  if (sort === "companyName") return a.companyName.localeCompare(b.companyName, "ja");
  if (sort === "nextAction") return (a.nextActionAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.nextActionAt?.toMillis() ?? Number.MAX_SAFE_INTEGER);
  if (sort === "lastActivity") return (b.lastActivityAt?.toMillis() ?? 0) - (a.lastActivityAt?.toMillis() ?? 0);
  if (sort === "rank") return (a.prospectRank ?? "").localeCompare(b.prospectRank ?? "", "ja");
  return b.updatedAt.toMillis() - a.updatedAt.toMillis();
}
