"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { businessApi } from "@/lib/business-api-client";

type Result = { id: string; type: "lead" | "company" | "product" | "knowledge" | "template"; title: string; subtitle: string; href: string };
const labels: Record<Result["type"], string> = { lead: "営業", company: "会社", product: "商材", knowledge: "ナレッジ", template: "テンプレート" };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !query.trim()) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setLoading(true); void businessApi<{ results: Result[] }>(`/api/business/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((data) => setResults(data.results)).catch(() => undefined).finally(() => setLoading(false)); }, 220);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [open, query]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); } if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  const grouped = Object.entries(results.reduce<Partial<Record<Result["type"], Result[]>>>((groups, item) => { (groups[item.type] ??= []).push(item); return groups; }, {})) as Array<[Result["type"], Result[]]>;
  return <><button className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 hover:border-[#F1C2D0] hover:bg-[#FDF0F4]" onClick={() => setOpen(true)} type="button"><Search className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">横断検索</span><kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] md:inline">⌘K</kbd></button>{open ? <div className="fixed inset-0 z-[70] flex justify-center bg-slate-950/45 px-4 pt-[10vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="h-fit max-h-[75vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center gap-3 border-b border-slate-200 px-4"><Search className="h-5 w-5 text-slate-400" /><input autoFocus className="h-14 min-w-0 flex-1 text-base outline-none" onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setResults([]); }} placeholder="プロジェクト・営業先・会社・商材・ナレッジ・テンプレートを検索" value={query} /><button aria-label="閉じる" onClick={() => setOpen(false)} type="button"><X className="h-5 w-5 text-slate-400" /></button></div><div className="max-h-[calc(75vh-56px)] overflow-y-auto p-3">{loading ? <p className="p-6 text-center text-sm text-slate-400">検索中…</p> : grouped.length ? grouped.map(([type, items]) => <section className="mb-3" key={type}><h2 className="px-3 py-2 text-xs font-semibold text-slate-400">{labels[type]}</h2>{items.map((item) => <Link className="block rounded-xl px-3 py-2.5 hover:bg-slate-50" href={item.href as Route} key={`${item.type}-${item.id}`} onClick={() => setOpen(false)}><p className="text-sm font-medium text-slate-800">{item.title}</p>{item.subtitle ? <p className="mt-0.5 truncate text-xs text-slate-400">{item.subtitle}</p> : null}</Link>)}</section>) : <p className="p-8 text-center text-sm text-slate-400">{query ? "一致する情報はありません" : "思い出したい名前やキーワードを入力してください"}</p>}</div></section></div> : null}</>;
}
