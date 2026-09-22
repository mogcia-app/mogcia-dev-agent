"use client";

import { Building2, ListChecks } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { HomeActiveProjects } from "@/components/home/HomeActiveProjects";
import { HomeAgent } from "@/components/home/HomeAgent";
import { HomeTasksPanel } from "@/components/home/HomeTasksPanel";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import { getUserDisplayName } from "@/lib/user-display";

export function HomePageClient({ initialTaskId, initialCreateOpen = false }: { initialTaskId?: string; initialCreateOpen?: boolean }) {
  const tasks = useTasks();
  const options = useWorkspaceOptions();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "お疲れさまです";

  return <section className="mx-auto max-w-[1440px] pb-8">
    <header className="flex flex-col gap-5 border border-[#E8E3E1] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(31,31,34,0.03)] sm:px-7 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4"><Image alt="MOGCIA" className="h-16 w-16 rounded-xl object-contain sm:h-20 sm:w-20" height={96} priority src="/m-dev-agent.png" width={96} /><div><h1 className="text-xl font-medium text-[#25242A] sm:text-2xl">{tasks.user ? `${getUserDisplayName(tasks.user)}さん、` : ""}{greeting}</h1><p className="mt-2 text-sm text-[#8A8186]">今日も良い一日になりますように。</p><p className="mt-1 text-sm text-[#777]">{formatDate(now)}</p></div></div>
      <div className="flex flex-wrap gap-2"><Link className="inline-flex h-11 items-center gap-2 border border-[#E5E7EB] bg-white px-4 text-sm text-[#374151]" href={"/home?newTask=1#tasks" as Route}><ListChecks className="h-4 w-4" />タスクを追加</Link><Link className="inline-flex h-11 items-center gap-2 border border-[#E5E7EB] bg-white px-4 text-sm text-[#374151]" href={"/leads" as Route}><Building2 className="h-4 w-4" />営業リスト</Link></div>
    </header>
    <div className="mt-5"><HomeActiveProjects companies={options.companies} loading={options.loading} products={options.products} projects={options.projects} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]"><HomeTasksPanel initialCreateOpen={initialCreateOpen} initialTaskId={initialTaskId} options={options} store={tasks} /><HomeAgent /></div>
  </section>;
}

function formatDate(date: Date): string { return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }); }
