import { HomePageClient } from "@/components/home/HomePageClient";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ taskId?: string }> }) {
  const { taskId } = await searchParams;
  return <HomePageClient initialTaskId={taskId} />;
}
