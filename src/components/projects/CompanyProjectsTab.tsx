"use client";

import { CalendarDays, Edit2, FolderKanban, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { createProject, deleteProject, updateProject } from "@/lib/projects";
import type { Project, ProjectDraft, ProjectStatus, ProjectType } from "@/types/project";
import type { Task } from "@/types/task";

const empty = (companyId: string, companyName: string): ProjectDraft => ({ name: "", type: "client", status: "active", phase: "", currentPosition: "", nextAction: "", notes: "", companyId, companyName, productId: "", productName: "", description: "", startDate: "", targetDate: "" });
const statusLabels: Record<ProjectStatus, string> = { planning: "計画中", active: "進行中", paused: "一時停止", completed: "完了", archived: "アーカイブ" };
const typeLabels: Record<ProjectType, string> = { client: "クライアント", product: "自社商材", internal: "社内" };

export function CompanyProjectsTab({ companyId, companyName, tasks }: { companyId: string; companyName: string; tasks: Task[] }) {
  const { projects, loading, error } = useProjects();
  const options = useWorkspaceOptions();
  const [filter, setFilter] = useState<"active" | "other">("active");
  const companyProjects = useMemo(() => projects.filter((project) => project.companyId === companyId && project.status !== "archived"), [companyId, projects]);
  const rows = companyProjects.filter((project) => filter === "active" ? project.status === "active" : project.status !== "active");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const remove = async (project: Project) => {
    if (!window.confirm(`「${project.name}」を削除しますか？\n紐づくタスクは削除されず、プロジェクトとの紐付けだけ解除されます。`)) return;
    const result = await deleteProject(project.id);
    setMessage(`削除しました（タスク${result.unlinkedTasks}件の紐付けを解除）`);
  };

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-[#6B7280]">この会社に紐づくプロジェクト</p><button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#D47A95] px-3.5 text-sm font-medium text-white" onClick={() => setEditing("new")} type="button"><Plus className="h-4 w-4" />追加</button></div>
    <div className="flex gap-2"><button className={`h-8 rounded-lg px-3 text-xs font-medium ${filter === "active" ? "bg-[#FDF0F4] text-[#9B4862]" : "bg-[#F5F3F4] text-[#64748B]"}`} onClick={() => setFilter("active")} type="button">進行中 ({companyProjects.filter((project) => project.status === "active").length})</button><button className={`h-8 rounded-lg px-3 text-xs font-medium ${filter === "other" ? "bg-[#FDF0F4] text-[#9B4862]" : "bg-[#F5F3F4] text-[#64748B]"}`} onClick={() => setFilter("other")} type="button">その他・完了 ({companyProjects.filter((project) => project.status !== "active").length})</button></div>
    {message ? <p className="rounded-lg bg-[#FDF0F4] px-4 py-3 text-sm text-[#9B4862]">{message}</p> : null}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    {loading ? <p className="py-10 text-center text-sm text-[#64748B]">読み込み中...</p> : rows.length ? <div className="grid gap-3 md:grid-cols-2">{rows.map((project) => <article className="rounded-xl border border-[#E5E7EB] bg-white p-4" key={project.id}>
      <div className="flex items-start justify-between gap-3"><p className="min-w-0 font-semibold text-[#111827]">{project.name}</p><span className="shrink-0 rounded-full bg-[#FDF0F4] px-2.5 py-1 text-xs text-[#D47A95]">{statusLabels[project.status]}</span></div>
      <p className="mt-2 text-xs text-[#64748B]">{typeLabels[project.type]}{project.phase ? ` ・ ${project.phase}` : ""}</p>
      {project.productName ? <p className="mt-1 text-xs font-medium text-[#9B4862]">商材: {project.productName}</p> : null}
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#6B7280]">{project.description || "説明はありません。"}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[#94A3B8]">期間</dt><dd className="mt-1 text-[#655D62]">{dateLabel(project.startDate)} → {dateLabel(project.targetDate)}</dd></div><div><dt className="text-[#94A3B8]">未完了タスク</dt><dd className="mt-1 text-[#655D62]">{tasks.filter((task) => task.projectId === project.id && task.status !== "completed" && task.status !== "cancelled").length}件</dd></div></dl>
      <div className="mt-4 flex items-center justify-between"><span className="inline-flex items-center gap-1 text-xs text-[#64748B]"><CalendarDays className="h-3.5 w-3.5" />{project.targetDate ? project.targetDate.toDate().toLocaleDateString("ja-JP") : "目標日未設定"}</span><span className="flex gap-1"><button className="grid h-8 w-8 place-items-center rounded-md text-[#64748B] hover:bg-[#FDF0F4]" onClick={() => setEditing(project)} type="button" aria-label="編集"><Edit2 className="h-4 w-4" /></button><button className="grid h-8 w-8 place-items-center rounded-md text-[#9B4862] hover:bg-red-50" onClick={() => void remove(project)} type="button" aria-label="削除"><Trash2 className="h-4 w-4" /></button></span></div>
    </article>)}</div> : <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-[#E5DADD] text-center"><div><FolderKanban className="mx-auto h-9 w-9 text-[#D8C8CD]" /><p className="mt-3 text-sm font-medium text-[#6B7280]">{filter === "active" ? "進行中のプロジェクトはありません" : "その他・完了のプロジェクトはありません"}</p></div></div>}
    {editing ? <ProjectModal companyId={companyId} companyName={companyName} products={options.products} project={editing === "new" ? null : editing} saving={saving} onClose={() => setEditing(null)} onSave={async (draft) => { setSaving(true); try { if (editing === "new") await createProject(draft); else await updateProject(editing.id, draft, editing.updatedAt); setEditing(null); setMessage(editing === "new" ? "プロジェクトを追加しました" : "プロジェクトを更新しました"); } finally { setSaving(false); } }} /> : null}
  </div>;
}

function ProjectModal({ companyId, companyName, products, project, saving, onClose, onSave }: { companyId: string; companyName: string; products: Array<{ id: string; name: string }>; project: Project | null; saving: boolean; onClose: () => void; onSave: (draft: ProjectDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<ProjectDraft>(project ? { name: project.name, type: project.type, status: project.status, phase: project.phase, currentPosition: project.currentPosition, nextAction: project.nextAction, notes: project.notes, companyId, companyName, productId: project.productId ?? "", productName: project.productName ?? "", description: project.description, startDate: dateValue(project.startDate), targetDate: dateValue(project.targetDate) } : empty(companyId, companyName));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4"><section className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-semibold">{project ? "プロジェクトを編集" : "プロジェクトを追加"}</h3><div className="mt-4 grid gap-3">
    <Input label="プロジェクト名" required value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
    {project ? <Select label="プロジェクトの状態" hint="プロジェクト全体が動いているか、停止・完了しているかを表します。" value={draft.status} options={Object.entries(statusLabels)} onChange={(status) => setDraft({ ...draft, status: status as ProjectStatus })} /> : <p className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs leading-5 text-[#8A5966]">作成したプロジェクトは「進行中」として開始します。停止・完了するときは編集画面から状態を変更できます。</p>}
    <label className="grid gap-2 text-sm font-medium text-[#655D62]">関連商材<select className="task-input" value={draft.productId} onChange={(event) => { const product = products.find((entry) => entry.id === event.target.value); setDraft((current) => ({ ...current, productId: product?.id ?? "", productName: product?.name ?? "", ...(product && !current.name.trim() ? { name: product.name } : {}), ...(product && current.type === "internal" ? { type: "product" } : {}) })); }}><option value="">未選択</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{products.length === 0 ? <span className="text-xs font-normal text-[#94A3B8]">商材管理に登録すると、ここから選択できます。</span> : null}</label>
    <Input label="現在の段階" hint="進行中のどの工程にいるかを入力します。例：提案準備、実施中、確認待ち" placeholder="例：提案準備" value={draft.phase} onChange={(phase) => setDraft({ ...draft, phase })} />
    <div className="grid gap-3 sm:grid-cols-2"><Input label="開始日" type="date" value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} /><Input label="目標日" type="date" value={draft.targetDate} onChange={(targetDate) => setDraft({ ...draft, targetDate })} /></div>
    <label className="grid gap-2 text-sm font-medium text-[#655D62]">説明<textarea className="task-input min-h-28" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
  </div><div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded-lg border px-4 text-sm" onClick={onClose} type="button">キャンセル</button><button className="h-10 rounded-lg bg-[#D47A95] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !draft.name.trim()} onClick={() => void onSave(draft)} type="button">{saving ? "保存中..." : "保存"}</button></div></section></div>;
}

function Input({ label, value, type = "text", required, hint, placeholder, onChange }: { label: string; value: string; type?: string; required?: boolean; hint?: string; placeholder?: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}{required ? " *" : ""}<input className="task-input" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />{hint ? <span className="text-xs font-normal leading-5 text-[#94A3B8]">{hint}</span> : null}</label>; }
function Select({ label, value, options, hint, onChange }: { label: string; value: string; options: string[][]; hint?: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}<select className="task-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>{hint ? <span className="text-xs font-normal leading-5 text-[#94A3B8]">{hint}</span> : null}</label>; }
function dateValue(value: Project["targetDate"]) { if (!value) return ""; const date = value.toDate(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateLabel(value: Project["targetDate"]) { return value ? value.toDate().toLocaleDateString("ja-JP") : "未設定"; }
