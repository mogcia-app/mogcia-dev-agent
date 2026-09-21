import { redirect } from "next/navigation";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ taskId?: string }> }) {
  const { taskId } = await searchParams;
  redirect(taskId ? `/home?taskId=${encodeURIComponent(taskId)}` : "/home#tasks");
}
