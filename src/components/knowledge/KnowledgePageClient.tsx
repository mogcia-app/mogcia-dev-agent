"use client";

import { Archive, ArrowRight, Bookmark, Copy, Download, Edit2, Eye, MessageSquareText, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SkeletonList } from "@/components/ui/loading";
import { MultiSelect, SingleSelect } from "@/components/ui/select";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { useKnowledgeList } from "@/hooks/useKnowledgeList";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { useProducts } from "@/hooks/useProducts";
import { exportKnowledgeCsv } from "@/lib/knowledge-export";
import { emptyKnowledgeDraft, knowledgeToDraft, knowledgeTypeLabels, sourceLabels, typeTone, visibilityLabels } from "@/lib/knowledge-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { Knowledge, KnowledgeDraft, KnowledgeSort, KnowledgeType, KnowledgeVisibility } from "@/types/knowledge";

const pageSize = 20;
const sortOptions: Array<[KnowledgeSort, string]> = [["newest", "新しい順"], ["oldest", "古い順"], ["updated", "更新順"], ["views", "閲覧数順"], ["favorite", "お気に入り優先"]];

export function KnowledgePageClient() {
  const store = useKnowledgeList();
  const products = useProducts();
  const workspace = useWorkspaceOptions();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const q = params.get("q") ?? "";
  const sort = (params.get("sort") as KnowledgeSort | null) ?? "newest";
  const [query, setQuery] = useState(q);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Knowledge | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setRoute = useCallback((next: { id?: string | null; q?: string; sort?: KnowledgeSort }) => {
    const search = new URLSearchParams(params.toString());
    if (next.id !== undefined) next.id ? search.set("id", next.id) : search.delete("id");
    if (next.q !== undefined) next.q ? search.set("q", next.q) : search.delete("q");
    if (next.sort !== undefined) next.sort === "newest" ? search.delete("sort") : search.set("sort", next.sort);
    router.replace(`${pathname}${search.toString() ? `?${search.toString()}` : ""}` as Route, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setRoute({ q: query }), 300);
    return () => window.clearTimeout(timer);
  }, [query, setRoute]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const searched = store.items.filter((item) => {
      if (item.status === "archived") return false;
      if (!needle) return true;
      return [item.title, item.summary, item.content, item.customerQuote, item.tags.join(" "), item.productNames?.join(" "), item.companyName, item.projectName, item.meetingTitle, item.createdByName].join(" ").toLowerCase().includes(needle);
    });
    return searched.sort((a, b) => {
      if (sort === "oldest") return a.createdAt.toMillis() - b.createdAt.toMillis();
      if (sort === "updated") return b.updatedAt.toMillis() - a.updatedAt.toMillis();
      if (sort === "views") return b.viewCount - a.viewCount;
      if (sort === "favorite") return (b.favoriteUserIds.length - a.favoriteUserIds.length) || b.createdAt.toMillis() - a.createdAt.toMillis();
      return b.createdAt.toMillis() - a.createdAt.toMillis();
    });
  }, [q, sort, store.items]);

  const selectedItem = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const paged = filtered.slice(0, page * pageSize);

  useEffect(() => {
    if (!selectedId && selectedItem) setRoute({ id: selectedItem.id });
  }, [selectedId, selectedItem, setRoute]);

  useEffect(() => {
    if (selectedItem) void store.incrementView(selectedItem.id);
  }, [selectedItem, store]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="">
      <PageHeader
        title="ナレッジ"
        description="営業活動の知識やノウハウを検索・共有できます"
        actions={
          <>
            <button className="inline-flex h-11 items-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />新しいナレッジを作成</button>
            <button className="inline-flex h-11 items-center gap-2 rounded-none bg-white px-5 text-sm font-bold text-[#6F676B] shadow-sm ring-1 ring-[#F0E7E9]" onClick={() => exportKnowledgeCsv(filtered)} type="button"><Download className="h-4 w-4" />エクスポート</button>
          </>
        }
      />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={store.error} type="error" /></div>
      <div className="mt-5 flex justify-center">
        <label className="flex h-14 w-full max-w-3xl items-center gap-3 rounded-none border border-[#F0E7E9] bg-white px-5 text-sm font-bold text-[#777] shadow-sm">
          <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="キーワードで検索（タイトル・内容・タグ・発言者など）" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          <Search className="h-5 w-5" />
        </label>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(360px,42%)_minmax(0,1fr)]">
        <section className="rounded-none border border-[#F0E7E9] bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#6F676B]">検索結果：{filtered.length}件</p>
            <div className="w-40">
              <SingleSelect options={sortOptions.map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => setRoute({ sort: value as KnowledgeSort })} />
            </div>
          </div>
          <div className="space-y-3">
            {store.loading ? <KnowledgeSkeleton /> : null}
            {!store.loading && filtered.length === 0 ? <EmptyKnowledge onCreate={() => setCreateOpen(true)} hasQuery={Boolean(q)} /> : null}
            {paged.map((item) => (
              <KnowledgeListItem
                active={selectedItem?.id === item.id}
                favorite={item.favoriteUserIds.includes(store.user?.uid ?? "")}
                item={item}
                key={item.id}
                onFavorite={async () => { await store.toggleFavorite(item); flash(item.favoriteUserIds.includes(store.user?.uid ?? "") ? "お気に入りから削除しました" : "お気に入りに追加しました"); }}
                onSelect={() => setRoute({ id: item.id })}
              />
            ))}
          </div>
          {paged.length < filtered.length ? <button className="mt-4 h-11 w-full rounded-none border border-[#F0E7E9] text-sm font-bold text-[#EC6F8B]" onClick={() => setPage((current) => current + 1)} type="button">さらに読み込む</button> : null}
        </section>
        <section className="min-w-0">
          {selectedItem ? (
            <KnowledgeDetail
              canDelete={store.isAdmin}
              canEdit={store.isAdmin || selectedItem.createdBy === store.user?.uid}
              favorite={selectedItem.favoriteUserIds.includes(store.user?.uid ?? "")}
              item={selectedItem}
              onArchive={async () => { await store.archiveKnowledge(selectedItem.id); flash("ナレッジをアーカイブしました"); }}
              onDelete={async () => { await store.deleteKnowledge(selectedItem.id); flash("ナレッジを削除しました"); setRoute({ id: null }); }}
              onDuplicate={async () => { const id = await store.duplicateKnowledge(selectedItem); flash("ナレッジを複製しました"); setRoute({ id }); }}
              onEdit={() => setEditingItem(selectedItem)}
              onFavorite={async () => { await store.toggleFavorite(selectedItem); flash(selectedItem.favoriteUserIds.includes(store.user?.uid ?? "") ? "お気に入りから削除しました" : "お気に入りに追加しました"); }}
            />
          ) : (
            <div className="rounded-none border border-dashed border-[#F0E7E9] bg-white p-12 text-center text-sm font-bold text-[#8A8A8A]">左の一覧からナレッジを選択してください</div>
          )}
        </section>
      </div>
      {createOpen ? <KnowledgeFormModal mode="create" products={products.products} companies={workspace.companies} projects={workspace.projects} meetings={workspace.meetings} onClose={() => setCreateOpen(false)} onSubmit={async (draft) => { const id = await store.createKnowledge(draft); setCreateOpen(false); flash("ナレッジを作成しました"); setRoute({ id }); }} /> : null}
      {editingItem ? <KnowledgeFormModal mode="edit" initial={knowledgeToDraft(editingItem)} products={products.products} companies={workspace.companies} projects={workspace.projects} meetings={workspace.meetings} onClose={() => setEditingItem(null)} onSubmit={async (draft) => { await store.updateKnowledge(editingItem.id, draft); setEditingItem(null); flash("ナレッジを更新しました"); }} /> : null}
    </div>
  );
}

function KnowledgeListItem({ item, active, favorite, onSelect, onFavorite }: { item: Knowledge; active: boolean; favorite: boolean; onSelect: () => void; onFavorite: () => void }) {
  return (
    <button className={`grid w-full grid-cols-[64px_1fr_32px] gap-3 rounded-none border p-4 text-left ${active ? "border-[#F7CAD2] bg-[#FFF0F3]" : "border-[#F0E7E9] bg-white hover:bg-[#FFFBFC]"}`} onClick={onSelect} type="button">
      <span className={`grid h-14 w-14 place-items-center rounded-none font-bold ${typeTone(item.type)}`}>{knowledgeTypeLabels[item.type].slice(0, 2)}</span>
      <span className="min-w-0">
        <span className="block truncate text-base font-bold text-[#2B2B2B]">{item.title}</span>
        <span className="mt-2 flex flex-wrap gap-2"><Badge type={item.type} />{item.productNames?.slice(0, 1).map((name) => <span className="rounded-none bg-[#FFF0F3] px-2 py-1 text-xs font-bold text-[#EC6F8B]" key={name}>{name}</span>)}</span>
        <span className="mt-2 line-clamp-2 text-sm font-semibold text-[#777]">{item.summary || item.customerQuote || item.content || "概要未登録"}</span>
        <span className="mt-3 block text-xs font-semibold text-[#777]">{getUserDisplayNameById(item.createdBy, item.createdByName)} / {item.createdAt.toDate().toLocaleString("ja-JP")}</span>
      </span>
      <span role="button" tabIndex={0} className="grid h-8 w-8 place-items-center text-[#EC6F8B]" onClick={(event) => { event.stopPropagation(); onFavorite(); }} onKeyDown={(event) => { if (event.key === "Enter") onFavorite(); }}><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></span>
    </button>
  );
}

function KnowledgeDetail({ item, favorite, canEdit, canDelete, onFavorite, onEdit, onDuplicate, onArchive, onDelete }: { item: Knowledge; favorite: boolean; canEdit: boolean; canDelete: boolean; onFavorite: () => void; onEdit: () => void; onDuplicate: () => Promise<void>; onArchive: () => Promise<void>; onDelete: () => Promise<void>; }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chatMessage = `ナレッジ「${item.title}」について相談したいです。${item.summary ? `\n概要: ${item.summary}` : ""}`;
  const chatHref = `/agent?message=${encodeURIComponent(chatMessage)}&contextType=knowledge&contextId=${encodeURIComponent(item.id)}` as Route;
  return (
    <article className="rounded-none border border-[#F0E7E9] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Badge type={item.type} />
          <h2 className="mt-3 text-2xl font-bold text-[#2B2B2B]">{item.title}</h2>
          <div className="mt-4 flex flex-wrap gap-5 text-sm font-semibold text-[#777]">
            <span>{getUserDisplayNameById(item.createdBy, item.createdByName)}</span>
            <span>{item.createdAt.toDate().toLocaleString("ja-JP")}</span>
            <span>更新: {item.updatedAt.toDate().toLocaleString("ja-JP")}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" />閲覧: {item.viewCount}</span>
          </div>
        </div>
        <div className="relative flex gap-2">
          <Link aria-label="このナレッジをチャットで相談" className="inline-flex h-10 items-center gap-2 rounded-none bg-[#EC6F8B] px-4 text-sm font-bold text-white" href={chatHref}><MessageSquareText className="h-4 w-4" />チャットで相談<ArrowRight className="h-4 w-4" /></Link>
          <button className="grid h-10 w-10 place-items-center rounded-none border border-[#F0E7E9] text-[#EC6F8B]" onClick={onFavorite} type="button"><Bookmark className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /></button>
          {canEdit ? <button className="inline-flex h-10 items-center gap-2 rounded-none border border-[#F0E7E9] px-4 text-sm font-bold text-[#6F676B]" onClick={onEdit} type="button"><Edit2 className="h-4 w-4" />編集</button> : null}
          <button className="grid h-10 w-10 place-items-center rounded-none border border-[#F0E7E9] text-[#6F676B]" onClick={() => setMenuOpen((current) => !current)} type="button"><MoreHorizontal className="h-5 w-5" /></button>
          {menuOpen ? <div className="absolute right-0 top-12 z-10 grid w-44 gap-1 rounded-none border border-[#F0E7E9] bg-white p-2 shadow-lg"><MenuButton icon={<Copy className="h-4 w-4" />} label="複製" onClick={() => void onDuplicate()} /><MenuButton icon={<Archive className="h-4 w-4" />} label="アーカイブ" onClick={() => window.confirm("このナレッジをアーカイブしますか？") && void onArchive()} /><MenuButton icon={<MoreHorizontal className="h-4 w-4" />} label="URLをコピー" onClick={() => void navigator.clipboard.writeText(window.location.href)} />{canDelete ? <MenuButton icon={<Trash2 className="h-4 w-4" />} label="削除" onClick={() => window.confirm("このナレッジを削除しますか？") && void onDelete()} /> : null}</div> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-3 text-sm font-semibold text-[#2B2B2B]">
        <Meta label="商材" value={item.productNames?.join(" / ")} productId={item.productIds[0]} />
        <Meta label="会社" value={item.companyName} />
        <Meta label="案件" value={item.projectName} />
        <Meta label="関連商談/会議" value={item.meetingTitle} />
        <Meta label="タグ" value={item.tags.join(" / ")} />
        <Meta label="公開範囲" value={visibilityLabels[item.visibility]} />
        <Meta label="作成元" value={sourceLabels[item.source]} />
      </div>
      <div className="mt-6 space-y-5">
        <Section title="概要" text={item.summary} />
        <Section title="本文" text={item.content} />
        {item.customerQuote ? <Quote title="お客様の発言" text={item.customerQuote} /> : null}
        <Bullets title="背景にある可能性" items={item.possibleBackground} />
        <Bullets title="気づき・学び" items={item.learnings} />
        <Bullets title="有効だった対応" items={item.effectiveResponses} />
        <Bullets title="避けるべき対応" items={item.avoidResponses} />
        <Bullets title="次のアクション" items={item.nextActions} />
        {item.type === "objection" ? <><Quote title="相手の発言" text={item.objectionData?.objection} /><Section title="回答例" text={item.objectionData?.responseExample} /><Bullets title="深掘り質問" items={item.objectionData?.followUpQuestions} /><Bullets title="避ける表現" items={item.objectionData?.avoidPhrases} /></> : null}
        {item.type === "success_case" ? <><Bullets title="導入前の課題" items={item.successCaseData?.beforeProblems} /><Bullets title="実施内容" items={item.successCaseData?.actions} /><Bullets title="結果" items={item.successCaseData?.results} /><Bullets title="成功要因" items={item.successCaseData?.successFactors} /></> : null}
        {item.type === "loss_reason" ? <><Section title="失注理由" text={item.lossData?.lossReason} /><Bullets title="失注につながった要因" items={item.lossData?.factors} /><Bullets title="改善点" items={item.lossData?.improvements} /></> : null}
      </div>
    </article>
  );
}

function KnowledgeFormModal({ mode, initial, products, companies, projects, meetings, onClose, onSubmit }: { mode: "create" | "edit"; initial?: KnowledgeDraft; products: Array<{ id: string; name: string }>; companies: Array<{ id: string; name: string }>; projects: Array<{ id: string; name: string; companyId?: string | null; companyName?: string | null }>; meetings: Array<{ id: string; name: string; companyId?: string | null; companyName?: string | null; projectId?: string | null; projectName?: string | null }>; onClose: () => void; onSubmit: (draft: KnowledgeDraft) => Promise<void>; }) {
  const [draft, setDraft] = useState(initial ?? emptyKnowledgeDraft());
  const [saving, setSaving] = useState(false);
  const selectedProjects = draft.companyId ? projects.filter((project) => project.companyId === draft.companyId) : projects;
  const selectedMeetings = draft.projectId ? meetings.filter((meeting) => meeting.projectId === draft.projectId) : meetings;
  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    await onSubmit(draft);
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1F1F22]/25 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-none border border-[#F0E7E9] bg-white p-5 shadow-2xl">
        <h2 className="text-2xl font-bold text-[#2B2B2B]">{mode === "create" ? "新しいナレッジを作成" : "ナレッジを編集"}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input label="タイトル 必須" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
          <Select label="種類" value={draft.type} options={Object.entries(knowledgeTypeLabels)} onChange={(type) => setDraft({ ...draft, type: type as KnowledgeType })} />
          <Select label="公開範囲" value={draft.visibility} options={Object.entries(visibilityLabels)} onChange={(visibility) => setDraft({ ...draft, visibility: visibility as KnowledgeVisibility })} />
          <Input label="タグ（カンマ区切り）" value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} />
          <MultiProductSelect products={products} draft={draft} onChange={setDraft} />
          <Select label="関連会社" value={draft.companyId} options={[["", "未選択"], ...companies.map((company) => [company.id, company.name] as [string, string])]} onChange={(companyId) => { const company = companies.find((item) => item.id === companyId); setDraft({ ...draft, companyId, companyName: company?.name ?? "", projectId: "", projectName: "", meetingId: "", meetingTitle: "" }); }} />
          <Select label="関連案件" value={draft.projectId} options={[["", "未選択"], ...selectedProjects.map((project) => [project.id, project.name] as [string, string])]} onChange={(projectId) => { const project = projects.find((item) => item.id === projectId); setDraft({ ...draft, projectId, projectName: project?.name ?? "", companyId: project?.companyId ?? draft.companyId, companyName: project?.companyName ?? draft.companyName, meetingId: "", meetingTitle: "" }); }} />
          <Select label="関連商談/会議" value={draft.meetingId} options={[["", "未選択"], ...selectedMeetings.map((meeting) => [meeting.id, meeting.name] as [string, string])]} onChange={(meetingId) => { const meeting = meetings.find((item) => item.id === meetingId); setDraft({ ...draft, meetingId, meetingTitle: meeting?.name ?? "", companyId: meeting?.companyId ?? draft.companyId, companyName: meeting?.companyName ?? draft.companyName, projectId: meeting?.projectId ?? draft.projectId, projectName: meeting?.projectName ?? draft.projectName }); }} />
          <Text label="概要" value={draft.summary} onChange={(summary) => setDraft({ ...draft, summary })} />
          <Text label="本文" value={draft.content} onChange={(content) => setDraft({ ...draft, content })} />
          <Text label="お客様の発言" value={draft.customerQuote} onChange={(customerQuote) => setDraft({ ...draft, customerQuote })} />
          <Text label="背景にある可能性" value={draft.possibleBackground} onChange={(possibleBackground) => setDraft({ ...draft, possibleBackground })} />
          <Text label="気づき・学び" value={draft.learnings} onChange={(learnings) => setDraft({ ...draft, learnings })} />
          <Text label="次のアクション" value={draft.nextActions} onChange={(nextActions) => setDraft({ ...draft, nextActions })} />
          {draft.type === "objection" ? <><Text label="相手の発言" value={draft.objection} onChange={(objection) => setDraft({ ...draft, objection })} /><Text label="回答例" value={draft.responseExample} onChange={(responseExample) => setDraft({ ...draft, responseExample })} /><Text label="深掘り質問" value={draft.followUpQuestions} onChange={(followUpQuestions) => setDraft({ ...draft, followUpQuestions })} /></> : null}
          {draft.type === "success_case" ? <><Text label="導入前の課題" value={draft.beforeProblems} onChange={(beforeProblems) => setDraft({ ...draft, beforeProblems })} /><Text label="実施内容" value={draft.successActions} onChange={(successActions) => setDraft({ ...draft, successActions })} /><Text label="結果" value={draft.results} onChange={(results) => setDraft({ ...draft, results })} /></> : null}
          {draft.type === "loss_reason" ? <><Text label="失注理由" value={draft.lossReason} onChange={(lossReason) => setDraft({ ...draft, lossReason })} /><Text label="改善点" value={draft.improvements} onChange={(improvements) => setDraft({ ...draft, improvements })} /></> : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="h-11 rounded-none border border-[#F0E7E9] px-5 text-sm font-bold text-[#6F676B]" onClick={onClose} type="button">キャンセル</button>
          <button className="h-11 rounded-none bg-[#EC6F8B] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !draft.title.trim()} onClick={() => void save()} type="button">保存</button>
        </div>
      </section>
    </div>
  );
}

function MultiProductSelect({ products, draft, onChange }: { products: Array<{ id: string; name: string }>; draft: KnowledgeDraft; onChange: (draft: KnowledgeDraft) => void }) {
  return (
    <MultiSelect
      emptyLabel="商材が未登録です。"
      label="関連商材"
      options={products.map((product) => ({ value: product.id, label: product.name }))}
      placeholder="商材を選択"
      values={draft.productIds}
      onChange={(productIds) => onChange({ ...draft, productIds, productNames: products.filter((product) => productIds.includes(product.id)).map((product) => product.name) })}
    />
  );
}

function Badge({ type }: { type: KnowledgeType }) {
  return <span className={`rounded-none px-3 py-1 text-xs font-bold ${typeTone(type)}`}>{knowledgeTypeLabels[type]}</span>;
}

function Meta({ label, value, productId }: { label: string; value?: string | null; productId?: string }) {
  if (!value) return null;
  return <p className="grid gap-2 sm:grid-cols-[120px_1fr]"><span className="text-[#777]">{label}</span>{productId ? <Link className="text-[#EC6F8B]" href={`/products?id=${productId}`}>{value}</Link> : <span>{value}</span>}</p>;
}

function Section({ title, text }: { title: string; text?: string | null }) {
  if (!text) return null;
  return <section><h3 className="mb-2 text-base font-bold text-[#2B2B2B]">{title}</h3><p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#4C474A]">{text}</p></section>;
}

function Quote({ title, text }: { title: string; text?: string | null }) {
  if (!text) return null;
  return <section><h3 className="mb-2 text-base font-bold text-[#2B2B2B]">{title}</h3><blockquote className="rounded-none bg-[#FFF0F3] px-5 py-4 text-sm font-semibold leading-7 text-[#4C474A]">「{text}」</blockquote></section>;
}

function Bullets({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return <section><h3 className="mb-2 text-base font-bold text-[#2B2B2B]">{title}</h3><ul className="space-y-2 text-sm font-semibold leading-6 text-[#4C474A]">{items.map((item) => <li key={item}>・{item}</li>)}</ul></section>;
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="flex h-9 items-center gap-2 rounded-none px-2 text-sm font-bold text-[#6F676B] hover:bg-[#FFF8F9]" onClick={onClick} type="button">{icon}{label}</button>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<input className="task-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold text-[#655D62]">{label}<textarea className="task-input min-h-72 resize-y" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <SingleSelect label={label} options={options.map(([nextValue, nextLabel]) => ({ value: nextValue, label: nextLabel }))} value={value} onChange={onChange} />;
}

function KnowledgeSkeleton() {
  return <SkeletonList count={5} media />;
}

function EmptyKnowledge({ hasQuery, onCreate }: { hasQuery: boolean; onCreate: () => void }) {
  return <EmptyState actionLabel={hasQuery ? undefined : "新しいナレッジを作成"} description={hasQuery ? "別のキーワードで検索してください。" : "商談や日々の営業活動から得た知識をナレッジとして残していきましょう。"} onAction={hasQuery ? undefined : onCreate} title={hasQuery ? "検索条件に一致するナレッジがありません" : "ナレッジがまだ登録されていません"} />;
}
