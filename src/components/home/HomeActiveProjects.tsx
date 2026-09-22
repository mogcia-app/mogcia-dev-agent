"use client";

import { Building2, ChevronRight, Folder, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createProject } from "@/lib/projects";
import type { ProjectDraft } from "@/types/project";
import type { CompanyOption, ProductOption, ProjectOption } from "@/types/workspace-records";

export function HomeActiveProjects({ projects, companies, products, loading }: { projects: ProjectOption[]; companies: CompanyOption[]; products: ProductOption[]; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const activeProjects = useMemo(() => projects.filter((project) => project.status === "active"), [projects]);
  const rows = expanded ? activeProjects : activeProjects.slice(0, 6);

  return <section className="overflow-hidden rounded-2xl border border-[#E8E3E1] bg-white shadow-[0_10px_32px_rgba(31,31,34,0.04)]">
    <header className="flex flex-col gap-4 border-b border-[#EEE8EA] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FFF0F3] text-[#F05D82]"><Folder className="h-6 w-6" /></span><div><h2 className="text-xl font-semibold text-[#171923]">進行中の仕事（プロジェクト）</h2><p className="mt-1 text-sm text-[#7A8190]">複数のタスクをまとめる仕事の単位です。</p></div></div>
      <div className="flex items-center justify-end gap-4">{activeProjects.length > 6 ? <button className="inline-flex h-10 items-center gap-1 text-sm font-medium text-[#252A35]" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "閉じる" : "すべて見る"}<ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} /></button> : null}<button className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F45E87] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#EB527B]" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />プロジェクトを追加</button></div>
    </header>
    {loading ? <div className="grid gap-2 p-6">{Array.from({ length: 4 }).map((_, index) => <div className="h-14 animate-pulse rounded-lg bg-[#F7F5F5]" key={index} />)}</div> : rows.length ? <div><div className="grid grid-cols-[minmax(150px,.8fr)_minmax(220px,1.4fr)_minmax(160px,1fr)] gap-4 bg-[#FCFAFB] px-5 py-3 text-xs font-medium text-[#697184]"><span>会社 / 関連先</span><span>仕事のまとまり</span><span>現在の段階</span></div><div className="divide-y divide-[#EEE8EA]">{rows.map((project) => <ProjectRow key={project.id} project={project} />)}</div></div> : <div className="px-6 py-12 text-center"><Folder className="mx-auto h-9 w-9 text-[#D7C8CD]" /><p className="mt-3 text-sm text-[#7A8190]">現在進行中のプロジェクトはありません</p></div>}
    {createOpen ? <CreateProjectModal companies={companies} products={products} onClose={() => setCreateOpen(false)} /> : null}
  </section>;
}

function ProjectRow({ project }: { project: ProjectOption }) {
  return <div className="grid grid-cols-[minmax(150px,.8fr)_minmax(220px,1.4fr)_minmax(160px,1fr)] items-center gap-4 px-5 py-4">
    <span className="flex min-w-0 items-center gap-2 text-sm text-[#354052]"><Building2 className="h-4 w-4 shrink-0 text-[#697184]" /><span className="truncate">{project.companyName || project.productName || "社内"}</span></span>
    <div className="min-w-0"><p className="truncate text-[15px] font-semibold text-[#171923]">{project.name}</p></div>
    <span className="truncate text-sm text-[#354052]">{project.phase || "未設定"}</span>
  </div>;
}

function CreateProjectModal({ companies, products, onClose }: { companies: CompanyOption[]; products: ProductOption[]; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ProjectDraft>({ name: "", type: "client", status: "active", phase: "", companyId: "", companyName: "", productId: "", productName: "", description: "", startDate: "", targetDate: "" });
  const save = async () => { if (!draft.name.trim()) return; setSaving(true); setError(""); try { await createProject(draft); onClose(); } catch (next) { setError(next instanceof Error ? next.message : "保存できませんでした。"); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation"><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">プロジェクトを追加</h3><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#FFF0F3]" onClick={onClose} type="button"><X className="h-5 w-5" /></button></div>{error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}<div className="mt-4 grid gap-4"><Select label="会社 / 関連先" value={draft.companyId} options={[["", "会社なし"], ...companies.map((company) => [company.id, company.name])]} onChange={(companyId) => { const company = companies.find((entry) => entry.id === companyId); setDraft((current) => ({ ...current, companyId, companyName: company?.name ?? "", type: company ? "client" : current.productId ? "product" : "internal" })); }} /><Select label="商材（該当する場合）" value={draft.productId} options={[["", "未選択"], ...products.map((product) => [product.id, product.name])]} onChange={(productId) => { const product = products.find((entry) => entry.id === productId); setDraft((current) => ({ ...current, productId, productName: product?.name ?? "", name: current.name || product?.name || "", type: current.companyId ? "client" : product ? "product" : "internal" })); }} /><Input label="プロジェクト名" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} /><p className="rounded-lg bg-[#FFF7F9] px-3 py-2 text-xs leading-5 text-[#8A5966]">作成したプロジェクトは「進行中」として開始します。</p><Input label="現在の段階" hint="進行中のどの工程にいるかを入力します。例：提案準備、実施中、確認待ち" placeholder="例：提案準備" value={draft.phase} onChange={(phase) => setDraft({ ...draft, phase })} /><div className="grid gap-4 sm:grid-cols-2"><Input label="開始日" type="date" value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} /><Input label="目標日" type="date" value={draft.targetDate} onChange={(targetDate) => setDraft({ ...draft, targetDate })} /></div><label className="grid gap-2 text-sm font-medium text-[#655D62]">概要<textarea className="task-input min-h-24" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div><div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-sm" onClick={onClose} type="button">キャンセル</button><button className="h-10 rounded-lg bg-[#F45E87] px-5 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !draft.name.trim()} onClick={() => void save()} type="button">{saving ? "保存中..." : "作成"}</button></div></section></div>;
}

function Input({ label, value, type = "text", hint, placeholder, onChange }: { label: string; value: string; type?: string; hint?: string; placeholder?: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}<input className="task-input" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />{hint ? <span className="text-xs font-normal leading-5 text-[#9A9296]">{hint}</span> : null}</label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-medium text-[#655D62]">{label}<select className="task-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
