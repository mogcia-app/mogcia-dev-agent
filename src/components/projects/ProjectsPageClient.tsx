"use client";

import { ArrowRight, Building2, CalendarDays, FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { CreateProjectModal } from "@/components/home/HomeActiveProjects";
import { PageHeader } from "@/components/page-header";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";

const statusLabel: Record<string, string> = { planning: "計画中", active: "進行中", paused: "一時停止", completed: "完了", archived: "アーカイブ" };

export function ProjectsPageClient() {
  const options = useWorkspaceOptions();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const projects = useMemo(() => options.projects.filter((project) => `${project.name} ${project.companyName ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [options.projects, query]);
  return <section className="pb-10"><PageHeader title="プロジェクト" description="制作・開発・社内施策を一覧で管理します" actions={<button className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D47A95] px-4 text-sm font-medium text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />追加</button>} />
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><input aria-label="プロジェクトを検索" className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#D98AA2]" onChange={(event) => setQuery(event.target.value)} placeholder="プロジェクト名・会社で検索" value={query} /></div>
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_120px_110px_110px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-500 lg:grid"><span>プロジェクト名</span><span>関連会社</span><span>状態</span><span>期限</span><span>最終更新</span></div>{options.loading ? <p className="p-8 text-center text-sm text-slate-400">読み込み中…</p> : projects.length ? <div className="divide-y divide-slate-100">{projects.map((project) => <Link className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_120px_110px_110px] lg:items-center lg:gap-4" href={`/projects/${project.id}` as Route} key={project.id}><span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900"><FolderKanban className="h-4 w-4 shrink-0 text-[#B85B77]" /><span className="truncate">{project.name}</span></span><span className="flex min-w-0 items-center gap-1 text-sm text-slate-600"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{project.companyName || "社内"}</span></span><span className="w-fit rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600">{statusLabel[project.status ?? ""] ?? project.status}</span><span className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{project.targetDate ? project.targetDate.toDate().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "未設定"}</span><span className="flex items-center justify-between text-xs text-slate-400">{project.updatedAt ? project.updatedAt.toDate().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "—"}<ArrowRight className="h-4 w-4" /></span></Link>)}</div> : <p className="p-10 text-center text-sm text-slate-400">該当するプロジェクトはありません</p>}</div>
    {createOpen ? <CreateProjectModal companies={options.companies} products={options.products} onClose={() => setCreateOpen(false)} /> : null}
  </section>;
}
