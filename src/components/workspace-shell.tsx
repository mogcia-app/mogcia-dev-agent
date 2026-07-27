"use client";

import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Home,
  LogOut,
  Package,
  UploadCloud,
  Building2,
  ListChecks,
  Settings,
  type LucideIcon
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { LoadingCard, PageProgress } from "@/components/ui/loading";

type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type SidebarGroup = {
  id: "home" | "sales";
  label: string;
  icon: LucideIcon;
  items: SidebarItem[];
};

const sidebarGroups: SidebarGroup[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    items: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/calendar", label: "カレンダー", icon: CalendarDays },
      { href: "/tasks", label: "タスク", icon: ListChecks },
      { href: "/products", label: "商材管理", icon: Package },
      // { href: "/knowledge", label: "ナレッジ", icon: Library },
      { href: "/settings/desktop", label: "デスクトップ連携", icon: Settings }
    ]
  },
  {
    id: "sales",
    label: "営業",
    icon: BriefcaseBusiness,
    items: [
      { href: "/sales/companies", label: "会社一覧", icon: Building2 },
      { href: "/sales/upload", label: "アップロード", icon: UploadCloud }
    ]
  }
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSigningOut, setSigningOut] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<SidebarGroup["id"], boolean>>({
    home: true,
    sales: true
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      router.replace("/");
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsCheckingAuth(false);
      if (!nextUser) router.replace("/");
    });
  }, [router]);

  const logout = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setSigningOut(true);
    await signOut(auth);
    router.replace("/");
  };

  if (isCheckingAuth) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F8F4F3] px-6">
        <LoadingCard variant="auth" title="認証しています" description="アカウントを確認しています..." />
      </main>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F8F4F3] text-[#1F1F22] lg:grid lg:grid-cols-[260px_1fr]">
      {isSigningOut ? <PageProgress /> : null}
      <aside className="flex border-b border-[#E9DAD8] bg-white/90 px-4 py-4 shadow-[0_10px_32px_rgba(31,31,34,0.05)] backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:border-b-0 lg:border-r lg:px-5">
        <div className="flex w-full items-center gap-3">
          <Image alt="" className="rounded-md" height={40} src="/m-dev-agent.png" width={40} />
          <p className="text-sm font-semibold tracking-[0.08em] text-[#1F1F22]">
            MOGCIA <span className="text-[#B97B80]">Dev Agent</span>
          </p>
        </div>

        <nav className="mt-6 hidden flex-1 space-y-4 lg:block" aria-label="メインナビゲーション">
          {sidebarGroups.map((group) => {
            const isExpanded = expandedGroups[group.id];
            const isGroupActive = group.items.some((item) => item.href === pathname);
            const GroupIcon = group.icon;

            return (
              <section key={group.id}>
                <button
                  className={`flex h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm font-semibold transition ${
                    isGroupActive ? "bg-[#F8F4F3] text-[#1F1F22]" : "text-neutral-500 hover:bg-[#F8F4F3] hover:text-[#1F1F22]"
                  }`}
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                  type="button"
                >
                  <span className="flex items-center gap-3">
                    <GroupIcon className="h-4 w-4 text-[#B97B80]" />
                    {group.label}
                  </span>
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {isExpanded ? (
                  <div className="mt-2 space-y-1 pl-3">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = item.href === pathname;
                      return (
                        <Link
                          className={`flex h-10 items-center gap-3 rounded-md border-l-2 px-3 text-sm transition ${
                            isActive
                              ? "border-[#B97B80] bg-[#F7F3F2] font-semibold text-[#1F1F22]"
                              : "border-transparent text-neutral-500 hover:bg-[#F8F4F3] hover:text-[#1F1F22]"
                          }`}
                          href={item.href as Route}
                          key={item.href}
                        >
                          <ItemIcon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>

        <div className="mt-auto hidden pt-8 lg:block">
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#E9DAD8] bg-white text-sm font-semibold text-[#B97B80] transition hover:bg-[#F7F3F2]"
            onClick={() => void logout()}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-5 lg:px-6">
        <div className="w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
