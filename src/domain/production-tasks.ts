import { createProductionTasks } from "./rules";
import type { Project, RequirementDraft, WorkTask } from "./types";

const productionTaskDetails: Record<string, { assignee: string; description: string }> = {
  "GitHub Repository": {
    assignee: "Dev Agent",
    description: "本番管理用Repositoryを作成し、開発環境との差分と本番ブランチ運用を定義する。"
  },
  "Firebase Project": {
    assignee: "Dev Agent",
    description: "契約後に本番用Firebase Projectを作成し、開発環境と分離する。"
  },
  Firestore: {
    assignee: "Backend Agent",
    description: "本番データモデル、Indexes、Rules、初期データ投入方針を設計する。"
  },
  Storage: {
    assignee: "Backend Agent",
    description: "本番画像、書類、アップロード素材の保存先と権限を設定する。"
  },
  Auth: {
    assignee: "Backend Agent",
    description: "メール、Google、必要に応じたApple/LINE Loginなどの認証方式を確定する。"
  },
  Vercel: {
    assignee: "Dev Agent",
    description: "本番Project、Preview、Production Deploy、Build設定を準備する。"
  },
  "環境変数": {
    assignee: "Dev Agent",
    description: "Firebase、API Key、Webhook、OAuth Secretを本番環境へ安全に登録する。"
  },
  "独自ドメイン": {
    assignee: "Dev Agent",
    description: "本番ドメイン、DNS、SSL、リダイレクト、メールドメイン影響を確認する。"
  },
  "LINE Login": {
    assignee: "Workspace Agent",
    description: "LINE Developersで本番Channel、Callback URL、権限を設定する。"
  },
  "Messaging API": {
    assignee: "Workspace Agent",
    description: "Messaging APIの本番Channel、Webhook、配信承認フローを準備する。"
  },
  LIFF: {
    assignee: "Workspace Agent",
    description: "LIFF ID、Endpoint URL、ログイン導線、スマホ表示を本番用に設定する。"
  },
  Analytics: {
    assignee: "Analysis Agent",
    description: "Google Analyticsの本番プロパティ、計測イベント、CVを設定する。"
  },
  "Search Console": {
    assignee: "Analysis Agent",
    description: "Search Consoleのプロパティ、サイトマップ、所有権確認を準備する。"
  },
  "Google Business Profile": {
    assignee: "Marketing Agent",
    description: "Google Business Profileへの導線、計測、表示内容との整合を確認する。"
  },
  "Instagram分析": {
    assignee: "Analysis Agent",
    description: "Instagram運用データの取得方法、月次レポート、改善提案導線を設計する。"
  },
  "SNS投稿承認フロー": {
    assignee: "Marketing Agent",
    description: "投稿作成、承認、予約、差し戻し、レポートまでの運用フローを定義する。"
  },
  "サービス固有API設定": {
    assignee: "Dev Agent",
    description: "対象サービスごとのAPI、Webhook、認証方式、本番制限を確認する。"
  }
};

export function createProductionWorkTasks({
  project,
  draft,
  createdBy
}: {
  project: Project;
  draft?: RequirementDraft;
  createdBy: string;
}): WorkTask[] {
  const taskTitles = Array.from(new Set([...(draft?.productionTasks ?? []), ...createProductionTasks(project.services)]));
  const now = new Date().toISOString();

  return taskTitles.map((title, index) => {
    const detail = productionTaskDetails[title] ?? productionTaskDetails["サービス固有API設定"];

    return {
      id: `task-production-${project.id}-${String(index + 1).padStart(2, "0")}`,
      projectId: project.id,
      title,
      kind: "production",
      due: "契約後",
      safety: "approval-required",
      assignee: detail.assignee,
      description: `${detail.description} 本番契約後、石田承認を得て実行する。`,
      order: index + 1,
      group: "production-readiness",
      status: "todo",
      createdBy,
      createdAt: now
    };
  });
}
