"use client";

import Link from "next/link";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, FolderKanban, Package, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import type { ProjectStatus, ProjectType } from "@/types/project";

const statusLabels: Record<ProjectStatus, string> = { planning: "計画中", active: "進行中", paused: "一時停止", completed: "完了", archived: "アーカイブ" };
const typeLabels: Record<ProjectType, string> = { client: "クライアント", product: "自社商材", internal: "社内" };

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { projects, loading } = useProjects();
  const taskStore = useTasks();
  const options = useWorkspaceOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const project = projects.find((entry) => entry.id === projectId);
  const tasks = useMemo(() => taskStore.tasks.filter((task) => task.projectId === projectId), [projectId, taskStore.tasks]);
  if (loading) return <main className="p-6 text-sm text-[#8A8186]">読み込み中...</main>;
  if (!project) return <main className="p-6"><p>プロジェクトが見つかりません。</p><Link className="mt-4 inline-block text-[#EC6F8B]" href="/home">ホームへ戻る</Link></main>;
  return <main className="min-h-screen bg-[#FBF8F8] p-4 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-5">
      <Link className="inline-flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#EC6F8B]" href={project.companyId ? `/sales/companies?id=${project.companyId}&tab=projects` : "/home"}><ArrowLeft className="h-4 w-4" />戻る</Link>
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm text-[#EC6F8B]"><FolderKanban className="h-4 w-4" />プロジェクト</p><h1 className="mt-2 text-2xl font-semibold text-[#111827]">{project.name}</h1><p className="mt-2 text-sm text-[#6B7280]">{typeLabels[project.type]} ・ {statusLabels[project.status]}{project.phase ? ` ・ ${project.phase}` : ""}</p></div><button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={() => setCreateOpen(true)} type="button"><Plus className="h-4 w-4" />タスクを追加</button></div></section>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><section className="rounded-xl border border-[#E5E7EB] bg-white p-5"><h2 className="font-semibold">概要</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#6B7280]">{project.description || "説明はありません。"}</p></section><section className="rounded-xl border border-[#E5E7EB] bg-white p-5"><h2 className="font-semibold">基本情報</h2><dl className="mt-4 space-y-3 text-sm">{project.companyName ? <Row icon={Building2} label="会社" value={project.companyName} /> : null}{project.productName ? <Row icon={Package} label="関連商材" value={project.productName} /> : null}<Row icon={CalendarDays} label="開始日" value={project.startDate?.toDate().toLocaleDateString("ja-JP") || "未設定"} /><Row icon={CalendarDays} label="目標日" value={project.targetDate?.toDate().toLocaleDateString("ja-JP") || "未設定"} /></dl></section></div>
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">タスク</h2><span className="text-xs text-[#8A8186]">{tasks.length}件</span></div>{tasks.length ? <div className="mt-4 divide-y divide-[#F0E7E9]">{tasks.map((task) => <div className="flex items-center gap-3 py-3" key={task.id}><button className="grid h-8 w-8 place-items-center" onClick={() => void taskStore.completeTask(task, task.status !== "completed")} type="button"><CheckCircle2 className={`h-5 w-5 ${task.status === "completed" ? "text-[#67A46A]" : "text-[#CFC5C8]"}`} /></button><span className={`min-w-0 flex-1 text-sm ${task.status === "completed" ? "text-[#9A9296] line-through" : "text-[#374151]"}`}>{task.title}</span><span className="text-xs text-[#8A8186]">{task.dueDate?.toDate().toLocaleDateString("ja-JP") || "期限なし"}</span></div>)}</div> : <p className="mt-5 text-center text-sm text-[#8A8186]">タスクはありません。</p>}</section>
    </div>
    {createOpen ? <TaskFormModal companies={options.companies} currentMember={taskStore.currentMember} initialValues={{ projectId: project.id, projectName: project.name, companyId: project.companyId ?? "", companyName: project.companyName ?? "" }} members={taskStore.members} onClose={() => setCreateOpen(false)} onSubmit={(draft) => taskStore.createTask(draft)} products={options.products} projects={options.projects} /> : null}
  </main>;
}

function Row({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) { return <div className="flex gap-3"><Icon className="h-4 w-4 text-[#EC6F8B]" /><div><dt className="text-xs text-[#8A8186]">{label}</dt><dd className="mt-1 text-[#374151]">{value}</dd></div></div>; }
