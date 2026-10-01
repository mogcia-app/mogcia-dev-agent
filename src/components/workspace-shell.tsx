"use client";

import { BookOpenText, Building2, CalendarDays, ChevronRight, FileText, LayoutTemplate, LogOut, Package, Settings, UserRoundSearch, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { LoadingCard, PageProgress } from "@/components/ui/loading";
import { getFirebaseAuth } from "@/lib/firebase/client";

type NavItem = { href: string; label: string; icon: LucideIcon };
const groups: Array<{ label: string | null; items: NavItem[] }> = [
  { label: "仕事", items: [{ href: "/calendar", label: "カレンダー", icon: CalendarDays }, { href: "/templates", label: "テンプレート", icon: LayoutTemplate }] },
  { label: "営業", items: [{ href: "/leads", label: "営業リスト", icon: UserRoundSearch }, { href: "/sales/companies", label: "会社", icon: Building2 }, { href: "/products", label: "商材", icon: Package }] },
  { label: null, items: [{ href: "/memos", label: "メモ", icon: FileText }, { href: "/knowledge", label: "ナレッジ", icon: BookOpenText }] }
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [user, setUser] = useState<User | null>(null); const [checking, setChecking] = useState(true); const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { const auth = getFirebaseAuth(); if (!auth) { router.replace("/"); return; } return onAuthStateChanged(auth, (next) => { setUser(next); setChecking(false); if (!next) router.replace("/"); }); }, [router]);
  useEffect(() => { const item = groups.flatMap((group) => group.items).find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`)); if (!item) return; try { const current = JSON.parse(localStorage.getItem("mogcia-recent-pages") || "[]") as Array<{ href: string; label: string; visitedAt: number }>; localStorage.setItem("mogcia-recent-pages", JSON.stringify([{ href: pathname, label: item.label, visitedAt: Date.now() }, ...current.filter((entry) => entry.href !== pathname)].slice(0, 8))); } catch { localStorage.setItem("mogcia-recent-pages", JSON.stringify([{ href: pathname, label: item.label, visitedAt: Date.now() }])); } }, [pathname]);
  const logout = async () => { const auth = getFirebaseAuth(); if (!auth) return; setSigningOut(true); await signOut(auth); router.replace("/"); };
  if (checking) return <main className="grid min-h-screen place-items-center bg-slate-50 px-6"><LoadingCard variant="auth" title="認証しています" description="アカウントを確認しています…" /></main>;
  if (!user) return null;
  return <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 text-slate-900">
    {signingOut ? <PageProgress /> : null}
    <aside className="border-b border-slate-200 bg-white text-slate-900 md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:h-dvh md:w-[248px] md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-5"><Link className="flex items-center gap-3" href={"/calendar" as Route}><Image alt="MOGCIA" className="h-9 w-9 rounded-xl" height={40} src="/m-dev-agent.png" width={40} /><div><p className="text-sm font-semibold tracking-wide">MOGCIA</p><p className="text-[10px] text-slate-500">WORKSPACE</p></div></Link><div className="w-44 md:mt-5 md:w-full"><GlobalSearch /></div></div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:min-h-0 md:flex-1 md:overflow-y-auto md:px-3 md:pb-4" aria-label="メインナビゲーション">{groups.map((group, groupIndex) => <section className="shrink-0 md:mt-5" key={group.label ?? groupIndex}>{group.label ? <p className="mb-2 hidden px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400 md:block">{group.label}</p> : null}<div className="flex gap-1 md:block md:space-y-1">{group.items.map((item) => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link className={`group flex h-10 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm transition ${active ? "bg-[#FBE8EE] font-medium text-[#8F3F59]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`} href={item.href as Route} key={item.href}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span><ChevronRight className={`ml-auto hidden h-3.5 w-3.5 md:block ${active ? "opacity-60" : "opacity-0 group-hover:opacity-40"}`} /></Link>; })}</div></section>)}</nav>
      <div className="hidden shrink-0 border-t border-slate-200 p-3 md:block"><Link className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm ${pathname === "/settings/desktop" ? "bg-[#FBE8EE] text-[#8F3F59]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`} href={"/settings/desktop" as Route}><Settings className="h-4 w-4" />設定・Desktop</Link><button className="mt-1 flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-700" onClick={() => void logout()} type="button"><LogOut className="h-4 w-4" />ログアウト</button></div>
    </aside>
    <main className="min-w-0 px-4 py-5 sm:px-6 md:ml-[248px] md:px-8 md:py-7"><div className="mx-auto w-full max-w-[1440px]">{children}</div></main>
  </div>;
}
