import type { Client, Project, SnsOperationPlan, SnsPlatform, SnsPostTask } from "./types";

export function createSnsOperationPlan({
  client,
  project,
  month,
  contractPlan,
  platforms,
  monthlyPostCount,
  owner,
  meetingMemo
}: {
  client: Client;
  project: Project;
  month: string;
  contractPlan: string;
  platforms: SnsPlatform[];
  monthlyPostCount: number;
  owner: string;
  meetingMemo: string;
}): { plan: SnsOperationPlan; posts: SnsPostTask[] } {
  const now = new Date().toISOString();
  const planId = `sns-plan-${project.id}-${month.replace(/[^0-9a-zA-Z-]/g, "-")}-${Date.now()}`;
  const normalizedPlatforms: SnsPlatform[] = platforms.length > 0 ? platforms : ["Instagram"];

  const plan: SnsOperationPlan = {
    id: planId,
    projectId: project.id,
    clientId: client.id,
    month,
    contractPlan,
    platforms: normalizedPlatforms,
    monthlyPostCount,
    materialStatus: "未受領",
    reportStatus: "未作成",
    meetingMemo,
    owner,
    createdAt: now
  };

  const posts = Array.from({ length: monthlyPostCount }, (_, index) => {
    const platform = normalizedPlatforms[index % normalizedPlatforms.length];
    return {
      id: `sns-post-${planId}-${String(index + 1).padStart(2, "0")}`,
      planId,
      projectId: project.id,
      clientId: client.id,
      title: `${month} 投稿${index + 1}`,
      platform,
      status: "未着手",
      materialStatus: "未受領",
      dueDate: "",
      publishDate: "",
      owner,
      notes: "",
      revisionHistory: meetingMemo ? [`初期メモ: ${meetingMemo}`] : [],
      createdAt: now
    } satisfies SnsPostTask;
  });

  return { plan, posts };
}

export function summarizeSnsAlerts(posts: SnsPostTask[], today = new Date()): string[] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return posts.flatMap((post) => {
    const alerts: string[] = [];
    if (post.materialStatus !== "受領済み" && post.materialStatus !== "不要") {
      alerts.push(`${post.title}: 素材待ち`);
    }
    if (post.dueDate) {
      const due = new Date(post.dueDate).getTime();
      if (!Number.isNaN(due) && due < todayStart && post.status !== "投稿済み") {
        alerts.push(`${post.title}: 確認期限超過`);
      }
    }
    return alerts;
  });
}
