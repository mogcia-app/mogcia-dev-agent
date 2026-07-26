import type { AgentConfig } from "./types";

export const defaultAgentConfigs: AgentConfig[] = [
  {
    id: "requirements-agent",
    name: "Requirements Agent",
    provider: "claude",
    role: "議事録から要件定義、未確認事項、Demo範囲、本番化タスクを整理する。",
    prompt: "MOGCIAのRuleを最優先し、営業議事録を要件定義ドラフトへ変換する。Demoと本番化の範囲を必ず分離する。",
    enabled: true
  },
  {
    id: "dev-agent",
    name: "Dev Agent",
    provider: "codex",
    role: "ローカルDemo生成、実装、レビュー、CLIを担当する。",
    prompt: "Demoモードでは外部リソースを作らず、ローカルで動くNext.js Demoだけを生成する。",
    enabled: true
  },
  {
    id: "workspace-agent",
    name: "Workspace Agent",
    provider: "gemini",
    role: "Google Workspace系の下書き、Docs/Sheets整理を担当する。",
    prompt: "送信や本番反映はせず、承認前の下書きと確認用テキストだけを作成する。",
    enabled: true
  },
  {
    id: "review-agent",
    name: "Review Agent",
    provider: "openai",
    role: "分析、UIレビュー、改善提案、Placeholder画像指示を担当する。",
    prompt: "MOGCIAトンマナ、営業目的、顧客導線を基準に改善提案を行う。",
    enabled: true
  }
];
