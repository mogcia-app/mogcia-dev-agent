import type { Client, DemoGuideDraft, Project, RequirementDraft, WorkTask } from "./types";

export function generateDemoGuideDraft({
  client,
  project,
  requirementDraft,
  task,
  createdBy
}: {
  client: Client;
  project: Project;
  requirementDraft?: RequirementDraft;
  task: WorkTask;
  createdBy: string;
}): DemoGuideDraft {
  const previewUrl = project.demoUrl ?? task.previewUrl ?? "（Preview URL未記録）";
  const mainPoints = (requirementDraft?.requirements ?? project.services).slice(0, 3);
  const demoScope = (requirementDraft?.demoScope ?? ["初回確認用のローカルDemo"]).slice(0, 3);

  return {
    id: `demo-guide-${project.id}`,
    projectId: project.id,
    clientId: client.id,
    taskId: task.id,
    subject: `【MOGCIA】${project.name} デモサイトのご確認について`,
    body: [
      `${client.contactName}`,
      "",
      "お世話になっております。MOGCIAです。",
      "",
      `先日お伺いした内容をもとに、${project.name} の確認用デモをご用意しました。`,
      "まずは方向性、導線、掲載内容の粒度をご確認いただくためのデモです。",
      "",
      "▼デモURL",
      previewUrl,
      "",
      "▼今回確認いただきたいポイント",
      ...mainPoints.map((item) => `・${item}`),
      "",
      "▼デモ範囲",
      ...demoScope.map((item) => `・${item}`),
      "",
      "本番公開用の環境、認証、DB、外部API連携、本番素材の反映は契約後に進める想定です。",
      "デモをご確認いただき、気になる点や追加したい内容があればお知らせください。",
      "",
      "どうぞよろしくお願いいたします。",
      "",
      "MOGCIA"
    ].join("\n"),
    generatedBy: "local-sales-agent",
    generatedAt: new Date().toISOString(),
    updatedBy: createdBy
  };
}
