import type { AgentMode, ApprovalStatus, Project, RuleLayer, ServiceKind, UserRole, WorkflowStage } from "./types";

export const ISHIDA_EMAIL = "marina.ishida@mogcia.com";

export const workflowStages: WorkflowStage[] = [
  "議事録未登録",
  "要件生成待ち",
  "要件確認中",
  "修正依頼",
  "承認済み",
  "新規問い合わせ",
  "ヒアリング予定",
  "ヒアリング完了",
  "要件整理中",
  "承認待ち",
  "デモ作成中",
  "デモ完成",
  "Demo確認待ち",
  "デモ案内待ち",
  "デモ確認中",
  "クライアント確認中",
  "本番化判断待ち",
  "見積提出",
  "商談中",
  "契約待ち",
  "契約済み",
  "制作中",
  "確認待ち",
  "納品済み",
  "完了",
  "運用中",
  "保留",
  "失注",
  "解約"
];

export const rolePermissions = {
  admin: ["all", "cli", "rule-edit", "ai-config", "approve"],
  internal: ["project-create", "minutes-create", "demo-create", "progress-view", "review"],
  sales: ["project-create", "minutes-create", "demo-request", "progress-view"],
  agency: ["project-create", "minutes-create", "progress-view"]
} as const;

export function getUserRole(email?: string | null): UserRole {
  if (!email) return "sales";
  return email.toLowerCase() === ISHIDA_EMAIL ? "admin" : "internal";
}

export function isIshidaAccount(email?: string | null): boolean {
  return getUserRole(email) === "admin";
}

export const baseRules: RuleLayer[] = [
  {
    id: "mogcia-common",
    scope: "mogcia",
    name: "MOGCIA共通ルール",
    priority: 10,
    rules: [
      "利用者にAIプロバイダーを意識させない",
      "初回顧客メール、金額、請求、契約、本番公開は承認必須",
      "Demoモードでは外部リソースを作成しない"
    ]
  },
  {
    id: "coding-next-firebase",
    scope: "coding",
    name: "Coding Rule",
    priority: 30,
    rules: [
      "Next.js App Router と TypeScript を標準にする",
      "Firebase連携はサーバー境界に閉じる",
      "PR前にlint、typecheck、buildを通す"
    ]
  },
  {
    id: "ai-routing",
    scope: "ai",
    name: "AI Rule",
    priority: 40,
    rules: [
      "Claudeは要件定義、設計、営業資料、タスク分解を担当",
      "Codexは実装、PR、テスト、コードレビューを担当",
      "GeminiはGoogle Workspace、Analytics、Search Consoleを担当",
      "OpenAIは分析、UIレビュー、改善提案、画像生成指示を担当"
    ],
    prompts: {
      claude: "議事録をMOGCIAの案件ルールに沿って要件定義へ変換する。",
      codex: "承認済み要件とCoding Ruleを読んで実装し、検証結果を返す。",
      gemini: "Google Workspace上のDocs、Sheets、Gmail、Calendar操作を行う。",
      openai: "分析、レビュー、改善提案を行い、必要なら画像生成指示を作る。"
    }
  }
];

export function getModeRestrictions(mode: AgentMode): string[] {
  if (mode === "production") {
    return [
      "契約後のみGitHub、Firebase、Vercel、外部API、独自ドメインを作成可能",
      "本番公開は管理者承認後に実行する"
    ];
  }

  return [
    "GitHub作成禁止",
    "Firebase作成禁止",
    "Vercel作成禁止",
    "DB作成禁止",
    "API接続禁止",
    "認証実装禁止",
    "ローカルテンプレート複製、ダミーデータ、Placeholder画像、npm install、npm run devまで"
  ];
}

export function needsIshidaApproval(project: Project): boolean {
  return project.source === "agency" || project.source === "direct-client";
}

export function getApprovalStatus(project: Project): ApprovalStatus {
  if (!needsIshidaApproval(project)) return "not-required";
  return project.approvalStatus ?? (project.status === "承認待ち" ? "pending" : "pending");
}

export function createProductionTasks(services: ServiceKind[]): string[] {
  const base = [
    "GitHub Repository",
    "Firebase Project",
    "Firestore",
    "Storage",
    "Auth",
    "Vercel",
    "環境変数",
    "独自ドメイン"
  ];

  const serviceTasks = services.flatMap((service) => {
    if (service === "公式LINE運用") return ["LINE Login", "Messaging API", "LIFF"];
    if (service === "SNS運用") return ["Instagram分析", "SNS投稿承認フロー"];
    if (service === "HP制作" || service === "LP制作") {
      return ["Analytics", "Search Console", "Google Business Profile"];
    }
    return ["サービス固有API設定"];
  });

  return Array.from(new Set([...base, ...serviceTasks]));
}

export function mergeRules(layers: RuleLayer[]): string[] {
  return layers
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .flatMap((layer) => layer.rules.map((rule) => `${layer.name}: ${rule}`));
}
