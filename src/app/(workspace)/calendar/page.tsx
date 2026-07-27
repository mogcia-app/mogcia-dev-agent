import { Suspense } from "react";
import { CalendarPageClient } from "@/components/calendar/CalendarPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function CalendarPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="カレンダーを読み込み中です" description="予定とタスクを確認しています..." />}>
      <CalendarPageClient />
    </Suspense>
  );
}
