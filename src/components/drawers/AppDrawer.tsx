"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function AppDrawer({
  children,
  eyebrow = "Manual operation",
  onClose,
  subtitle,
  title
}: {
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-neutral-950/25 backdrop-blur-sm">
      <button aria-label="閉じる" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <section className="relative z-10 flex h-full w-full max-w-5xl flex-col border-l border-line bg-mogcia-bg shadow-[0_28px_90px_rgba(31,31,34,0.18)]">
        <header className="shrink-0 border-b border-line bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mogcia-blush">{eyebrow}</p>
              <h2 className="mt-1 truncate text-xl font-semibold text-neutral-950">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
            </div>
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white text-neutral-500 hover:bg-neutral-50" onClick={onClose} type="button">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">{children}</div>
      </section>
    </div>
  );
}
