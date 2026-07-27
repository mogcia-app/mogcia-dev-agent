import { Suspense } from "react";
import { TasksPageClient } from "@/components/tasks/TasksPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="タスクを読み込み中です" description="今日のタスクを確認しています..." />}>
      <TasksPageClient />
    </Suspense>
  );
}
