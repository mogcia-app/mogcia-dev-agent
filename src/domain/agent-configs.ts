import type { AgentConfig } from "./types";

export const defaultAgentConfigs: AgentConfig[] = [
  {
    id: "requirements-agent",
    name: "Requirements Agent",
    provider: "claude",
    role: "議事録から要件定義、未確認事項、確認範囲、本番化タスクを整理する。",
    prompt: "MOGCIAのRuleを最優先し、営業議事録を要件定義ドラフトへ変換する。初期確認範囲と本番化の範囲を必ず分離する。",
    enabled: true
  },
  {
    id: "dev-agent",
    name: "Dev Agent",
    provider: "codex",
    role: "実装、レビュー、CLI、Codex進捗連携を担当する。",
    prompt: "外部リソース作成や本番反映は石田承認後に進め、開発進捗をJSONで報告する。",
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
