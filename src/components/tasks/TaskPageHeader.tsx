"use client";

import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { formatTaskDate } from "@/lib/task-utils";

export function TaskPageHeader({ onCreate }: { onCreate: () => void }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <PageHeader
      title="タスク"
      description="今日も頑張りましょう！"
      actions={
        <>
        <div className="hidden flex-wrap items-center gap-4 rounded-none border border-[#F0DEE2] bg-white px-5 py-3 text-sm font-semibold text-[#676064] shadow-sm md:flex">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#EC6F8B]" />
            {formatTaskDate(now)}
          </span>
        </div>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-none bg-[#EC6F8B] px-5 text-sm font-medium text-white shadow-[0_12px_24px_rgba(236,111,139,0.24)] transition hover:bg-[#E35D7D]" onClick={onCreate} type="button">
          <Plus className="h-4 w-4" />
          新しいタスク
        </button>
        </>
      }
    />
  );
}
