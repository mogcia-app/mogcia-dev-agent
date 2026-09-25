"use client";

import { AlertCircle, Bookmark, BriefcaseBusiness, CalendarClock, Check, Clock3, Link2, Plus, Save, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getHomeWorkspace, saveHomeWorkspace } from "@/lib/home-workspace";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceOptions } from "@/hooks/useWorkspaceOptions";
import type { HomeQuickTodo, HomeWorkspace } from "@/types/home";

const emptyWorkspace: HomeWorkspace = { currentWork: "", remember: "", todos: [], updatedAt: null };

export function HomePageClient() {
  const taskStore = useTasks();
  const options = useWorkspaceOptions();
  const [workspace, setWorkspace] = useState<HomeWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [todoText, setTodoText] = useState("");
  const [todoDate, setTodoDate] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void getHomeWorkspace().then(setWorkspace).catch((error) => setNotice(error instanceof Error ? error.message : "ワークメモを読み込めませんでした")).finally(() => setLoading(false));
  }, []);

  const persist = async (patch: Partial<HomeWorkspace>) => {
    setSaving(true);
    try {
      const next = await saveHomeWorkspace(patch);
      setWorkspace(next);
      setNotice("保存しました");
      window.setTimeout(() => setNotice(""), 1800);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存できませんでした");
    } finally { setSaving(false); }
  };
  const setTodos = (todos: HomeQuickTodo[]) => { setWorkspace((current) => ({ ...current, todos })); void persist({ todos }); };
  const addTodo = () => {
    const content = todoText.trim();
    if (!content) return;
    setTodoText(""); setTodoDate("");
    setTodos([...workspace.todos, { id: crypto.randomUUID(), content, dueDate: todoDate || null, completed: false }]);
  };

  const dueTasks = useMemo(() => taskStore.tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled" && task.dueDate).sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis()).slice(0, 8), [taskStore.tasks]);
  const stoppedProjects = useMemo(() => options.projects.filter((project) => project.status === "paused" || (project.status === "active" && project.updatedAt && now - project.updatedAt.toMillis() > 14 * 86_400_000)).slice(0, 6), [now, options.projects]);
  const recent = useMemo(() => {
    if (typeof window === "undefined") return [] as Array<{ href: string; label: string }>;
    try { return (JSON.parse(localStorage.getItem("mogcia-recent-pages") || "[]") as Array<{ href: string; label: string }>).slice(0, 6); } catch { return []; }
  }, []);

  return <section className="pb-10">
    <header className="flex flex-col gap-2 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-[#B85B77]">HOME</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">何をしていたか、ここで思い出す</h1><p className="mt-2 text-sm text-slate-500">個人のワークメモです。正式なタスクや活動履歴とは別に保存されます。</p></div><span className="text-xs text-slate-400">{saving ? "保存中…" : notice}</span></header>
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.8fr)]">
      <div className="space-y-5">
        <MemoPanel description="作業の途中と、再開するときの手がかり" icon={<BriefcaseBusiness className="h-4 w-4" />} title="今やってること" onSave={() => void persist({ currentWork: workspace.currentWork })} saving={saving}><textarea className="min-h-52 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-7 text-slate-800 outline-none focus:border-[#D98AA2] focus:bg-white" disabled={loading} onChange={(event) => setWorkspace({ ...workspace, currentWork: event.target.value })} placeholder={"有明乳業\n顧客詳細修正中。配送履歴まで完了。\n次は注文履歴。"} value={workspace.currentWork} /></MemoPanel>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Check className="h-4 w-4 text-[#B85B77]" />やること</h2><p className="mt-1 text-xs text-slate-500">自分用の簡易メモ。担当者・優先度・カテゴリは持ちません。</p></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#D98AA2]" onChange={(event) => setTodoText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="忘れたくない作業を追加" value={todoText} /><input aria-label="任意の期限" className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#D98AA2]" onChange={(event) => setTodoDate(event.target.value)} type="date" value={todoDate} /><button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#D47A95] px-4 text-sm font-medium text-white hover:bg-[#C96684]" onClick={addTodo} type="button"><Plus className="h-4 w-4" />追加</button></div><div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">{workspace.todos.length ? workspace.todos.map((todo) => <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-2 py-3" key={todo.id}><button aria-label={todo.completed ? "未完了に戻す" : "完了にする"} className={`grid h-5 w-5 place-items-center rounded border ${todo.completed ? "border-[#D47A95] bg-[#D47A95] text-white" : "border-slate-300"}`} onClick={() => setTodos(workspace.todos.map((item) => item.id === todo.id ? { ...item, completed: !item.completed } : item))} type="button">{todo.completed ? <Check className="h-3 w-3" /> : null}</button><span className={`min-w-0 truncate text-sm ${todo.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{todo.content}</span><span className="text-xs text-slate-400">{todo.dueDate ? formatShortDate(todo.dueDate) : ""}</span><button aria-label="削除" className="grid h-7 w-7 place-items-center text-slate-300 hover:text-red-500" onClick={() => setTodos(workspace.todos.filter((item) => item.id !== todo.id))} type="button"><X className="h-3.5 w-3.5" /></button></div>) : <EmptyText>簡易メモはまだありません</EmptyText>}</div></section>
        <MemoPanel description="返答待ちや確認事項など、頭の片隅に置いておくこと" icon={<Bookmark className="h-4 w-4" />} title="忘れない" onSave={() => void persist({ remember: workspace.remember })} saving={saving}><textarea className="min-h-36 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-7 text-slate-800 outline-none focus:border-[#D98AA2] focus:bg-white" disabled={loading} onChange={(event) => setWorkspace({ ...workspace, remember: event.target.value })} placeholder={"・ABC社返答待ち\n・Instagram API審査確認"} value={workspace.remember} /></MemoPanel>
      </div>
      <aside className="space-y-5">
        <SidePanel icon={<CalendarClock className="h-4 w-4" />} title="期限が近い"><div className="divide-y divide-slate-100">{dueTasks.length ? dueTasks.map((task) => <div className="py-3" key={task.id}><p className="text-sm font-medium text-slate-800">{task.title}</p><div className="mt-1 flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-400">{task.projectName || task.companyName || "正式タスク"}</span><span className={task.dueDate!.toMillis() < now ? "font-medium text-red-600" : "text-slate-500"}>{task.dueDate!.toDate().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span></div></div>) : <EmptyText>期限付きの未完了タスクはありません</EmptyText>}</div></SidePanel>
        <SidePanel icon={<Clock3 className="h-4 w-4" />} title="最近触った仕事"><div className="space-y-1">{recent.length ? recent.map((item) => <Link className="block rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50" href={item.href as Route} key={item.href}>{item.label}</Link>) : <EmptyText>最近開いたページはありません</EmptyText>}</div></SidePanel>
        <SidePanel icon={<AlertCircle className="h-4 w-4" />} title="止まっている仕事"><div className="space-y-2">{stoppedProjects.length ? stoppedProjects.map((project) => <div className="rounded-xl border border-slate-100 p-3" key={project.id}><p className="text-sm font-medium text-slate-800">{project.name}</p><p className="mt-1 text-xs text-slate-400">{project.status === "paused" ? "一時停止中" : "14日以上更新なし"}</p></div>) : <EmptyText>止まっている仕事はありません</EmptyText>}</div></SidePanel>
        <SidePanel icon={<Link2 className="h-4 w-4" />} title="よく使うリンク"><div className="grid grid-cols-2 gap-2">{[["カレンダー", "/calendar"], ["営業リスト", "/leads"], ["テンプレート", "/templates"], ["ナレッジ", "/knowledge"]].map(([label, href]) => <Link className="rounded-xl border border-slate-100 px-3 py-3 text-center text-xs font-medium text-slate-600 hover:border-[#F1C2D0] hover:text-[#8F3F59]" href={href as Route} key={href}>{label}</Link>)}</div></SidePanel>
      </aside>
    </div>
  </section>;
}

function MemoPanel({ title, description, icon, saving, onSave, children }: { title: string; description: string; icon: ReactNode; saving: boolean; onSave: () => void; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><span className="text-[#B85B77]">{icon}</span>{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div><button className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50" disabled={saving} onClick={onSave} type="button"><Save className="h-3.5 w-3.5" />保存</button></div><div className="mt-4">{children}</div></section>; }
function SidePanel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="text-[#B85B77]">{icon}</span>{title}</h2><div className="mt-3">{children}</div></section>; }
function EmptyText({ children }: { children: ReactNode }) { return <p className="py-5 text-center text-xs text-slate-400">{children}</p>; }
function formatShortDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }); }
