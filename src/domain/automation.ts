import type { AgentRoute, AutomationSafety, EmailTemplate, Project, WorkTask } from "./types";
import { createProductionTasks, needsIshidaApproval } from "./rules";

export const aiRoutes: AgentRoute[] = [
  {
    id: "minutes-to-requirements",
    trigger: "議事録登録",
    provider: "claude",
    agentName: "Requirements Agent",
    reason: "ヒアリング整理、要件定義、タスク分解に強い",
    output: "要件定義書、未確認事項、確認範囲"
  },
  {
    id: "requirements-to-docs",
    trigger: "要件定義完了",
    provider: "gemini",
    agentName: "Workspace Agent",
    reason: "Google Docs、Sheets、Drive、Gmailを担当",
    output: "Docs保存、進捗Sheet更新、Gmail下書き"
  },
  {
    id: "approved-development",
    trigger: "承認済み開発依頼",
    provider: "codex",
    agentName: "Dev Agent",
    reason: "実装、PR、レビュー、進捗連携を担当",
    output: "実装結果、Preview、PR"
  },
  {
    id: "review-and-analysis",
    trigger: "Preview完成",
    provider: "openai",
    agentName: "Review Agent",
    reason: "UIレビュー、分析、改善提案、画像生成指示を担当",
    output: "レビュー結果、改善提案、次アクション"
  }
];

export const emailTemplates: EmailTemplate[] = [
  {
    id: "hearing-schedule",
    name: "ヒアリング日程調整",
    mode: "draft-only",
    variables: ["client_name", "contact_name", "meeting_date", "sender_name"],
    subject: "【MOGCIA】ヒアリング日程のご相談"
  },
  {
    id: "preview-guide",
    name: "Preview案内",
    mode: "approval-required",
    variables: ["client_name", "contact_name", "project_name", "preview_url", "due_date", "sender_name"],
    subject: "【MOGCIA】Previewのご確認について"
  },
  {
    id: "invoice-send",
    name: "請求書送付",
    mode: "approval-required",
    variables: ["client_name", "contact_name", "invoice_url", "due_date", "sender_name"],
    subject: "【MOGCIA】請求書送付のご案内"
  },
  {
    id: "monthly-report",
    name: "月次レポート送付",
    mode: "approval-required",
    variables: ["client_name", "report_month", "sender_name"],
    subject: "【MOGCIA】{{report_month}} 月次レポート"
  }
];

export function safetyForEmail(templateName: string, project: Project): AutomationSafety {
  const sensitive = ["請求", "契約", "見積", "金額"];
  if (needsIshidaApproval(project)) return "approval-required";
  if (sensitive.some((word) => templateName.includes(word))) return "approval-required";
  return "draft-only";
}

export function generateTasks(project: Project): WorkTask[] {
  const tasks: WorkTask[] = [
    {
      id: `${project.id}-minutes`,
      projectId: project.id,
      title: "議事録を要件定義へ変換",
      kind: "automatic",
      due: "今日",
      safety: "auto-allowed",
      assignee: "Claude"
    },
    {
      id: `${project.id}-rules`,
      projectId: project.id,
      title: "Product / Project / Coding / AI Ruleを適用",
      kind: "automatic",
      due: "今日",
      safety: "auto-allowed",
      assignee: "MOGCIA Dev Agent"
    }
  ];

  if (needsIshidaApproval(project)) {
    tasks.push({
      id: `${project.id}-approval`,
      projectId: project.id,
      title: "石田承認: 要件定義と開発着手可否",
      kind: "approval",
      due: "承認待ち",
      safety: "approval-required",
      assignee: "石田"
    });
  }

  createProductionTasks(project.services).forEach((title, index) => {
    tasks.push({
      id: `${project.id}-prod-${index}`,
      projectId: project.id,
      title,
      kind: "production",
      due: "契約後",
      safety: "approval-required",
      assignee: "Dev Agent"
    });
  });

  if (project.status === "確認待ち") {
    tasks.push(
      {
        id: `${project.id}-demo-mail`,
        projectId: project.id,
        title: "Preview案内メール下書き作成",
        kind: "email",
        due: "今日",
        safety: safetyForEmail("Preview案内", project),
        assignee: "Gemini"
      },
      {
        id: `${project.id}-follow-up`,
        projectId: project.id,
        title: "Preview案内3日後のフォローアップ",
        kind: "automatic",
        due: "3日後",
        safety: "draft-only",
        assignee: "Sales Agent"
      }
    );
  }

  return tasks;
}
