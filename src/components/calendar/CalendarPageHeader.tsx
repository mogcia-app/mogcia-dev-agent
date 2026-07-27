"use client";

import { Bell, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export function CalendarPageHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <PageHeader
      title="カレンダー"
      description="スケジュールを確認して、1日を効率的に進めましょう！"
      actions={
        <>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#F47E96] shadow-[0_8px_20px_rgba(120,72,76,0.10)] ring-1 ring-[#F0E7E9]" onClick={onCreate} type="button">
          <Plus className="h-4 w-4" />
          予定を追加
        </button>
        <button className="relative grid h-11 w-11 place-items-center rounded-full bg-white text-[#777] shadow-sm ring-1 ring-[#F0E7E9]" type="button" aria-label="通知">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#F47E96]" />
        </button>
        </>
      }
    />
  );
}
