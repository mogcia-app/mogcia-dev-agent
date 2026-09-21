import { HomePageClient } from "@/components/home/HomePageClient";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ taskId?: string; newTask?: string }> }) {
  const { taskId, newTask } = await searchParams;
  return <HomePageClient initialCreateOpen={newTask === "1"} initialTaskId={taskId} />;
}
