import type { AutomationSafety, Project } from "./types";
import { needsIshidaApproval } from "./rules";

const approvalRequiredWords = ["初回", "金額", "請求", "契約", "本番", "送付", "代理店", "見積"];

export function resolveCommunicationSafety({ project, text }: { project?: Project; text: string }): AutomationSafety {
  if (project && needsIshidaApproval(project)) return "approval-required";
  if (approvalRequiredWords.some((word) => text.includes(word))) return "approval-required";
  return "draft-only";
}

export function canAutoExecute(safety: AutomationSafety): boolean {
  return safety === "auto-allowed";
}
