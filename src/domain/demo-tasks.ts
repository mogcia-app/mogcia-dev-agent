import type { Project, RequirementDraft, WorkTask } from "./types";

const demoSteps = [
  {
    title: "テンプレート選定",
    description: "案件の業種、サービス、必要画面に合うローカルDemoテンプレートを選ぶ。"
  },
  {
    title: "ダミーデータ生成",
    description: "顧客名、サービス、必要画面に合わせたサンプルテキストと一覧データを作る。"
  },
  {
    title: "Placeholder画像生成",
    description: "本番素材がない前提で、MOGCIAトンマナに合う仮画像または画像枠を用意する。"
  },
  {
    title: "画面構成作成",
    description: "要件定義ドラフトの必要画面とDemo範囲を、画面セクションへ分解する。"
  },
  {
    title: "ローカルNext.js Demo生成",
    description: "外部API、DB、認証を使わず、ローカルだけで動くDemoを実装する。"
  },
  {
    title: "npm install",
    description: "Demoテンプレートの依存関係をインストールする。"
  },
  {
    title: "npm run dev",
    description: "ローカルDemoサーバーを起動し、localhostのURLを確認する。"
  },
  {
    title: "Preview URL記録",
    description: "確認用URL、未実装機能、Placeholder注意書きを案件へ紐づける。"
  },
  {
    title: "デモ案内準備",
    description: "デモ送付メールまたは商談スクリプトの下書き作成へ進める。"
  }
];

export function createDemoWorkTasks({
  project,
  draft,
  createdBy
}: {
  project: Project;
  draft: RequirementDraft;
  createdBy: string;
}): WorkTask[] {
  const safety = project.approvalStatus === "approved" || project.approvalStatus === "not-required" ? "auto-allowed" : "approval-required";
  const now = new Date().toISOString();

  return demoSteps.map((step, index) => ({
    id: `task-demo-${project.id}-${String(index + 1).padStart(2, "0")}`,
    projectId: project.id,
    title: step.title,
    kind: "demo",
    due: index < 5 ? "要件承認後" : "Demo実装時",
    safety,
    assignee: index <= 6 ? "Codex" : "Sales Agent",
    description: `${step.description} 参照要件: ${draft.screens.slice(0, 3).join(" / ") || project.name}`,
    order: index + 1,
    group: "local-demo-generation",
    status: "todo",
    createdBy,
    createdAt: now
  }));
}
