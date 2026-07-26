"use client";

import type { ReactNode } from "react";
import type { DashboardPage } from "./dashboard-sidebar";
export { AiDashboardPage } from "./dashboard-pages/ai-dashboard-page";
export { HomeDashboardPage } from "./dashboard-pages/home-dashboard-page";
export { ProjectsDashboardPage } from "./dashboard-pages/projects-dashboard-page";
export { ReportsDashboardPage } from "./dashboard-pages/reports-dashboard-page";
export { SalesDashboardPage } from "./dashboard-pages/sales-dashboard-page";
export { SettingsDashboardPage } from "./dashboard-pages/settings-dashboard-page";
export { TasksDashboardPage } from "./dashboard-pages/tasks-dashboard-page";

export function DashboardPageChrome({
  authPanel,
  hero,
  stats
}: {
  authPanel?: ReactNode;
  hero: ReactNode;
  stats: ReactNode;
}) {
  return (
    <div className="space-y-8">
      {authPanel}
      {hero || stats ? (
        <section>
          {hero}
          {stats}
        </section>
      ) : null}
    </div>
  );
}

export function DashboardStatsGrid({ children }: { children: ReactNode }) {
  return <div className="mb-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">{children}</div>;
}

export function DashboardWorkspace({ children }: { children: ReactNode }) {
  return <section className="grid gap-8">{children}</section>;
}

export function DashboardColumn({ children }: { children: ReactNode }) {
  return <div className="space-y-8">{children}</div>;
}

export function DashboardPages({
  activePage,
  home,
  projects,
  tasks,
  sales,
  ai,
  rules,
  reports,
  sns,
  settings
}: {
  activePage: DashboardPage;
  home: ReactNode;
  projects: ReactNode;
  tasks: ReactNode;
  sales: ReactNode;
  ai: ReactNode;
  rules: ReactNode;
  reports: ReactNode;
  sns: ReactNode;
  settings: ReactNode;
}) {
  if (activePage === "home") return <>{home}</>;
  if (activePage === "projects") return <>{projects}</>;
  if (activePage === "tasks") return <>{tasks}</>;
  if (activePage === "crm") return <>{sales}</>;
  if (activePage === "routing") return <>{ai}</>;
  if (activePage === "rules") return <>{rules}</>;
  if (activePage === "reports") return <>{reports}</>;
  if (activePage === "sns") return <>{sns}</>;
  return <>{settings}</>;
}
