"use client";

import { useState, type ReactNode } from "react";
import { Bell, ChevronDown, Command, LogOut, Plus, Search } from "lucide-react";
import { useAuth } from "./auth-provider";
import { DashboardSidebar, type DashboardPage } from "./dashboard-sidebar";

type TopBarCreateAction = "company" | "project" | "quick-capture" | "meeting" | "sns-plan";

const createActions: { id: TopBarCreateAction; label: string; note: string }[] = [
  { id: "company", label: "会社", note: "顧客・見込み客を追加" },
  { id: "project", label: "案件・議事録", note: "案件登録から要件定義へ" },
  { id: "quick-capture", label: "営業メモ", note: "会社タイムラインへ保存" },
  { id: "meeting", label: "アップロード", note: "テレアポ・打ち合わせ音声を登録" },
  { id: "sns-plan", label: "SNS運用案件", note: "月次投稿タスクを作成" }
];

export function AppShell({
  children,
  currentPath,
  isSeeding,
  onSeed,
  onOpenCreate,
  source,
  status,
  todoCount
}: {
  activePage: DashboardPage;
  children: ReactNode;
  currentPath: string;
  isSeeding: boolean;
  onSeed: () => Promise<void>;
  onOpenCreate: (action: TopBarCreateAction) => void;
  source: "sample" | "firestore";
  status: string;
  todoCount: number;
}) {
  const auth = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const userName = auth.user?.displayName ?? auth.user?.email?.split("@")[0] ?? "Guest";

  return (
    <main className="grid h-screen overflow-hidden bg-[#fbf8f7] text-neutral-800 lg:grid-cols-[292px_minmax(0,1fr)]">
      <div className="hidden h-screen border-r border-line/70 bg-[#fff8fa] p-4 lg:block">
        <DashboardSidebar currentPath={currentPath} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-end gap-4 border-b border-line/70 bg-white/92 px-4 shadow-[0_8px_30px_rgba(31,31,34,0.035)] backdrop-blur md:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden h-10 w-[260px] items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-neutral-400 xl:flex">
              <Search className="h-4 w-4" strokeWidth={1.8} />
              <span className="flex-1">検索...</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 text-xs"><Command className="h-3 w-3" />K</span>
            </div>
            <div className="relative hidden md:block">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-mogcia-light px-4 text-sm font-semibold text-mogcia-blush transition hover:bg-mogcia-primary/35"
                onClick={() => setIsCreateOpen((current) => !current)}
                type="button"
              >
                <Plus className="h-4 w-4" />
                新規作成
                <ChevronDown className="h-4 w-4" />
              </button>
              {isCreateOpen ? (
                <div className="absolute right-0 top-12 z-40 w-64 rounded-[18px] border border-line bg-white p-2 shadow-[0_18px_50px_rgba(31,31,34,0.14)]">
                  {createActions.map((action) => (
                    <button
                      key={action.id}
                      className="w-full rounded-2xl px-3 py-3 text-left transition hover:bg-mogcia-icon"
                      onClick={() => {
                        onOpenCreate(action.id);
                        setIsCreateOpen(false);
                      }}
                      type="button"
                    >
                      <span className="block text-sm font-semibold text-neutral-900">{action.label}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{action.note}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="relative hidden h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-line md:grid">
              <Bell className="h-4 w-4 text-neutral-600" strokeWidth={1.8} />
              <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">{Math.min(todoCount, 9)}</span>
            </div>
            {auth.user ? (
              <div className="hidden items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2 lg:flex">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-mogcia-icon text-xs font-bold text-neutral-800">{userName.slice(0, 1).toUpperCase()}</div>
                <div className="max-w-[170px]">
                  <p className="truncate text-xs font-semibold text-neutral-900">{userName}</p>
                  <p className="truncate text-[11px] text-neutral-500">{auth.isIshida ? "石田管理者" : auth.role}</p>
                </div>
                <button className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700" onClick={auth.signOutUser} title="ログアウト" type="button">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {auth.user ? null : (
              <span className="rounded-full bg-neutral-100 px-3 py-2 text-xs text-neutral-600">{auth.loading ? "確認中" : "Login required"}</span>
            )}
          </div>
        </header>

        <div className="border-b border-line/70 bg-white/80 px-4 py-3 lg:hidden">
          <DashboardSidebar currentPath={currentPath} />
        </div>

        <section className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
