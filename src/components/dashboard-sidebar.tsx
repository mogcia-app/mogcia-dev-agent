"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  Bot,
  Briefcase,
  ChartColumn,
  ChevronDown,
  FolderKanban,
  House,
  ListTodo,
  LogOut,
  Megaphone,
  CalendarDays,
  Settings,
  Users,
  type LucideIcon
} from "lucide-react";
import { useAuth } from "./auth-provider";

export type DashboardPage = "home" | "projects" | "crm" | "rules" | "routing" | "tasks" | "gmail" | "reports" | "sns" | "team" | "products" | "settings";

export interface DashboardNavItem {
  id: DashboardPage;
  label: string;
  href: string;
  icon?: LucideIcon;
}

export interface DashboardNavSection {
  title?: string;
  icon?: LucideIcon;
  items: DashboardNavItem[];
}

export const dashboardSections: DashboardNavSection[] = [
  {
    items: [
      { id: "home", label: "Home", href: "/home", icon: House },
      { id: "tasks", label: "タスク", href: "/tasks", icon: ListTodo },
      { id: "crm", label: "カレンダー", href: "/calendar", icon: CalendarDays }
    ]
  },
  {
    title: "営業",
    icon: Briefcase,
    items: [
      { id: "crm", label: "営業管理", href: "/sales" },
      { id: "crm", label: "会社一覧", href: "/companies" },
      { id: "crm", label: "アップロード", href: "/meetings" },
      { id: "crm", label: "タイムライン", href: "/sales/timeline" }
    ]
  },
  {
    title: "案件",
    icon: FolderKanban,
    items: [
      { id: "projects", label: "案件一覧", href: "/projects" },
      { id: "projects", label: "要件定義", href: "/requirements" },
      { id: "tasks", label: "Codex進捗", href: "/codex" }
    ]
  },
  {
    title: "AI",
    icon: Bot,
    items: [
      { id: "routing", label: "Agent", href: "/ai/agents" },
      { id: "routing", label: "実行履歴", href: "/ai/runs" },
      { id: "rules", label: "Prompt・Rules", href: "/ai/prompts" },
      { id: "rules", label: "司令ルール", href: "/ai/orchestration" }
    ]
  },
  {
    title: "SNS",
    icon: Megaphone,
    items: [
      { id: "sns", label: "運用管理", href: "/sns/operations" },
      { id: "sns", label: "投稿管理", href: "/sns/posts" },
      { id: "sns", label: "レポート", href: "/sns/reports" }
    ]
  },
  {
    title: "分析",
    icon: ChartColumn,
    items: [
      { id: "reports", label: "Website", href: "/analytics/website" },
      { id: "reports", label: "改善提案", href: "/analytics/recommendations" }
    ]
  },
  {
    title: "チーム",
    icon: Users,
    items: [
      { id: "team", label: "ユーザー", href: "/team/users" },
      { id: "team", label: "社内・代理店", href: "/team/organizations" },
      { id: "team", label: "権限", href: "/team/permissions" }
    ]
  },
  {
    title: "設定",
    icon: Settings,
    items: [
      { id: "settings", label: "全般設定", href: "/settings/general" },
      { id: "products", label: "商材", href: "/products" },
      { id: "settings", label: "Firebase", href: "/settings/firebase" },
      { id: "gmail", label: "Gmail", href: "/settings/gmail" }
    ]
  }
];

export function DashboardSidebar({
  currentPath
}: {
  currentPath: string;
}) {
  const auth = useAuth();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setCollapsedSections((current) => ({ ...current, [key]: !current[key] }));
  const userName = auth.user?.displayName ?? auth.user?.email?.split("@")[0] ?? "Guest";

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[20px] border border-transparent bg-transparent p-1">
      <div className="flex shrink-0 items-center px-2">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">MOGCIA</h1>
          <p className="text-sm font-medium text-neutral-700">Dev Agent</p>
        </div>
      </div>
      <nav className="mt-7 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 text-sm" aria-label="MOGCIA Dev Agent navigation">
        {dashboardSections.map((section, sectionIndex) => {
          const SectionIcon = section.icon;
          const isHomeSection = !section.title;
          const sectionKey = section.title ?? "home";
          const isCollapsed = Boolean(collapsedSections[sectionKey]) && !isHomeSection;

          return (
          <div key={sectionKey} className={sectionIndex > 0 ? "border-t border-line/70 pt-4" : ""}>
            {section.title ? (
              <button
                className="mb-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[11px] font-semibold text-neutral-400 transition hover:bg-white/60 hover:text-neutral-600"
                onClick={() => toggleSection(sectionKey)}
                type="button"
              >
                {SectionIcon ? <SectionIcon className="h-3.5 w-3.5" strokeWidth={1.8} /> : null}
                <span>{section.title}</span>
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition ${isCollapsed ? "-rotate-90" : ""}`} strokeWidth={1.8} />
              </button>
            ) : null}
            <div className={`space-y-1 ${isCollapsed ? "hidden" : ""}`}>
              {section.items.map((page) => {
                const isActive = currentPath === page.href || currentPath.startsWith(`${page.href}/`) || (currentPath === "/" && page.href === "/home");
                const ItemIcon = page.icon;

                return (
                <Link
                  key={`${section.title ?? "root"}-${page.id}-${page.label}`}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    isActive ? "bg-mogcia-light text-mogcia-blush shadow-[0_10px_24px_rgba(213,181,178,0.18)]" : "text-neutral-700 hover:bg-white/75"
                  }`}
                  href={page.href as Route<string>}
                >
                  {ItemIcon ? <ItemIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} /> : isHomeSection && SectionIcon ? <SectionIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} /> : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-mogcia-blush" : "bg-mogcia-primary/55"}`} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{page.label}</span>
                  </span>
                </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </nav>
      <div className="mt-4 shrink-0 rounded-[18px] border border-line/70 bg-white/72 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-mogcia-icon text-xs font-bold text-neutral-800">{userName.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900">{userName}</p>
            <p className="truncate text-xs text-neutral-500">{auth.isIshida ? "石田管理者" : auth.role}</p>
          </div>
          {auth.user ? (
            <button className="rounded-full p-2 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700" onClick={auth.signOutUser} title="ログアウト" type="button">
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Web App</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Firestore</span>
        </div>
      </div>
    </aside>
  );
}

export function MogciaRobotMark() {
  return (
    <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-mogcia-light bg-mogcia-icon shadow-soft">
      <span className="absolute -top-1.5 left-3 h-3 w-1.5 rounded-full bg-mogcia-primary-dark" />
      <span className="absolute -top-1.5 right-3 h-3 w-1.5 rounded-full bg-mogcia-primary" />
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-800 text-sm font-bold text-mogcia-eye">M</span>
    </div>
  );
}
