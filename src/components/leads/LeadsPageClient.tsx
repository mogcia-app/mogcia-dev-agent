"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { Archive, Building2, CalendarDays, CheckCircle2, Edit2, FileText, LinkIcon, Mail, MessageSquarePlus, Mic2, Phone, Plus, Search, StickyNote, Target, UploadCloud, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { SearchSelect, SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { subscribeCalendarEvents } from "@/lib/calendar";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { createEmptyLeadDraft, activityTypeLabels, activityTypeOptions, formatMaybeDate, leadCreateStatusOptions, leadStatusLabels, leadStatusOptions, leadStatusTone, toDatetimeLocalInput } from "@/lib/lead-utils";
import { createLead, createManualActivity, subscribeLeadActivities, subscribeLeads, updateLead } from "@/lib/leads";
import { subscribeProductsMaster } from "@/lib/products";
import { generateTemplateContent, subscribeBusinessTemplates } from "@/lib/templates";
import { createTeleapoRecord, subscribeTeleapoRecords, updateTeleapoRecord, uploadTeleapoFile } from "@/lib/teleapo";
import { subscribeTasks } from "@/lib/tasks";
import { DEFAULT_WORKSPACE_MEMBERS, getUserDisplayName } from "@/lib/user-display";
import type { Product } from "@/types/product";
import type { BusinessTemplate } from "@/types/template";
import type { TeleapoRecord } from "@/types/teleapo";
import type { Task } from "@/types/task";
import type { Activity, ActivityDraft, Lead, LeadDraft, LeadSort, LeadStatus } from "@/types/lead";
import type { CalendarEvent } from "@/types/calendar";

type TabKey = "activity" | "meetings" | "tasks" | "files" | "notes";

const tabs: Array<[TabKey, string]> = [["activity", "活動ログ"], ["meetings", "商談"], ["tasks", "タスク"], ["files", "ファイル"], ["notes", "メモ"]];
const sortOptions: Array<[LeadSort, string]> = [["updated", "更新日が新しい順"], ["nextAction", "次回予定が近い順"], ["lastActivity", "最終活動日が新しい順"], ["companyName", "会社名順"]];
const industryOptions = ["ホテル", "ゴルフ", "政治関係", "ホテル協会", "ゴルフ協会"].map((value) => ({ value, label: value }));
const leadFilterTabs: Array<[LeadStatus | "all", string]> = [["all", "すべて"], ["appointment", leadStatusLabels.appointment], ["document_sent", leadStatusLabels.document_sent], ["sent", leadStatusLabels.sent], ["contacting", leadStatusLabels.contacting], ["hold", leadStatusLabels.hold], ["won", leadStatusLabels.won], ["lost", leadStatusLabels.lost]];
const ALL_MONTHS = "all";
const UNSET_MONTH = "unset";

type NextActionDraft = {
  nextActionAt: string;
  nextActionTitle: string;
};

type NextActionView = {
  title: string;
  meta: string;
  source: "lead" | "calendar" | "none";
};

export function LeadsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("leadId") ?? params.get("id");
  const selectedTab = readTabParam(params.get("tab"));
  const initialStatus = readStatusParam(params.get("status"));
  const [user, setUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<BusinessTemplate[]>([]);
  const [records, setRecords] = useState<TeleapoRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">(initialStatus);
  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS);
  const [productId, setProductId] = useState("all");
  const [assigneeId, setAssigneeId] = useState("all");
  const [sort, setSort] = useState<LeadSort>("updated");
  const [draft, setDraft] = useState<LeadDraft>(() => createEmptyLeadDraft());
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>(() => createEmptyActivityDraft());
  const [nextActionDraft, setNextActionDraft] = useState<NextActionDraft>({ nextActionAt: "", nextActionTitle: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
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
    const unsubProducts = subscribeProductsMaster((nextProducts) => setProducts(nextProducts.filter((product) => product.status !== "archived")), onError("products"));
    const unsubTemplates = subscribeBusinessTemplates(setTemplates, () => setTemplates([]));
    const unsubRecords = subscribeTeleapoRecords(setRecords, onError("teleapoRecords"));
    const unsubTasks = subscribeTasks(setTasks, onError("tasks"));
    const unsubCalendar = subscribeCalendarEvents(user, setCalendarEvents, onError("calendar"));
    return () => {
      unsubLeads();
      unsubProducts();
      unsubTemplates();
      unsubRecords();
      unsubTasks();
      unsubCalendar();
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
      .filter((lead) => monthFilter === ALL_MONTHS || leadMonthKey(lead) === monthFilter)
      .filter((lead) => status === "all" ? true : lead.status === status)
      .filter((lead) => productId === "all" || lead.productId === productId)
      .filter((lead) => assigneeId === "all" || lead.assignedUserId === assigneeId)
      .filter((lead) => !needle || [lead.companyName, lead.contactName, lead.contactRole, lead.phone, lead.email, lead.industry, lead.productName, lead.notes].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((a, b) => compareLeads(a, b, sort));
  }, [assigneeId, leads, monthFilter, productId, query, sort, status]);

  const monthTabs = useMemo(() => buildMonthTabs(leads, status), [leads, status]);

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
    search.delete("id");
    if (next.id !== undefined) next.id ? search.set("leadId", next.id) : search.delete("leadId");
    if (next.tab) search.set("tab", next.tab);
    router.replace(`${pathname}${search.toString() ? `?${search.toString()}` : ""}` as Route, { scroll: false });
  };

  const saveLead = async (audioFile?: File | null) => {
    if (!user || !draft.companyName.trim()) return;
    setSaving(true);
    setAudioUploadProgress(0);
    setError(null);
    try {
      const id = await createLead(draft, currentUser);
      if (audioFile) {
        const recordId = await createTeleapoRecord({
          leadId: id,
          companyId: draft.companyId || null,
          userId: user.uid,
          userName: currentUser.name,
          salesDomain: "teleapo",
          customerName: draft.companyName.trim(),
          contactName: draft.contactName.trim(),
          productId: draft.productId || null,
          productName: draft.productName.trim(),
          industry: draft.industry.trim(),
          role: draft.contactRole.trim(),
          phone: draft.phone.trim(),
          leadSource: draft.source.trim(),
          memo: draft.notes.trim(),
          recordedAt: Timestamp.now(),
          transcriptionStatus: "uploaded",
          aiAdviceStatus: "idle"
        });
        const uploaded = await uploadTeleapoFile({ userId: user.uid, recordId, file: audioFile, onProgress: setAudioUploadProgress });
        await updateTeleapoRecord(recordId, {
          audioFilePath: uploaded.path,
          audioDownloadUrl: uploaded.url,
          transcriptionStatus: "uploaded"
        });
      }
      setDraft(createEmptyLeadDraft());
      setCreateOpen(false);
      setToast(audioFile ? "営業リストと音声を登録しました" : "営業リストを登録しました");
      setRoute({ id, tab: "activity" });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "営業リストを保存できませんでした。");
    } finally {
      setSaving(false);
      setAudioUploadProgress(0);
    }
  };

  const openCreateLead = () => {
    setDraft(createEmptyLeadDraft());
    setCreateOpen(true);
  };

  const openEditLead = (lead: Lead) => {
    setDraft(leadToDraft(lead));
    setEditingLead(lead);
  };

  const saveLeadEdit = async () => {
    if (!editingLead || !user || !draft.companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateLead(editingLead.id, draft, currentUser);
      setEditingLead(null);
      setDraft(createEmptyLeadDraft());
      setToast("営業リストを更新しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "営業リストを保存できませんでした。");
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

  const openNextAction = () => {
    if (!selectedLead) return;
    setNextActionDraft({
      nextActionAt: toDatetimeLocalInput(selectedLead.nextActionAt?.toDate()),
      nextActionTitle: selectedLead.nextActionTitle ?? ""
    });
    setNextActionOpen(true);
  };

  const saveNextAction = async () => {
    if (!selectedLead || !user || (!nextActionDraft.nextActionTitle.trim() && !nextActionDraft.nextActionAt)) return;
    setSaving(true);
    setError(null);
    try {
      const fallbackTitle = nextActionDraft.nextActionTitle.trim() || (nextActionDraft.nextActionAt ? "次回対応" : "");
      if (!fallbackTitle) return;
      await updateLead(selectedLead.id, {
        ...leadToDraft(selectedLead),
        nextActionAt: nextActionDraft.nextActionAt,
        nextActionTitle: fallbackTitle
      }, currentUser);
      setNextActionOpen(false);
      setToast("次回予定を保存しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "次回予定を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const saveLeadStatus = async (lead: Lead, nextStatus: LeadStatus) => {
    if (!user || lead.status === nextStatus) return;
    setSaving(true);
    setError(null);
    try {
      await updateLead(lead.id, { ...leadToDraft(lead), status: nextStatus }, currentUser);
      setToast("ステータスを更新しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ステータスを更新できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const saveLostReason = async (lead: Lead, lostReason: string) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateLead(lead.id, { ...leadToDraft(lead), lostReason }, currentUser);
      setToast("失注理由を保存しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "失注理由を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <PageHeader
        title="営業リスト"
        description="契約前の営業対象について、現在の段階と次の対応を確認します。"
        actions={<button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={!user} onClick={openCreateLead} type="button"><Plus className="h-4 w-4" />営業リストを登録</button>}
      />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={error} type="error" /></div>

        <section className="mt-5 overflow-hidden rounded-none border border-[#EAE5E3] bg-white p-4 shadow-sm">
          <div className="flex gap-1 overflow-x-auto border-b border-[#EEEAE8] pt-1">
            {monthTabs.map((tab) => <button className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${monthFilter === tab.value ? "border-[#EC6F8B] text-[#B84563]" : "border-transparent text-neutral-500"}`} key={tab.value} onClick={() => setMonthFilter(tab.value)} type="button">{tab.label} <span className="ml-1 text-xs text-neutral-400">{tab.count}</span></button>)}
          </div>
          <div className="border-b border-[#EEEAE8] py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex h-10 w-full max-w-xl items-center gap-2 rounded-none border border-[#E5E0DD] bg-[#FCFBFA] px-3 text-sm font-medium text-[#777]">
                <Search className="h-4 w-4" />
                <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="会社・担当者・電話・メール・商材を検索" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[#8A8186]">ステータス</span>
                <div className="flex max-w-full gap-1 overflow-x-auto">
                  {leadFilterTabs.map(([value, label]) => {
                    const count = leads.filter((lead) => (monthFilter === ALL_MONTHS || leadMonthKey(lead) === monthFilter) && (value === "all" ? true : lead.status === value)).length;
                    return <button className={`shrink-0 rounded-none border px-3 py-2 text-xs font-medium ${status === value ? value === "lost" ? "border-[#111] bg-[#111] text-white" : "border-[#EC6F8B] bg-[#FFF0F3] text-[#B84563]" : "border-[#EEEAE8] bg-white text-neutral-500"}`} key={value} onClick={() => setStatus(value)} type="button">{label} <span className="ml-1 text-[11px] opacity-70">{count}</span></button>;
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[1080px] grid-cols-[70px_1.05fr_1.35fr_1fr_0.9fr_0.95fr_1.25fr] gap-4 border-b border-[#EEEAE8] bg-[#FAF9F8] py-3 pl-8 pr-6 text-xs font-medium text-neutral-400">
              <span>実施月</span><span>商材</span><span>会社</span><span>担当者</span><span>業種</span><span>ステータス</span><span>次回予定</span>
            </div>
            {loading ? <SkeletonList count={6} media={false} /> : null}
            {!loading && filtered.length === 0 ? <EmptyState title="営業対象はありません" description="条件に一致する営業対象はありません。" /> : null}
            {filtered.map((lead) => <LeadRow key={lead.id} lead={lead} nextAction={nextActionDisplay(lead, calendarEvents)} saving={saving} onSelect={() => setRoute({ id: lead.id, tab: "activity" })} onStatusChange={(nextStatus) => void saveLeadStatus(lead, nextStatus)} />)}
          </div>
        </section>

      {selectedLead ? <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoute({ id: null }); }}>
        <aside className="ml-auto h-full w-full max-w-5xl overflow-y-auto border-l border-[#EAE5E3] bg-white shadow-2xl">
          <div className="sticky top-0 z-20 flex justify-end bg-white/95 p-4 backdrop-blur">
            <button className="grid h-10 w-10 place-items-center rounded-none hover:bg-[#F8F6F5]" onClick={() => setRoute({ id: null })} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
          </div>
          <div className="space-y-5 px-8 pb-8">
            <LeadHeader lead={selectedLead} saving={saving} onActivity={() => setActivityOpen(true)} onEdit={() => openEditLead(selectedLead)} onEmail={() => setEmailOpen(true)} onStatusChange={(nextStatus) => void saveLeadStatus(selectedLead, nextStatus)} />
            <NextActionPanel lead={selectedLead} nextAction={nextActionDisplay(selectedLead, calendarEvents)} onNextAction={openNextAction} />
            <LeadSummaryStrip lead={selectedLead} />
            {selectedLead.status === "lost" ? <LostReasonCard key={selectedLead.id} lead={selectedLead} saving={saving} onSave={(lostReason) => void saveLostReason(selectedLead, lostReason)} /> : null}
            <LeadMemoCard activities={activities} lead={selectedLead} />
            <div className="bg-white">
              <div className="flex overflow-x-auto border-b border-[#E5E7EB]">
                {tabs.map(([value, label]) => <button className={`h-12 shrink-0 px-5 text-sm font-bold ${selectedTab === value ? "border-b-2 border-[#EC6F8B] text-[#EC6F8B]" : "text-[#6F676B]"}`} key={value} onClick={() => setRoute({ id: selectedLead.id, tab: value })} type="button">{label}</button>)}
              </div>
              <div className="pt-5">
                {selectedTab === "activity" ? <ActivityTab activities={activities} records={selectedRecords} /> : null}
                {selectedTab === "meetings" ? <MeetingsTab records={selectedRecords} /> : null}
                {selectedTab === "tasks" ? <TasksTab tasks={selectedTasks} /> : null}
                {selectedTab === "files" ? <EmptyState icon={UploadCloud} title="ファイルはまだありません" description="会社化後も参照できるファイル基盤として次フェーズで接続します。" /> : null}
                {selectedTab === "notes" ? <NotesTab activities={activities} lead={selectedLead} /> : null}
              </div>
            </div>
          </div>
        </aside>
      </div> : null}

      {createOpen ? <LeadModal allowAudio audioUploadProgress={audioUploadProgress} draft={draft} mode="create" onChange={setDraft} onClose={() => setCreateOpen(false)} onSave={saveLead} products={products} saving={saving} /> : null}
      {editingLead ? <LeadModal draft={draft} mode="edit" onChange={setDraft} onClose={() => setEditingLead(null)} onSave={saveLeadEdit} products={products} saving={saving} /> : null}
      {activityOpen && selectedLead ? <ActivityModal draft={activityDraft} onChange={setActivityDraft} onClose={() => setActivityOpen(false)} onSave={saveActivity} saving={saving} /> : null}
      {nextActionOpen && selectedLead ? <NextActionModal draft={nextActionDraft} onChange={setNextActionDraft} onClose={() => setNextActionOpen(false)} onSave={saveNextAction} saving={saving} /> : null}
      {emailOpen && selectedLead ? <EmailPrepModal calendars={calendarEvents.filter((event) => isRelatedToLead(event, selectedLead)).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()).slice(0, 8)} lead={selectedLead} templates={templates} onClose={() => setEmailOpen(false)} /> : null}
    </section>
  );
}

function LeadRow({ lead, nextAction, saving, onSelect, onStatusChange }: { lead: Lead; nextAction: NextActionView; saving: boolean; onSelect: () => void; onStatusChange: (status: LeadStatus) => void }) {
  const lost = lead.status === "lost";
  const statusStyle = leadStatusCellStyle(lead.status);
  return (
    <div className={`grid min-w-[1080px] w-full cursor-pointer grid-cols-[70px_1.05fr_1.35fr_1fr_0.9fr_0.95fr_1.25fr] items-center gap-4 border-b py-4 pl-8 pr-6 text-left transition ${lost ? "border-[#303030] bg-[#1F1F22] text-white hover:bg-[#29292D]" : "border-[#EEEAE8] hover:bg-[#FCFAFA]"}`} role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(); }}>
      <div className="min-w-0 text-left"><span className={`block truncate text-sm font-medium ${lost ? "text-[#F5C8D3]" : "text-[#B84563]"}`}>{formatLeadMonth(lead)}</span></div>
      <div className={`min-w-0 truncate text-left text-sm font-medium ${lost ? "text-[#E8E8E8]" : "text-[#5E565A]"}`}>{lead.productName || "未設定"}</div>
      <div className="min-w-0 text-left"><span className={`block truncate text-sm font-medium ${lost ? "text-white" : "text-[#2B2B2B]"}`}>{lead.companyName}</span></div>
      <div className="min-w-0 text-left"><span className={`block truncate text-sm font-medium ${lost ? "text-[#E8E8E8]" : "text-[#5E565A]"}`}>{lead.contactName || "未設定"}</span>{lead.contactRole ? <span className={`mt-1 block truncate text-xs ${lost ? "text-[#AAA]" : "text-[#999]"}`}>{lead.contactRole}</span> : null}</div>
      <div className={`min-w-0 truncate text-left text-sm font-medium ${lost ? "text-[#E8E8E8]" : "text-[#5E565A]"}`}>{lead.industry || "未設定"}</div>
      <label className="relative inline-flex h-9 min-w-0 cursor-pointer items-center rounded-md border px-2.5 shadow-sm" style={statusStyle} onClick={(event) => event.stopPropagation()}>
        <span className="truncate text-xs font-medium">{leadStatusLabels[lead.status]}</span>
        <select className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" disabled={saving} value={lead.status} onChange={(event) => onStatusChange(event.target.value as LeadStatus)} aria-label="ステータスを変更">
          {leadStatusOptions.map(([value, label]) => <option className="text-[#2B2B2B]" key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className={`min-w-0 text-left text-sm font-medium ${lost ? "text-[#E8E8E8]" : "text-[#5E565A]"}`}>
        {nextAction.source !== "none" ? <span className="block truncate">{nextAction.title}</span> : null}
        {nextAction.meta ? <span className={`mt-1 block truncate text-xs ${lost ? "text-[#AAA]" : "text-[#999]"}`}>{nextAction.meta}</span> : null}
      </div>
    </div>
  );
}

function LeadHeader({ lead, saving, onActivity, onEdit, onEmail, onStatusChange }: { lead: Lead; saving: boolean; onActivity: () => void; onEdit: () => void; onEmail: () => void; onStatusChange: (status: LeadStatus) => void }) {
  const compact = [
    lead.contactName ? <span className="inline-flex items-center gap-1" key="contact"><Building2 className="h-4 w-4" />{lead.contactName}</span> : null,
    lead.contactRole ? <span className="rounded-md bg-[#FFF0F3] px-2 py-0.5 text-xs font-medium text-[#EC6F8B]" key="role">{lead.contactRole}</span> : null,
    lead.phone ? <span className="inline-flex items-center gap-1" key="phone"><Phone className="h-4 w-4" />{lead.phone}</span> : null,
    lead.email ? <span className="inline-flex items-center gap-1" key="email"><Mail className="h-4 w-4" />{lead.email}</span> : null,
    lead.website ? <a className="inline-flex items-center gap-1 text-[#EC6F8B]" href={normalizeWebsiteUrl(lead.website)} key="website" rel="noreferrer" target="_blank"><LinkIcon className="h-4 w-4" />HP</a> : null
  ].filter(Boolean);
  return (
    <section className="border-b border-[#E5E7EB] pb-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-2xl font-semibold tracking-normal text-[#111827]">{lead.companyName}</h2>
            <span className={`rounded-lg px-3 py-1 text-xs font-medium ${leadStatusTone(lead.status)}`}>{leadStatusLabels[lead.status]}</span>
            <label className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#F0E7E9] bg-white px-2 text-xs font-medium text-[#6F676B]">
              <span>ステータス</span>
              <select className="bg-transparent text-xs font-medium text-[#2B2B2B] outline-none disabled:opacity-50" disabled={saving} value={lead.status} onChange={(event) => onStatusChange(event.target.value as LeadStatus)}>
                {leadStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          {compact.length ? <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-[#4B5563]">{compact}</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#374151]" onClick={onEmail} type="button"><Mail className="h-4 w-4 text-[#EC6F8B]" />メール作成</button>
          {lead.website ? <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#374151]" href={normalizeWebsiteUrl(lead.website)} rel="noreferrer" target="_blank"><LinkIcon className="h-4 w-4 text-[#EC6F8B]" />HP</a> : null}
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-5 text-xs font-medium text-white shadow-[0_8px_18px_rgba(236,111,139,0.2)]" onClick={onActivity} type="button"><Plus className="h-4 w-4" />活動を追加</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#374151]" onClick={onEdit} type="button"><Edit2 className="h-4 w-4" />編集</button>
        </div>
      </div>
    </section>
  );
}

function NextActionPanel({ lead, nextAction, onNextAction }: { lead: Lead; nextAction: NextActionView; onNextAction: () => void }) {
  const needsFollow = lead.status === "appointment" || lead.status === "document_sent" || lead.status === "sent" || lead.status === "contacting";
  return (
    <section className="flex flex-col gap-4 rounded-none bg-[#FFF4F7] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FFE2E9] text-[#EC6F8B]"><Target className="h-6 w-6" /></span>
        <div className="min-w-0">
          <h3 className="text-base font-medium text-[#111827]">{needsFollow ? "次の対応を設定して、商談につなげましょう" : "次の対応を整理しましょう"}</h3>
          <p className="mt-1 text-sm font-normal leading-6 text-[#4B5563]">{nextAction.source !== "none" ? `${nextAction.title}${nextAction.meta ? ` / ${nextAction.meta}` : ""}` : `${leadStatusLabels[lead.status]}後のフォローや打ち合わせの日程を登録できます。`}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#F7AFC0] bg-white px-5 text-xs font-medium text-[#EC6F8B]" onClick={onNextAction} type="button"><Plus className="h-4 w-4" />次回予定を設定</button>
      </div>
    </section>
  );
}

function LeadSummaryStrip({ lead }: { lead: Lead }) {
  const items: Array<{ label: string; value?: string | null; Icon: LucideIcon }> = [
    { label: "実施月", value: formatLeadMonth(lead), Icon: CalendarDays },
    { label: "会社名", value: lead.companyName, Icon: Building2 },
    { label: "担当者", value: lead.contactName, Icon: Building2 },
    { label: "役職", value: lead.contactRole, Icon: Archive },
    { label: "電話", value: lead.phone, Icon: Phone },
    { label: "メール", value: lead.email, Icon: Mail },
    { label: "HP URL", value: lead.website, Icon: LinkIcon },
    { label: "ステータス", value: leadStatusLabels[lead.status], Icon: Target },
    { label: "商材", value: lead.productName, Icon: LinkIcon }
  ].filter((item) => Boolean(item.value));
  return (
    <section className="grid gap-4 rounded-none border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ label, value, Icon }) => (
        <div className="min-w-0" key={label}>
          <p className="flex items-center gap-2 text-xs font-medium text-[#6B7280]"><Icon className="h-4 w-4 text-[#EC6F8B]" />{label}</p>
          <p className="mt-2 truncate text-sm font-medium text-[#111827]">{value}</p>
        </div>
      ))}
    </section>
  );
}

function LostReasonCard({ lead, saving, onSave }: { lead: Lead; saving: boolean; onSave: (lostReason: string) => void }) {
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "");
  const changed = lostReason.trim() !== (lead.lostReason ?? "").trim();
  return (
    <section className="rounded-none border border-[#2F2F2F] bg-[#1F1F22] p-5 text-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-medium">失注理由</h3>
          <p className="mt-1 text-sm font-normal text-[#CFCFCF]">次に同じ条件で営業するときの判断材料として残します。</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-5 text-xs font-medium text-[#242424] disabled:opacity-50" disabled={saving || !changed} onClick={() => onSave(lostReason)} type="button">{saving ? "保存中..." : "保存"}</button>
      </div>
      <textarea className="mt-4 min-h-32 w-full resize-y rounded-none border border-[#444] bg-[#111] p-3 text-sm font-normal leading-6 text-white outline-none placeholder:text-[#777] focus:border-[#EC6F8B]" placeholder="例: 予算が合わない、導入時期が先、担当者と連絡が取れない など" value={lostReason} onChange={(event) => setLostReason(event.target.value)} />
    </section>
  );
}

function LeadMemoCard({ lead, activities }: { lead: Lead; activities: Activity[] }) {
  const latestActivityMemo = activities.find((activity) => activity.content?.trim());
  if (!lead.notes?.trim() && !latestActivityMemo?.content?.trim()) return null;
  return (
    <section className="rounded-none border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <h3 className="flex items-center gap-2 text-base font-medium text-[#111827]"><CalendarDays className="h-5 w-5 text-[#EC6F8B]" />メモ</h3>
      {latestActivityMemo?.content?.trim() ? <div className="mt-4 rounded-none bg-[#FFF8FA] p-4"><p className="text-xs font-medium text-[#EC6F8B]">最新の活動メモ</p><p className="mt-2 whitespace-pre-wrap text-sm font-normal leading-7 text-[#111827]">{latestActivityMemo.content}</p></div> : null}
      {lead.notes?.trim() ? <div className="mt-4 rounded-none bg-[#F9FAFB] p-4"><p className="text-xs font-medium text-[#6B7280]">登録時メモ</p><p className="mt-2 whitespace-pre-wrap text-sm font-normal leading-7 text-[#111827]">{lead.notes}</p></div> : null}
    </section>
  );
}

function ActivityTab({ activities, records }: { activities: Activity[]; records: TeleapoRecord[] }) {
  const items = [
    ...activities.filter((activity) => activity.title !== "見込み客を登録しました" && activity.title !== "営業リストを登録しました").map((activity) => ({ id: `activity-${activity.id}`, at: activity.occurredAt, kind: "activity" as const, activity })),
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
      <span className="absolute -left-[34px] top-4 grid h-7 w-7 place-items-center rounded-none border border-[#F7CAD2] bg-[#FFF0F3] text-xs font-medium text-[#EC6F8B]">{activityTypeLabels[activity.type].slice(0, 1)}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-medium text-[#EC6F8B]">{activityTypeLabels[activity.type]}</span>
        <span className="text-xs font-medium text-[#8A8186]">{activity.occurredAt.toDate().toLocaleDateString("ja-JP")}</span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-[#2B2B2B]">{activity.title || activityTypeLabels[activity.type]}</h3>
      {activity.content ? <p className="mt-3 whitespace-pre-wrap rounded-none bg-[#FFFBFC] p-3 text-sm font-normal leading-6 text-[#6F676B]">{activity.content}</p> : null}
      {activity.nextActionTitle ? <p className="mt-3 text-sm font-medium text-[#D94F6E]">次回予定: {activity.nextActionTitle} / {formatMaybeDate(activity.nextActionAt?.toDate())}</p> : null}
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
        <span className="text-xs font-bold text-[#8A8186]">{record.recordedAt.toDate().toLocaleDateString("ja-JP")}</span>
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
  if (!tasks.length) return <EmptyState icon={CheckCircle2} title="タスクはまだありません" description="営業リストに紐づくタスクを表示します。" />;
  return <div className="grid gap-3">{tasks.map((task) => <div className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4" key={task.id}><p className="font-bold text-[#2B2B2B]">{task.title}</p><p className="mt-1 text-sm font-semibold text-[#777]">{task.assigneeName || "担当者未設定"} / {task.status}</p></div>)}</div>;
}

function NotesTab({ lead, activities }: { lead: Lead; activities: Activity[] }) {
  const memoActivities = activities.filter((activity) => activity.content?.trim());
  return (
    <div className="grid gap-4">
      {lead.notes?.trim() ? <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4"><p className="text-xs font-bold text-[#6B7280]">登録時メモ</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#2B2B2B]">{lead.notes}</p></section> : null}
      {memoActivities.length ? memoActivities.map((activity) => (
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4" key={activity.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-none bg-[#FFF0F3] px-2.5 py-1 text-xs font-medium text-[#EC6F8B]">{activityTypeLabels[activity.type]}</span>
            <time className="text-xs font-medium text-[#8A8186]">{activity.occurredAt.toDate().toLocaleDateString("ja-JP")}</time>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm font-normal leading-7 text-[#2B2B2B]">{activity.content}</p>
        </section>
      )) : null}
      {!lead.notes?.trim() && !memoActivities.length ? <EmptyState icon={StickyNote} title="メモはまだありません" description="活動ログにメモを残すと、ここに時系列で表示されます。" /> : null}
    </div>
  );
}

function LeadModal({ draft, mode, products, saving, audioUploadProgress = 0, allowAudio = false, onChange, onSave, onClose }: { draft: LeadDraft; mode: "create" | "edit"; products: Product[]; saving: boolean; audioUploadProgress?: number; allowAudio?: boolean; onChange: (draft: LeadDraft) => void; onSave: (audioFile?: File | null) => void; onClose: () => void }) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  return (
    <Modal title={mode === "create" ? "営業リストを登録" : "営業リストを編集"} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="会社名" value={draft.companyName} onChange={(companyName) => onChange({ ...draft, companyName })} required />
        <Input label="担当者" value={draft.contactName} onChange={(contactName) => onChange({ ...draft, contactName })} />
        <Input label="役職" value={draft.contactRole} onChange={(contactRole) => onChange({ ...draft, contactRole })} />
        <Input label="電話" value={draft.phone} onChange={(phone) => onChange({ ...draft, phone })} />
        <Input label="メール" value={draft.email} onChange={(email) => onChange({ ...draft, email })} />
        <Input label="HP URL" type="url" value={draft.website} onChange={(website) => onChange({ ...draft, website })} />
        <IndustrySelect label="業種" value={draft.industry} onChange={(industry) => onChange({ ...draft, industry })} />
        <SearchBox label="関連商材" value={draft.productId} options={products.map((product) => ({ value: product.id, label: product.name }))} onChange={(nextProductId) => { const product = products.find((item) => item.id === nextProductId); onChange({ ...draft, productId: nextProductId, productName: product?.name ?? "" }); }} />
        <MonthSelect label="実施月" value={draft.appointmentAt} onChange={(appointmentAt) => onChange({ ...draft, appointmentAt })} />
        <SelectBox label="ステータス" value={draft.status === "document_sent" || draft.status === "sent" ? draft.status : "appointment"} options={leadCreateStatusOptions} onChange={(status) => onChange({ ...draft, status: status as LeadStatus })} />
        <div className="sm:col-span-2"><Text label="メモ" value={draft.notes} onChange={(notes) => onChange({ ...draft, notes })} /></div>
        {allowAudio ? (
          <div className="sm:col-span-2">
            <label className="grid gap-2 text-sm font-bold text-[#655D62]">
              音声
              <input accept="audio/*,video/mp4,.m4a,.mp4" className="task-input file:mr-4 file:border-0 file:bg-[#FFF0F3] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#EC6F8B]" disabled={saving} type="file" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} />
            </label>
            {audioFile ? <p className="mt-2 text-xs font-medium text-[#8A8186]">{audioFile.name}</p> : null}
            {saving && audioUploadProgress > 0 ? <p className="mt-2 text-xs font-medium text-[#EC6F8B]">アップロード中 {audioUploadProgress}%</p> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
        <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !draft.companyName.trim()} onClick={() => void onSave(audioFile)} type="button">{saving ? "保存中..." : "保存"}</button>
      </div>
    </Modal>
  );
}

function ActivityModal({ draft, saving, onChange, onSave, onClose }: { draft: ActivityDraft; saving: boolean; onChange: (draft: ActivityDraft) => void; onSave: () => void; onClose: () => void }) {
  return (
    <Modal title="活動ログを追加" onClose={onClose}>
      <div className="grid gap-5">
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4">
          <h3 className="text-sm font-medium text-[#2B2B2B]">活動ログ</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SelectBox label="種類" value={draft.type} options={activityTypeOptions} onChange={(type) => onChange({ ...draft, type: type as ActivityDraft["type"] })} />
            <div className="sm:col-span-2"><Input label="タイトル" value={draft.title} onChange={(title) => onChange({ ...draft, title })} /></div>
            <div className="sm:col-span-2"><Text label="内容" value={draft.content} onChange={(content) => onChange({ ...draft, content })} /></div>
          </div>
        </section>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
        <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void onSave()} type="button">{saving ? "保存中..." : "保存"}</button>
      </div>
    </Modal>
  );
}

function NextActionModal({ draft, saving, onChange, onSave, onClose }: { draft: NextActionDraft; saving: boolean; onChange: (draft: NextActionDraft) => void; onSave: () => void; onClose: () => void }) {
  return (
    <Modal title="次回予定を追加" onClose={onClose}>
      <div className="grid gap-4">
        <Input label="次回予定" value={draft.nextActionTitle} onChange={(nextActionTitle) => onChange({ ...draft, nextActionTitle })} />
        <Input label="予定日時" type="datetime-local" value={draft.nextActionAt} onChange={(nextActionAt) => onChange({ ...draft, nextActionAt })} />
        <p className="text-xs font-normal text-[#8A8186]">日時だけでも保存できます。内容が空の場合は「次回対応」としてタスクに追加します。</p>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
        <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || (!draft.nextActionTitle.trim() && !draft.nextActionAt)} onClick={() => void onSave()} type="button">{saving ? "保存中..." : "保存"}</button>
      </div>
    </Modal>
  );
}

function EmailPrepModal({ lead, templates, calendars, onClose }: { lead: Lead; templates: BusinessTemplate[]; calendars: CalendarEvent[]; onClose: () => void }) {
  const emailTemplates = templates.filter((template) => template.category === "email" || template.category === "proposal" || template.category === "meeting");
  const [selectedTemplateId, setSelectedTemplateId] = useState(emailTemplates[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const selectedTemplate = emailTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const fallbackBody = selectedTemplate ? fillTemplate(selectedTemplate.content, lead, calendars[0]) : "";
  const fallbackSubject = selectedTemplate ? fillTemplate(selectedTemplate.subject || selectedTemplate.description || selectedTemplate.title, lead, calendars[0]) : `${lead.companyName} ${lead.productName ?? ""}`.trim();
  const resolvedSubject = subject || fallbackSubject;
  const resolvedBody = bodyText || fallbackBody;
  const mailto = `mailto:${encodeURIComponent(lead.email ?? "")}?subject=${encodeURIComponent(resolvedSubject)}&body=${encodeURIComponent(resolvedBody)}`;
  const generate = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const generated = await generateTemplateContent({
        templateId: selectedTemplate.id,
        relatedSource: "lead",
        relatedId: lead.id,
        productId: lead.productId ?? undefined
      });
      setSubject(generated.subject || fallbackSubject);
      setBodyText(generated.body || fallbackBody);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "メール文を生成できませんでした。");
    } finally {
      setGenerating(false);
    }
  };
  return (
    <Modal title="メール準備" onClose={onClose}>
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4">
          <h3 className="text-sm font-medium text-[#2B2B2B]">テンプレート</h3>
          <div className="mt-3 grid gap-3">
            {emailTemplates.length ? (
              <SearchSelect clearable={false} emptyLabel="テンプレートがありません。" options={emailTemplates.map((template) => ({ value: template.id, label: template.title }))} placeholder="テンプレートを選択" value={selectedTemplateId} onChange={(templateId) => { setSelectedTemplateId(templateId); setSubject(""); setBodyText(""); setGenerateError(null); }} />
            ) : <EmptyState icon={Mail} title="メール用テンプレートはまだありません" description="テンプレート集に登録すると、ここで確認できます。" />}
            {selectedTemplate ? (
              <>
                <button className="inline-flex h-10 w-fit items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={generating} onClick={() => void generate()} type="button"><Mail className="h-4 w-4" />{generating ? "生成中..." : "AIで文面作成"}</button>
                <Input label="件名" value={resolvedSubject} onChange={setSubject} />
                <Text label="本文" value={resolvedBody} onChange={setBodyText} />
                {generateError ? <p className="text-sm font-medium text-[#D94F6E]">{generateError}</p> : null}
              </>
            ) : null}
          </div>
        </section>
        <aside className="grid gap-4">
          <section className="rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4">
            <h3 className="text-sm font-medium text-[#2B2B2B]">差し込み情報</h3>
            <div className="mt-3 grid gap-2 text-sm font-normal text-[#5E565A]">
              <p>会社: {lead.companyName}</p>
              <p>担当者: {lead.contactName || "未設定"}</p>
              <p>商材: {lead.productName || "未設定"}</p>
              <p>ステータス: {leadStatusLabels[lead.status]}</p>
            </div>
          </section>
          <section className="rounded-none border border-[#F0E7E9] bg-white p-4">
            <h3 className="text-sm font-medium text-[#2B2B2B]">関連予定</h3>
            {calendars.length ? (
              <div className="mt-3 divide-y divide-[#F0E7E9]">
                {calendars.map((event) => <div className="py-3" key={event.id}><p className="text-sm font-medium text-[#2B2B2B]">{event.title}</p><p className="mt-1 text-xs font-normal text-[#8A8186]">{formatCalendarDate(event)}</p></div>)}
              </div>
            ) : <p className="mt-3 text-sm font-normal text-[#8A8186]">関連予定はまだありません。</p>}
          </section>
          <div className="flex flex-wrap justify-end gap-3">
            {lead.email ? <a className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-medium text-white" href={mailto}><Mail className="h-4 w-4" />メールを開く</a> : null}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm"><section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-bold text-[#2B2B2B]">{title}</h2><button className="grid h-9 w-9 shrink-0 place-items-center rounded-none text-[#8A8186] hover:bg-[#FFF0F3] hover:text-[#EC6F8B]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button></div><div className="mt-5">{children}</div></section></div>;
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
  return { type: "call", leadStatus: "", title: "", content: "", productId: "", productName: "", occurredAt: toDatetimeLocalInput(new Date()), nextActionAt: "", nextActionTitle: "" };
}

function formatLeadMonth(lead: Lead): string {
  const date = lead.appointmentAt?.toDate();
  if (!date) return "未設定";
  return date.toLocaleDateString("ja-JP", { month: "numeric" });
}

function leadMonthKey(lead: Lead): string {
  const date = lead.appointmentAt?.toDate();
  if (!date) return UNSET_MONTH;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthTabs(leads: Lead[], status: LeadStatus | "all") {
  const scoped = leads.filter((lead) => status === "all" ? true : lead.status === status);
  const counts = new Map<string, { label: string; count: number; sort: number }>();
  scoped.forEach((lead) => {
    const key = leadMonthKey(lead);
    const date = lead.appointmentAt?.toDate();
    const current = counts.get(key);
    counts.set(key, {
      label: key === UNSET_MONTH ? "未設定" : date ? `${date.getMonth() + 1}月` : "未設定",
      count: (current?.count ?? 0) + 1,
      sort: key === UNSET_MONTH ? -1 : Number(key.replace("-", ""))
    });
  });
  const monthTabs = Array.from(counts, ([value, data]) => ({ value, ...data }))
    .filter((tab) => tab.value !== UNSET_MONTH)
    .sort((a, b) => b.sort - a.sort);
  const unset = counts.get(UNSET_MONTH);
  return [
    { value: ALL_MONTHS, label: "すべて", count: scoped.length, sort: Number.MAX_SAFE_INTEGER },
    ...monthTabs,
    ...(unset ? [{ value: UNSET_MONTH, label: "未設定", count: unset.count, sort: unset.sort }] : [])
  ];
}

function nextActionDisplay(lead: Lead, events: CalendarEvent[]): NextActionView {
  if (lead.nextActionTitle || lead.nextActionAt) {
    return {
      title: lead.nextActionTitle || "次回対応",
      meta: lead.nextActionAt ? formatMaybeDate(lead.nextActionAt.toDate()) : "",
      source: "lead"
    };
  }
  const now = Date.now();
  const nextEvent = events
    .filter((event) => isRelatedToLead(event, lead) && event.startAt.toMillis() >= now)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())[0];
  if (!nextEvent) return { title: "", meta: "", source: "none" };
  return {
    title: nextEvent.title || nextEvent.companyName || "カレンダー予定",
    meta: `${formatMaybeDate(nextEvent.startAt.toDate())} / カレンダー`,
    source: "calendar"
  };
}

function isRelatedToLead(item: CalendarEvent | Activity, lead: Lead): boolean {
  if ("leadId" in item && item.leadId === lead.id) return true;
  if (lead.companyId && "companyId" in item && item.companyId === lead.companyId) return true;
  if ("relatedType" in item && item.relatedType === "lead" && item.relatedId === lead.id) return true;
  if ("relatedType" in item && item.relatedType === "company" && lead.companyId && item.relatedId === lead.companyId) return true;
  if ("companyName" in item && item.companyName && item.companyName === lead.companyName) return true;
  return false;
}

function MonthSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const selectedMonth = value ? String(new Date(value).getMonth() + 1) : "";
  const year = value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).getFullYear() : new Date().getFullYear();
  return (
    <label className="grid gap-1 text-sm font-bold text-[#655D62]">
      {label}
      <SingleSelect
        clearable
        options={Array.from({ length: 12 }, (_, index) => {
          const month = index + 1;
          return { value: String(month), label: `${month}月` };
        })}
        placeholder="未選択"
        value={selectedMonth}
        onChange={(month) => onChange(month ? `${year}-${month.padStart(2, "0")}-01` : "")}
      />
    </label>
  );
}

function IndustrySelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-[#655D62]">
      {label}
      <SingleSelect clearable options={industryOptions} placeholder="未選択" value={value} onChange={onChange} />
    </label>
  );
}

function formatCalendarDate(event: CalendarEvent) {
  return event.startAt.toDate().toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function fillTemplate(content: string, lead: Lead, event?: CalendarEvent) {
  const nextDate = event ? formatCalendarDate(event) : "";
  return content
    .replace(/\{\{\s*会社名\s*\}\}|\{会社名\}/g, lead.companyName)
    .replace(/\{\{\s*担当者名\s*\}\}|\{担当者名\}/g, lead.contactName || "ご担当者")
    .replace(/\{\{\s*商材名\s*\}\}|\{商材名\}/g, lead.productName || "")
    .replace(/\{\{\s*次回予定\s*\}\}|\{次回予定\}/g, nextDate);
}

function leadToDraft(lead: Lead): LeadDraft {
  return {
    companyName: lead.companyName,
    contactName: lead.contactName ?? "",
    contactRole: lead.contactRole ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    website: lead.website ?? "",
    industry: lead.industry ?? "",
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
    lostReason: lead.lostReason ?? "",
    companyId: lead.companyId ?? ""
  };
}

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function compareLeads(a: Lead, b: Lead, sort: LeadSort): number {
  if (sort === "companyName") return a.companyName.localeCompare(b.companyName, "ja");
  if (sort === "nextAction") return (a.nextActionAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.nextActionAt?.toMillis() ?? Number.MAX_SAFE_INTEGER);
  if (sort === "lastActivity") return (b.lastActivityAt?.toMillis() ?? 0) - (a.lastActivityAt?.toMillis() ?? 0);
  if (sort === "rank") return (a.prospectRank ?? "").localeCompare(b.prospectRank ?? "", "ja");
  const monthDiff = leadMonthSortValue(b) - leadMonthSortValue(a);
  if (monthDiff !== 0) return monthDiff;
  return b.updatedAt.toMillis() - a.updatedAt.toMillis();
}

function leadMonthSortValue(lead: Lead): number {
  return lead.appointmentAt?.toMillis() ?? 0;
}

function readStatusParam(value: string | null): LeadStatus | "all" {
  if (value === "new" || value === "contacting" || value === "document_sent" || value === "sent" || value === "appointment" || value === "meeting" || value === "considering" || value === "hold" || value === "won" || value === "lost") return value;
  return "all";
}

function readTabParam(value: string | null): TabKey {
  if (value === "meetings" || value === "tasks" || value === "files" || value === "notes") return value;
  return "activity";
}

function leadStatusCellStyle(status: LeadStatus) {
  if (status === "appointment" || status === "meeting") return { backgroundColor: "#EC2F7A", borderColor: "#EC2F7A", color: "#FFFFFF" };
  if (status === "document_sent" || status === "sent") return { backgroundColor: "#FF8A3D", borderColor: "#FF8A3D", color: "#FFFFFF" };
  if (status === "contacting") return { backgroundColor: "#6E3F4D", borderColor: "#6E3F4D", color: "#FFFFFF" };
  if (status === "hold") return { backgroundColor: "#FFE45C", borderColor: "#E8C72D", color: "#6B5200" };
  if (status === "considering") return { backgroundColor: "#2F80ED", borderColor: "#2F80ED", color: "#FFFFFF" };
  if (status === "won") return { backgroundColor: "#22A06B", borderColor: "#22A06B", color: "#FFFFFF" };
  if (status === "lost") return { backgroundColor: "#242424", borderColor: "#242424", color: "#FFFFFF" };
  return { backgroundColor: "#F7F7F7", borderColor: "#D9D9D9", color: "#555555" };
}
