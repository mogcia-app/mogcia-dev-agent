import type { Client, MinutesRecord, Project, RequirementDraft } from "./types";
import { createProductionTasks } from "./rules";

const screenCandidates = [
  { keyword: "予約", screen: "予約導線" },
  { keyword: "LINE", screen: "公式LINE導線" },
  { keyword: "Instagram", screen: "SNS流入導線" },
  { keyword: "インスタ", screen: "SNS流入導線" },
  { keyword: "料金", screen: "料金・プラン" },
  { keyword: "問い合わせ", screen: "問い合わせ" },
  { keyword: "採用", screen: "採用情報" },
  { keyword: "キャンペーン", screen: "キャンペーン" },
  { keyword: "客室", screen: "客室・サービス紹介" },
  { keyword: "メニュー", screen: "メニュー" }
];

const featureCandidates = [
  { keyword: "予約", feature: "予約ボタンと主要CTAの固定表示" },
  { keyword: "LINE", feature: "LINE登録導線とリッチメニュー前提の案内" },
  { keyword: "Instagram", feature: "SNS流入からLPへの導線整理" },
  { keyword: "インスタ", feature: "SNS流入からLPへの導線整理" },
  { keyword: "フォーム", feature: "問い合わせフォームの項目設計" },
  { keyword: "写真", feature: "Placeholder画像と本番素材差し替え枠" },
  { keyword: "分析", feature: "Analytics / Search Console計測前提の改善導線" },
  { keyword: "レポート", feature: "月次レポートに必要な計測項目整理" }
];

export function generateRequirementDraft({
  client,
  project,
  minutes
}: {
  client: Client;
  project: Project;
  minutes: MinutesRecord;
}): RequirementDraft {
  const normalizedMinutes = minutes.content.replace(/\s+/g, " ").trim();
  const screens = pickMatches(normalizedMinutes, screenCandidates, "screen", ["トップ", "サービス紹介", "問い合わせ"]);
  const features = pickMatches(normalizedMinutes, featureCandidates, "feature", [
    "ファーストビューの訴求整理",
    "顧客課題に合わせたCTA設計",
    "確認用ダミーデータ表示"
  ]);

  const missingQuestions = [
    "正式なブランドカラーとロゴ素材はありますか？",
    "本番で使用できる写真・動画素材はありますか？",
    "公開希望日と初回確認期限はいつですか？",
    "問い合わせ・予約・LINE登録のうち最優先の成果地点はどれですか？"
  ];

  if (project.mode === "production") {
    missingQuestions.push("本番利用する外部API、ドメイン、決済、認証方式は確定していますか？");
  }

  return {
    id: `requirements-${crypto.randomUUID()}`,
    clientId: client.id,
    projectId: project.id,
    minutesId: minutes.id,
    summary: `${client.name} の ${project.name} は、${client.industry} 向けに ${project.services.join(" / ")} を軸として、議事録内容を要件化する案件です。`,
    requirements: [
      `${client.industry} の顧客課題に合わせて、${project.services.join(" / ")} の提案範囲を整理する`,
      "営業議事録から初期確認範囲と本番化で必要な範囲を分離する",
      "直案件・代理店案件では石田承認後に開発タスク確認へ進む",
      "外部リソース作成や本番反映は石田承認後に進める"
    ],
    missingQuestions,
    demoScope: [
      "トップ導線と主要CTA",
      "サービス内容が伝わる主要画面",
      "Placeholder画像とダミーデータ",
      "未実装機能と本番化タスクの明示"
    ],
    screens,
    features,
    productionTasks: createProductionTasks(project.services),
    aiRoutes: [
      "Claude: 議事録整理、要件定義、未確認事項抽出",
      "Gemini: Google Docs / Sheets保存、Gmail下書き",
      "Codex: 実装、レビュー、進捗連携",
      "ChatGPT / OpenAI: UIレビュー、改善提案、分析"
    ],
    generatedBy: "local-rule-engine",
    generatedAt: new Date().toISOString(),
    version: 1,
    sourceLabel: "AI生成",
    changeNote: "初回生成"
  };
}

function pickMatches<T extends { keyword: string } & Record<K, string>, K extends keyof T>(
  text: string,
  candidates: T[],
  key: K,
  fallback: string[]
): string[] {
  const matches = candidates.filter((item) => text.includes(item.keyword)).map((item) => item[key]);
  return Array.from(new Set(matches.length > 0 ? [...matches, ...fallback] : fallback));
}
