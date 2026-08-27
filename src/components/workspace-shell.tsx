"use client";
import { Bot, Building2, CalendarDays, ChartNoAxesCombined, Home, ListChecks, LogOut, Package, ScanSearch, Settings, UploadCloud, UserRoundSearch, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { LoadingCard, PageProgress } from "@/components/ui/loading";

type NavItem = { href: string; label: string; icon: LucideIcon };
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: "今日", items: [{ href: "/home", label: "ホーム", icon: Home }] },
  { label: "仕事", items: [{ href: "/agent", label: "Agent", icon: Bot }, { href: "/calendar", label: "カレンダー", icon: CalendarDays }, { href: "/tasks", label: "タスク", icon: ListChecks }, { href: "/leads", label: "見込み客", icon: UserRoundSearch }] },
  { label: "営業データ", items: [{ href: "/sales/companies", label: "会社", icon: Building2 }, { href: "/sales/upload", label: "商談を追加", icon: UploadCloud }, { href: "/sales/analysis", label: "商談分析", icon: ChartNoAxesCombined }, { href: "/products", label: "商材", icon: Package }, { href: "/products/analysis", label: "商材分析", icon: ScanSearch }] }
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [user, setUser] = useState<User | null>(null); const [checking, setChecking] = useState(true); const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { const auth = getFirebaseAuth(); if (!auth) { router.replace("/"); return; } return onAuthStateChanged(auth, (next) => { setUser(next); setChecking(false); if (!next) router.replace("/"); }); }, [router]);
  useEffect(() => { const item = groups.flatMap((group) => group.items).find((entry) => entry.href === pathname); if (!item || pathname === "/home") return; try { const current = JSON.parse(localStorage.getItem("mogcia-recent-pages") || "[]") as Array<{ href: string; label: string; visitedAt: number }>; localStorage.setItem("mogcia-recent-pages", JSON.stringify([{ href: item.href, label: item.label, visitedAt: Date.now() }, ...current.filter((entry) => entry.href !== item.href)].slice(0, 8))); } catch { localStorage.setItem("mogcia-recent-pages", JSON.stringify([{ href: item.href, label: item.label, visitedAt: Date.now() }])); } }, [pathname]);
  const logout = async () => { const auth = getFirebaseAuth(); if (!auth) return; setSigningOut(true); await signOut(auth); router.replace("/"); };
  if (checking) return <main className="grid min-h-screen place-items-center bg-[#F8F4F3] px-6"><LoadingCard variant="auth" title="認証しています" description="アカウントを確認しています..." /></main>;
  if (!user) return null;
  const mobileItems = groups.flatMap((group) => group.items).slice(0, 5);
  return <div className="min-h-screen bg-[#F8F4F3] text-[#1F1F22] lg:grid lg:grid-cols-[236px_1fr]">
    {signingOut ? <PageProgress /> : null}
    <aside className="flex border-b border-[#E9DAD8] bg-white/95 px-4 py-3 shadow-sm lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
      <div className="flex shrink-0 items-center gap-3"><Image alt="" className="rounded-xl" height={42} src="/m-dev-agent.png" width={42} /><div><p className="font-semibold">MOGCIA</p><p className="text-xs text-neutral-500">仕事とAgent</p></div></div>
      <nav className="ml-4 flex gap-1 overflow-x-auto lg:hidden" aria-label="メインナビゲーション">{mobileItems.map((item) => <Link className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${item.href === pathname ? "bg-[#FFF0F3] font-semibold text-[#B84563]" : "text-neutral-600"}`} href={item.href as Route} key={item.href}>{item.label}</Link>)}</nav>
      <nav className="mt-8 hidden flex-1 space-y-7 lg:block" aria-label="メインナビゲーション">{groups.map((group) => <section key={group.label}><p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-neutral-400">{group.label}</p><div className="space-y-1">{group.items.map((item) => { const Icon = item.icon; const active = item.href === pathname; return <Link className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition ${active ? "bg-[#FFF0F3] font-semibold text-[#B84563]" : "text-neutral-600 hover:bg-[#F8F4F3]"}`} href={item.href as Route} key={item.href}><Icon className="h-4 w-4" />{item.label}</Link>; })}</div></section>)}</nav>
      <div className="mt-auto hidden space-y-1 pt-6 lg:block"><Link className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-neutral-600 hover:bg-[#F8F4F3]" href={"/settings/desktop" as Route}><Settings className="h-4 w-4" />設定・Desktop</Link><button className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-neutral-500 hover:bg-[#F8F4F3]" onClick={() => void logout()} type="button"><LogOut className="h-4 w-4" />ログアウト</button></div>
    </aside>
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto w-full max-w-[1440px]">{children}</div></main>
  </div>;
}
