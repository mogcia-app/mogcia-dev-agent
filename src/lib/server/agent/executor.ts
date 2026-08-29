import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { generateAgentAnswer, type AgentAnswerToolResult } from "@/lib/server/agent/answer-generator";
import { routeAgentIntent } from "@/lib/server/agent/intent-router";
import { createAgentNotification, createAgentRequestForUser, getAgentRunForExecution, getProjectMemory, listDevelopmentProjects, markStep, patchAgentRunForExecution, updateAgentRequestForUser } from "@/lib/server/agent/repository";
import { createDevelopmentJob } from "@/lib/server/development/repository";
import * as tools from "@/lib/server/agent/tools";
import type { AgentIntent, AgentPendingAction, AgentPendingSelection, AgentResultCard, AgentRunStep, AgentSource, AgentToolLog } from "@/types/agent";

type AgentUser = { uid: string; name?: string };
type ExecuteInput = { user: AgentUser; rawMessage: string; projectId?: string | null; source?: AgentSource };
type ExecutionContext = { user: AgentUser; runId: string; requestId: string; rawMessage: string; projectId?: string | null; steps: AgentRunStep[]; toolLogs: AgentToolLog[]; logs: string[]; toolResults: AgentAnswerToolResult[] };
type AgentExecutionResult = {
  status: "completed" | "requires_approval";
  answer: string;
  cards: AgentResultCard[];
  pendingAction: AgentPendingAction | null;
  pendingSelection?: AgentPendingSelection | null;
  targetType?: string | null;
  targetId?: string | null;
  leadId?: string | null;
  companyId?: string | null;
  taskId?: string | null;
  productId?: string | null;
  projectId?: string | null;
  analysisId?: string | null;
};

export async function executeAgentRequest(input: ExecuteInput) {
  const created = await createAgentRequestForUser({
    userId: input.user.uid,
    rawMessage: input.rawMessage,
    source: input.source ?? "web",
    projectId: input.projectId ?? null
  });
  const run = await getAgentRunForExecution(input.user.uid, created.runId);
  const context: ExecutionContext = {
    user: input.user,
    runId: created.runId,
    requestId: created.requestId,
    rawMessage: input.rawMessage,
    projectId: input.projectId ?? null,
    steps: run?.steps as AgentRunStep[] | undefined ?? [],
    toolLogs: [],
    logs: Array.isArray(run?.logs) ? run.logs.filter((entry): entry is string => typeof entry === "string") : [],
    toolResults: []
  };

  try {
    await updateProgress(context, "plan", "running", 12, "依頼内容を理解しています。", { status: "running", startedAt: FieldValue.serverTimestamp() });
    const routed = await routeAgentIntent(input.rawMessage);
    context.logs.push(`Intent: ${routed.intent}（confidence ${Math.round(routed.confidence * 100)}%）`);
    await updateAgentRequestForUser(input.user.uid, created.requestId, { status: "running", intent: routed.intent });
    await updateProgress(context, "plan", "success", 24, "依頼内容を構造化しました。", { intent: routed.intent, entities: routed.entities });
    await updateProgress(context, "execute", "running", 45, "必要なデータを取得しています。");

    const result: AgentExecutionResult = await handleIntent(context, routed.intent, routed.entities);
    await updateAgentRequestForUser(input.user.uid, created.requestId, { status: result.status, intent: routed.intent, targetType: result.targetType ?? null, targetId: result.targetId ?? null });
    await patchAgentRunForExecution(input.user.uid, created.runId, {
      status: result.status,
      intent: routed.intent,
      leadId: result.leadId ?? null,
      companyId: result.companyId ?? null,
      taskId: result.taskId ?? null,
      productId: result.productId ?? null,
      projectId: result.projectId ?? null,
      analysisId: result.analysisId ?? null,
      requiresApproval: Boolean(result.pendingAction),
      answer: result.answer,
      cards: result.cards,
      pendingAction: result.pendingAction ?? null,
      pendingSelection: result.pendingSelection ?? null,
      toolLogs: context.toolLogs,
      logs: context.logs,
      progress: result.status === "requires_approval" ? 72 : 100,
      currentStep: result.status === "requires_approval" ? "execute" : "complete",
      completedAt: result.status === "completed" ? FieldValue.serverTimestamp() : null,
      steps: result.status === "completed"
        ? markStep(markStep(context.steps, "execute", "success", "回答を作成しました。"), "complete", "success", "完了しました。")
        : markStep(context.steps, "execute", "success", "実行前の確認を作成しました。")
    });
    if (result.status === "requires_approval") {
      await createAgentNotification({
        userId: input.user.uid,
        title: "Agentの確認待ちがあります",
        message: result.pendingAction?.title ?? "実行内容を確認してください。",
        type: "approval",
        runId: created.runId,
        targetUrl: `/agent?runId=${created.runId}`
      });
    }
    return created;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent実行に失敗しました。";
    await updateAgentRequestForUser(input.user.uid, created.requestId, { status: "error" });
    await patchAgentRunForExecution(input.user.uid, created.runId, {
      status: "error",
      requiresApproval: false,
      errorMessage: message,
      answer: message,
      progress: 100,
      completedAt: FieldValue.serverTimestamp(),
      steps: markStep(context.steps, "execute", "error", message),
      toolLogs: context.toolLogs,
      logs: [...context.logs, message]
    });
    return created;
  }
}

export async function selectAgentCandidate(input: { user: AgentUser; runId: string; candidateId: string }) {
  const run = await getAgentRunForExecution(input.user.uid, input.runId);
  if (!run) throw new Error("Agent Runが見つかりません。");
  const pendingSelection = normalizePendingSelection(run.pendingSelection);
  if (!pendingSelection) throw new Error("候補選択待ちのRunではありません。");
  const candidate = pendingSelection.candidates.find((item) => item.id === input.candidateId);
  if (!candidate?.id) throw new Error("選択した候補が見つかりません。");
  const context: ExecutionContext = {
    user: input.user,
    runId: input.runId,
    requestId: String(run.requestId ?? ""),
    rawMessage: String(run.title ?? ""),
    steps: run.steps as AgentRunStep[] | undefined ?? [],
    toolLogs: Array.isArray(run.toolLogs) ? run.toolLogs as AgentToolLog[] : [],
    logs: Array.isArray(run.logs) ? run.logs.filter((entry): entry is string => typeof entry === "string") : [],
    toolResults: []
  };
  const selectedEntities = {
    ...(pendingSelection.entities ?? {}),
    selectedLeadId: pendingSelection.targetType === "lead" ? candidate.id : "",
    selectedCompanyId: pendingSelection.targetType === "company" ? candidate.id : "",
    selectedTaskId: pendingSelection.targetType === "task" ? candidate.id : "",
    selectedProductId: pendingSelection.targetType === "product" ? candidate.id : "",
    selectedProjectId: pendingSelection.targetType === "project" ? candidate.id : ""
  };
  await updateProgress(context, "execute", "running", 62, "選択された候補で処理を再開しています。");
  const result = await handleIntent(context, pendingSelection.intent, selectedEntities);
  await patchAgentRunForExecution(input.user.uid, input.runId, {
    status: result.status,
    requiresApproval: Boolean(result.pendingAction),
    answer: result.answer,
    cards: result.cards,
    pendingAction: result.pendingAction ?? null,
    pendingSelection: result.pendingSelection ?? null,
    toolLogs: context.toolLogs,
    logs: [...context.logs, `候補「${candidate.title}」を選択しました。`],
    leadId: result.leadId ?? null,
    companyId: result.companyId ?? null,
    taskId: result.taskId ?? null,
    productId: result.productId ?? null,
    projectId: result.projectId ?? null,
    progress: result.status === "requires_approval" ? 72 : 100,
    currentStep: result.status === "requires_approval" ? "execute" : "complete",
    completedAt: result.status === "completed" ? FieldValue.serverTimestamp() : null,
    steps: result.status === "completed"
      ? markStep(markStep(context.steps, "execute", "success", "選択候補で回答を作成しました。"), "complete", "success", "完了しました。")
      : markStep(context.steps, "execute", "success", "選択候補で確認内容を作成しました。")
  });
  return { runId: input.runId };
}

export async function approvePendingAgentAction(input: { user: AgentUser; runId: string; decision: "approve" | "cancel" }) {
  const run = await getAgentRunForExecution(input.user.uid, input.runId);
  if (!run) throw new Error("Agent Runが見つかりません。");
  const pendingAction = normalizePendingAction(run.pendingAction);
  if (!pendingAction) throw new Error("確認待ちの操作がありません。");
  const steps = run.steps as AgentRunStep[] | undefined ?? [];
  const previousLogs = Array.isArray(run.logs) ? run.logs.filter((entry): entry is string => typeof entry === "string") : [];
  const previousToolLogs = Array.isArray(run.toolLogs) ? run.toolLogs as AgentToolLog[] : [];

  if (input.decision === "cancel") {
    await patchAgentRunForExecution(input.user.uid, input.runId, {
      status: "cancelled",
      requiresApproval: false,
      pendingAction: null,
      answer: "操作はキャンセルしました。データは変更していません。",
      logs: [...previousLogs, "ユーザー確認により操作をキャンセルしました。"],
      progress: 100,
      completedAt: FieldValue.serverTimestamp(),
      steps: markStep(markStep(steps, "execute", "success", "操作はキャンセルされました。"), "complete", "success", "キャンセルとして完了しました。")
    });
    if (typeof run.requestId === "string") await updateAgentRequestForUser(input.user.uid, run.requestId, { status: "cancelled" });
    return { runId: input.runId };
  }

  const result = await executePendingAction(pendingAction, input.user);
  const nextToolLogs = [...previousToolLogs, { ...result.log, executedAt: nowForToolLog() }];
  await patchAgentRunForExecution(input.user.uid, input.runId, {
    status: "completed",
    requiresApproval: false,
    pendingAction: null,
    pendingSelection: null,
    answer: approvalDoneMessage(pendingAction, result.data),
    cards: result.cards,
    toolLogs: nextToolLogs,
    logs: [...previousLogs, "ユーザー確認後に操作を実行しました。"],
    taskId: pendingAction.type === "create_task" || pendingAction.type === "update_task" ? result.data.id : run.taskId ?? null,
    progress: 100,
    completedAt: FieldValue.serverTimestamp(),
    currentStep: "complete",
    steps: markStep(markStep(steps, "execute", "success", "承認済み操作を実行しました。"), "complete", "success", "完了しました。")
  });
  if (typeof run.requestId === "string") await updateAgentRequestForUser(input.user.uid, run.requestId, { status: "completed" });
  await createAgentNotification({
    userId: input.user.uid,
    title: "Agent操作が完了しました",
    message: pendingAction.title,
    type: "success",
    runId: input.runId,
    targetUrl: `/agent?runId=${input.runId}`
  });
  return { runId: input.runId };
}

async function handleIntent(context: ExecutionContext, intent: string, entities: Record<string, string>): Promise<AgentExecutionResult> {
  if (intent === "development_request") {
    return handleDevelopmentRequest(context, entities);
  }
  if (intent === "get_today_tasks") return handleTodayTasks(context);
  if (intent === "get_upcoming_tasks") return handleUpcoming(context, entities);
  if (intent === "get_calendar") return handleCalendar(context, entities);
  if (intent === "search_products") return handleProducts(context, entities);
  if (intent === "search_companies") return handleCompanies(context, entities);
  if (intent === "search_leads") return handleLeads(context, entities);
  if (intent === "get_company_summary" || intent === "get_lead_summary" || intent === "get_meeting_history" || intent === "get_analysis") return handleSummary(context, entities, intent);
  if (intent === "create_task") return handleCreateTask(context, entities);
  if (intent === "update_task") return handleUpdateTask(context, entities);
  if (intent === "create_activity") return handleCreateActivity(context, entities);
  return completed("今の依頼は一般相談として受け付けました。会社・見込み客・タスク・予定・商談履歴について聞いてもらえると、管理画面のデータを参照して回答できます。", []);
}

async function handleTodayTasks(context: ExecutionContext) {
  const today = dayWindow("today");
  const overdue = await runTool(context, tools.getTasks({ userId: context.user.uid, to: new Date(today.from.getTime() - 1), limit: 30 }));
  const dueToday = await runTool(context, tools.getTasks({ userId: context.user.uid, from: today.from, to: today.to, limit: 30 }));
  const cards = [...overdue, ...dueToday].map(taskCard);
  return finishCompleted(context, `今日確認したいタスクは${dueToday.length}件、期限超過は${overdue.length}件です。優先度highのものから先に見るのがよさそうです。`, cards);
}

async function handleDevelopmentRequest(context: ExecutionContext, entities: Record<string, string>): Promise<AgentExecutionResult> {
  const projects = await listDevelopmentProjects() as DocumentData[];
  const activeProjects = projects.filter((project) => project.isActive !== false);
  const selectedProjectId = entities.selectedProjectId || context.projectId || "";
  const project = selectedProjectId
    ? activeProjects.find((entry) => entry.id === selectedProjectId)
    : resolveDevelopmentProject(activeProjects, context.rawMessage, entities.productName || entities.projectName || "");
  if (Array.isArray(project)) {
    return selectionRequired("開発対象Project候補が複数あります。対象を選んでください。", "project", "development_request", entities, project.map(projectCard), { targetType: "project" });
  }
  if (!project) {
    return selectionRequired("開発対象Projectを特定できませんでした。対象を選んでください。", "project", "development_request", entities, activeProjects.slice(0, 12).map(projectCard), { targetType: "project" });
  }
  const memory = await getProjectMemory(project.id);
  const requiredCapabilities = stringArray(project.requiredCapabilities).length ? stringArray(project.requiredCapabilities) : ["codex", "git", "node"];
  const instruction = buildDevelopmentInstruction({
    rawMessage: context.rawMessage,
    project,
    memory,
    requiredCapabilities
  });
  const job = await createDevelopmentJob({
    userId: context.user.uid,
    runId: context.runId,
    requestId: context.requestId,
    projectId: project.id,
    title: context.rawMessage,
    instruction,
    requiredCapabilities
  });
  context.logs.push(`Development Job ${job.jobId} を作成しました。`);
  context.toolLogs.push({
    toolName: "createDevelopmentJob",
    status: "success",
    summary: `Development Job ${job.jobId} をqueuedで作成しました。`,
    targetType: "project",
    targetId: project.id,
    executedAt: nowForToolLog()
  });
  return {
    status: "completed",
    answer: "開発依頼として受け付け、Development Jobを作成しました。開発Macを待っています。WorkerがOnlineになるとJobを取得します。",
    cards: [{
      id: job.jobId,
      type: "summary",
      title: "Development Job queued",
      subtitle: project.name,
      tone: "warning",
      meta: [
        { label: "Project", value: project.name },
        { label: "Job", value: job.jobId },
        { label: "必要能力", value: requiredCapabilities.join(" / ") },
        { label: "状態", value: "開発Macを待っています" }
      ]
    }],
    pendingAction: null,
    pendingSelection: null,
    projectId: project.id,
    targetType: "project",
    targetId: project.id
  };
}

async function handleUpcoming(context: ExecutionContext, entities: Record<string, string>) {
  const leads = await runTool(context, tools.searchLeads({ productName: entities.productName, limit: 80 }));
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  const candidates = leads.filter((candidate) => {
    const lead = candidate.data ?? {};
    const nextAction = tools.dateMillis(lead.nextActionAt);
    const lastActivity = tools.dateMillis(lead.lastActivityAt);
    return (nextAction && nextAction <= nextWeek.getTime()) || !lastActivity || ["appointment", "meeting", "considering", "contacting"].includes(String(lead.status ?? ""));
  }).slice(0, 8);
  return finishCompleted(context, `今週フォロー候補の見込み客は${candidates.length}件です。nextActionAt、最終活動日、ステータス、見込みランクを見て抽出しました。`, candidates.map((candidate) => leadCard(candidate.data ?? {}, candidate.id)));
}

async function handleCalendar(context: ExecutionContext, entities: Record<string, string>) {
  const window = entities.date === "明日" ? dayWindow("tomorrow") : dayWindow("today");
  const events = await runTool(context, tools.getCalendarEvents({ userId: context.user.uid, from: window.from, to: window.to }));
  const tasks = await runTool(context, tools.getTasks({ userId: context.user.uid, from: window.from, to: window.to, limit: 30 }));
  const cards = [...events.map(calendarCard), ...tasks.map(taskCard)].sort((a, b) => (a.meta?.[0]?.value ?? "").localeCompare(b.meta?.[0]?.value ?? ""));
  return finishCompleted(context, `${entities.date === "明日" ? "明日" : "今日"}の予定とタスクは${cards.length}件です。`, cards);
}

async function handleProducts(context: ExecutionContext, entities: Record<string, string>) {
  const products = await runTool(context, tools.searchProducts({ query: entities.productName || entities.product || context.rawMessage }));
  return finishCompleted(context, `${products.length}件の商材が見つかりました。`, products.map((candidate) => tools.toCard(candidate, "product")));
}

async function handleCompanies(context: ExecutionContext, entities: Record<string, string>) {
  const companies = await runTool(context, tools.searchCompanies({ query: entities.companyName || context.rawMessage, productName: entities.productName }));
  return finishCompleted(context, `${companies.length}件の会社が見つかりました。`, companies.map((candidate) => tools.toCard(candidate, "company")));
}

async function handleLeads(context: ExecutionContext, entities: Record<string, string>) {
  const leads = await runTool(context, tools.searchLeads({ query: entities.leadName || entities.companyName, productName: entities.productName, limit: 40 }));
  const appointmentLeads = /アポ|商談/.test(context.rawMessage) ? leads.filter((candidate) => ["appointment", "meeting"].includes(String(candidate.data?.status ?? ""))) : leads;
  return finishCompleted(context, `${appointmentLeads.length}件の見込み客が見つかりました。`, appointmentLeads.map((candidate) => leadCard(candidate.data ?? {}, candidate.id)));
}

async function handleSummary(context: ExecutionContext, entities: Record<string, string>, intent: string) {
  const resolved = await resolveLeadOrCompany(context, entities, intent as AgentIntent);
  if (resolved.status) return resolved.status;
  if (resolved.lead) {
    const activities = await runTool(context, tools.getLeadActivities(resolved.lead.id));
    const tasks = await runTool(context, tools.getTasks({ userId: context.user.uid, leadId: resolved.lead.id, limit: 20 }));
    const meetings = await runTool(context, intent === "get_meeting_history" || intent === "get_analysis" ? tools.summarizeMeetingAndTeleapo({ leadId: resolved.lead.id }) : tools.getAnalysis({ leadId: resolved.lead.id, limit: 5 }));
    return finishCompleted(context, buildLeadSummary(resolved.lead.data ?? {}, activities, tasks, meetings), [leadCard(resolved.lead.data ?? {}, resolved.lead.id), ...tasks.slice(0, 4).map(taskCard), ...meetings.slice(0, 3).map(meetingCard)], { leadId: resolved.lead.id, targetType: "lead", targetId: resolved.lead.id });
  }
  const company = resolved.company;
  if (!company) return completed("対象が見つかりませんでした。会社名または見込み客名をもう少し具体的に指定してください。", []);
  const activities = await runTool(context, tools.getCompanyActivities(company.id));
  const tasks = await runTool(context, tools.getTasks({ userId: context.user.uid, companyId: company.id, limit: 20 }));
  const meetings = await runTool(context, tools.summarizeMeetingAndTeleapo({ companyId: company.id }));
  return finishCompleted(context, buildCompanySummary(company.data ?? {}, activities, tasks, meetings), [tools.toCard(company, "company"), ...tasks.slice(0, 4).map(taskCard), ...meetings.slice(0, 3).map(meetingCard)], { companyId: company.id, targetType: "company", targetId: company.id });
}

async function handleCreateTask(context: ExecutionContext, entities: Record<string, string>) {
  const resolved = await resolveLeadOrCompany(context, entities, "create_task");
  if (resolved.status) return resolved.status;
  const dueDate = parseDate(entities.date || context.rawMessage);
  if (!dueDate) return finishCompleted(context, "期限の日付が特定できませんでした。例:「9月15日」「2026/09/15」のように指定してください。", [], { targetType: "task" });
  const lead = resolved.lead;
  const company = resolved.company;
  const title = /フォロー/.test(context.rawMessage) ? "フォロー連絡" : "Agent依頼タスク";
  const payload = {
    title,
    description: context.rawMessage,
    priority: /至急|急ぎ|重要/.test(context.rawMessage) ? "high" : "medium",
    dueDate: dueDate.toISOString(),
    leadId: lead?.id ?? null,
    leadName: lead?.name ?? null,
    companyId: company?.id ?? lead?.data?.companyId ?? null,
    companyName: company?.name ?? lead?.name ?? null,
    productId: lead?.data?.productId ?? null,
    productName: lead?.data?.productName ?? null
  };
  const pendingAction = tools.createPendingAction({
    type: "create_task",
    title: "以下のタスクを作成します。",
    description: "承認するまでタスクは作成されません。",
    payload,
    preview: [pendingTaskCard(payload)]
  });
  return approval("以下のタスクを作成します。内容を確認してください。", pendingAction, { leadId: lead?.id, companyId: company?.id ?? stringOrNull(lead?.data?.companyId), targetType: "task" });
}

async function handleUpdateTask(context: ExecutionContext, entities: Record<string, string>) {
  const tasks = await runTool(context, tools.getTasks({ userId: context.user.uid, includeCompleted: true, limit: 60 }));
  const query = entities.taskName || entities.leadName || entities.companyName || "";
  const matches = entities.selectedTaskId
    ? tasks.filter((task) => task.id === entities.selectedTaskId)
    : query ? tasks.filter((task) => normalize(String(task.title ?? "") + String(task.leadName ?? "") + String(task.companyName ?? "")).includes(normalize(query))) : tasks.slice(0, 8);
  if (matches.length !== 1) {
    if (matches.length) {
      return selectionRequired("更新対象のタスク候補が複数あります。対象を選んでください。", "task", "update_task", entities, matches.slice(0, 8).map(taskCard), { targetType: "task" });
    }
    return finishCompleted(context, "更新対象のタスクが見つかりませんでした。", [], { targetType: "task" });
  }
  const task = matches[0];
  const payload = {
    taskId: task.id,
    status: /完了|済み/.test(context.rawMessage) ? "completed" : task.status ?? "todo",
    title: task.title ?? ""
  };
  const pendingAction = tools.createPendingAction({
    type: "update_task",
    title: "以下のタスクを更新します。",
    description: "承認するまでタスクは変更されません。",
    payload,
    preview: [taskCard(task)]
  });
  return approval("以下のタスク更新を実行します。内容を確認してください。", pendingAction, { taskId: String(task.id), targetType: "task", targetId: String(task.id) });
}

async function handleCreateActivity(context: ExecutionContext, entities: Record<string, string>) {
  const resolved = await resolveLeadOrCompany(context, entities, "create_activity");
  if (resolved.status) return resolved.status;
  const lead = resolved.lead;
  const company = resolved.company;
  const payload = {
    leadId: lead?.id ?? null,
    companyId: company?.id ?? lead?.data?.companyId ?? null,
    title: "Agentから追加する活動ログ",
    content: context.rawMessage,
    type: /電話|テレアポ/.test(context.rawMessage) ? "call" : /商談/.test(context.rawMessage) ? "meeting" : "note",
    occurredAt: new Date().toISOString(),
    productId: lead?.data?.productId ?? null,
    productName: lead?.data?.productName ?? null
  };
  const pendingAction = tools.createPendingAction({
    type: "create_activity",
    title: "以下の活動ログを追加します。",
    description: "ユーザーが明示した活動ログ追加依頼として扱います。承認するまで保存されません。",
    payload,
    preview: [{
      type: "activity",
      title: String(payload.title),
      body: String(payload.content),
      meta: [
        { label: "対象", value: lead?.name ?? company?.name ?? "未指定" },
        { label: "種類", value: String(payload.type) }
      ]
    }]
  });
  return approval("以下の活動ログを追加します。内容を確認してください。", pendingAction, { leadId: lead?.id, companyId: company?.id ?? stringOrNull(lead?.data?.companyId), targetType: "activity" });
}

async function resolveLeadOrCompany(context: ExecutionContext, entities: Record<string, string>, resumeIntent: AgentIntent) {
  if (entities.selectedLeadId) {
    const lead = await runTool(context, tools.getLead(entities.selectedLeadId));
    if (lead) return { lead: { id: String(lead.id), name: String(lead.companyName ?? "見込み客"), href: `/leads?leadId=${lead.id}`, subtitle: String(lead.productName ?? ""), data: lead } };
  }
  if (entities.selectedCompanyId) {
    const company = await runTool(context, tools.getCompany(entities.selectedCompanyId));
    if (company) return { company: { id: String(company.id), name: String(company.name ?? "会社"), href: `/companies?companyId=${company.id}`, subtitle: String(company.status ?? ""), data: company } };
  }
  const name = entities.leadName || entities.companyName || context.rawMessage;
  const leads = await runTool(context, tools.searchLeads({ query: name, limit: 8 }));
  if (leads.length === 1) return { lead: leads[0] };
  if (leads.length > 1) {
    return { status: selectionRequired("候補が複数あります。対象を選んでください。", "lead", resumeIntent, entities, leads.map((candidate) => tools.toCard(candidate, "candidate")), { targetType: "lead" }) };
  }
  const companies = await runTool(context, tools.searchCompanies({ query: name, limit: 8 }));
  if (companies.length === 1) return { company: companies[0] };
  if (companies.length > 1) {
    return { status: selectionRequired("候補が複数あります。対象を選んでください。", "company", resumeIntent, entities, companies.map((candidate) => tools.toCard(candidate, "candidate")), { targetType: "company" }) };
  }
  return { status: completed("対象が見つかりませんでした。正式名称に近い会社名・見込み客名で指定してください。", []) };
}

async function executePendingAction(pendingAction: AgentPendingAction, user: AgentUser) {
  if (pendingAction.type === "create_task") {
    const result = await tools.createTask(pendingAction.payload, user);
    return { ...result, cards: [{ ...pendingTaskCard(pendingAction.payload), id: result.data.id, href: `/tasks?taskId=${result.data.id}`, tone: "success" as const }] };
  }
  if (pendingAction.type === "update_task") {
    const result = await tools.updateTask(pendingAction.payload, user);
    return { ...result, cards: pendingAction.preview };
  }
  const result = await tools.createActivity(pendingAction.payload, user);
  return { ...result, cards: pendingAction.preview };
}

async function updateProgress(context: ExecutionContext, stepType: string, stepStatus: string, progress: number, message: string, patch: Record<string, unknown> = {}) {
  context.steps = markStep(context.steps, stepType, stepStatus, message);
  await patchAgentRunForExecution(context.user.uid, context.runId, { ...patch, steps: context.steps, logs: context.logs, toolLogs: context.toolLogs, currentStep: stepType, progress });
}

async function runTool<T>(context: ExecutionContext, promise: Promise<{ data: T; log: Omit<AgentToolLog, "executedAt"> }>): Promise<T> {
  try {
    const result = await promise;
    context.toolLogs.push({ ...result.log, executedAt: nowForToolLog() });
    context.logs.push(`${result.log.toolName}: ${result.log.summary}`);
    context.toolResults.push({
      toolName: result.log.toolName,
      summary: result.log.summary,
      data: compactToolData(result.data)
    });
    return result.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool実行に失敗しました。";
    context.toolLogs.push({ toolName: "unknown", status: "error", summary: message, executedAt: nowForToolLog(), errorMessage: message });
    throw error;
  }
}

function completed(answer: string, cards: AgentResultCard[], extra: Partial<AgentExecutionResult> = {}): AgentExecutionResult {
  return { status: "completed" as const, answer, cards, pendingAction: null, pendingSelection: null, ...extra };
}

function approval(answer: string, pendingAction: AgentPendingAction, extra: Partial<AgentExecutionResult> = {}): AgentExecutionResult {
  return { status: "requires_approval" as const, answer, cards: pendingAction.preview, pendingAction, pendingSelection: null, ...extra };
}

async function finishCompleted(context: ExecutionContext, draftAnswer: string, cards: AgentResultCard[], extra: Partial<AgentExecutionResult> = {}): Promise<AgentExecutionResult> {
  const answer = await generateAgentAnswer({
    userRequest: context.rawMessage,
    draftAnswer,
    cards,
    toolResults: context.toolResults
  });
  return completed(answer, cards, extra);
}

function selectionRequired(answer: string, targetType: AgentPendingSelection["targetType"], intent: AgentIntent, entities: Record<string, string>, candidates: AgentResultCard[], extra: Partial<AgentExecutionResult> = {}): AgentExecutionResult {
  return completed(answer, candidates, {
    ...extra,
    pendingSelection: {
      title: "対象を選択してください",
      description: "候補が複数あるため、選択後に同じAgent Runで処理を再開します。",
      targetType,
      intent,
      entities,
      candidates
    }
  });
}

function nowForToolLog(): AgentToolLog["executedAt"] {
  return Timestamp.now() as unknown as AgentToolLog["executedAt"];
}

function compactToolData(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 12).map(compactToolData);
  if (!value || typeof value !== "object") return value;
  const data = value as DocumentData;
  return {
    id: data.id ?? "",
    name: data.name ?? data.companyName ?? data.customerName ?? data.title ?? "",
    subtitle: data.subtitle ?? data.productName ?? data.status ?? data.salesDomain ?? "",
    status: data.status ?? data.callResult ?? "",
    priority: data.priority ?? "",
    dueDate: safeDate(data.dueDate),
    startAt: safeDate(data.startAt),
    occurredAt: safeDate(data.occurredAt),
    recordedAt: safeDate(data.recordedAt),
    assignedUserName: data.assignedUserName ?? data.assigneeName ?? data.internalOwnerName ?? "",
    prospectRank: data.prospectRank ?? "",
    nextAction: data.nextActionTitle ?? data.nextAction ?? data.nextActions ?? "",
    summary: data.summary ?? data.body ?? data.content ?? "",
    positives: data.positives ?? "",
    concerns: data.concerns ?? "",
    href: data.href ?? ""
  };
}

function safeDate(value: unknown): string {
  const millis = tools.dateMillis(value);
  return millis ? new Date(millis).toISOString() : "";
}

function taskCard(task: DocumentData): AgentResultCard {
  return {
    id: String(task.id ?? ""),
    type: "task",
    title: String(task.title ?? "タスク"),
    subtitle: [statusLabel(task.status), priorityLabel(task.priority)].filter(Boolean).join(" / "),
    href: `/tasks?taskId=${task.id}`,
    tone: task.status === "completed" ? "success" : tools.dateMillis(task.dueDate) && tools.dateMillis(task.dueDate) < Date.now() ? "warning" : "default",
    meta: [
      { label: "期限", value: formatDate(task.dueDate) },
      { label: "対象", value: String(task.leadName ?? task.companyName ?? "未設定") },
      { label: "優先度", value: priorityLabel(task.priority) }
    ]
  };
}

function pendingTaskCard(task: DocumentData): AgentResultCard {
  return {
    type: "task",
    title: String(task.title ?? "タスク"),
    subtitle: "作成予定",
    body: String(task.description ?? ""),
    meta: [
      { label: "対象", value: String(task.leadName ?? task.companyName ?? "未設定") },
      { label: "期限", value: formatDate(task.dueDate) },
      { label: "優先度", value: priorityLabel(task.priority) }
    ]
  };
}

function leadCard(lead: DocumentData, id: string): AgentResultCard {
  return {
    id,
    type: "lead",
    title: String(lead.companyName ?? "見込み客"),
    subtitle: [lead.productName, lead.status, lead.prospectRank].filter(Boolean).join(" / "),
    href: `/leads?leadId=${id}`,
    meta: [
      { label: "担当", value: String(lead.assignedUserName ?? "未設定") },
      { label: "最終活動", value: formatDate(lead.lastActivityAt) },
      { label: "次アクション", value: [lead.nextActionTitle, formatDate(lead.nextActionAt)].filter(Boolean).join(" / ") || "未設定" }
    ]
  };
}

function calendarCard(event: DocumentData): AgentResultCard {
  return {
    id: String(event.id ?? ""),
    type: "calendar",
    title: String(event.title ?? "予定"),
    subtitle: String(event.companyName ?? event.eventType ?? ""),
    href: "/calendar",
    meta: [
      { label: "開始", value: formatDate(event.startAt) },
      { label: "場所", value: String(event.location ?? event.meetingUrl ?? "未設定") }
    ]
  };
}

function projectCard(project: DocumentData): AgentResultCard {
  return {
    id: String(project.id ?? ""),
    type: "candidate",
    title: String(project.name ?? "Development Project"),
    subtitle: [project.slug, project.defaultBranch, stringArray(project.requiredCapabilities).join(" / ")].filter(Boolean).join(" / "),
    href: null,
    meta: [
      { label: "Repository", value: String(project.repositoryUrl ?? "未設定") },
      { label: "Framework", value: String(project.framework ?? "未設定") }
    ]
  };
}

function meetingCard(record: DocumentData): AgentResultCard {
  return {
    id: String(record.id ?? ""),
    type: "analysis",
    title: String(record.customerName ?? "商談・テレアポ"),
    subtitle: [record.salesDomain, record.productName, record.callResult].filter(Boolean).join(" / "),
    href: "/sales/analysis",
    body: String(record.summary ?? ""),
    meta: [
      { label: "記録日", value: formatDate(record.recordedAt) },
      { label: "温度感", value: String(record.temperature ?? "未設定") },
      { label: "次アクション", value: arrayText(record.nextActions) || String(record.followupTiming ?? "未設定") }
    ]
  };
}

function buildLeadSummary(lead: DocumentData, activities: DocumentData[], tasks: DocumentData[], meetings: DocumentData[]): string {
  return [
    `${String(lead.companyName ?? "対象見込み客")}の現在ステータスは「${String(lead.status ?? "未設定")}」です。`,
    `担当は${String(lead.assignedUserName ?? "未設定")}、商材は${String(lead.productName ?? "未設定")}、見込みランクは${String(lead.prospectRank ?? "未設定")}です。`,
    `最終活動は${activities[0] ? `${formatDate(activities[0].occurredAt)} ${String(activities[0].title ?? "")}` : "未登録"}。`,
    `商談・テレアポ関連は${meetings.length}件、未完了タスクは${tasks.length}件あります。`,
    `次アクションは${String(lead.nextActionTitle ?? "未設定")} ${formatDate(lead.nextActionAt)}です。`
  ].join("\n");
}

function buildCompanySummary(company: DocumentData, activities: DocumentData[], tasks: DocumentData[], meetings: DocumentData[]): string {
  return [
    `${String(company.name ?? "対象会社")}の現在ステータスは「${String(company.status ?? "未設定")}」です。`,
    `担当は${String(company.internalOwnerName ?? "未設定")}、商材は${Array.isArray(company.productNames) ? company.productNames.join(" / ") || "未設定" : "未設定"}です。`,
    `最終活動は${activities[0] ? `${formatDate(activities[0].occurredAt)} ${String(activities[0].title ?? "")}` : "未登録"}。`,
    `商談・テレアポ関連は${meetings.length}件、未完了タスクは${tasks.length}件あります。`,
    `次アクションは${String(company.nextActionTitle ?? "未設定")} ${formatDate(company.nextActionAt)}です。`
  ].join("\n");
}

function resolveDevelopmentProject(projects: DocumentData[], rawMessage: string, hintedName: string): DocumentData | DocumentData[] | null {
  const query = normalize(hintedName || rawMessage);
  const matches = projects.filter((project) => {
    const source = normalize([
      project.name,
      project.slug,
      project.projectKey,
      project.repositoryName,
      project.repositoryOwner
    ].filter(Boolean).join(" "));
    return source && (query.includes(source) || source.includes(query) || tokenizeProject(String(project.name ?? "")).some((token) => query.includes(normalize(token))));
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;
  const dotName = rawMessage.match(/([A-Za-z0-9_.-]{3,}\.?)/)?.[1];
  if (!dotName) return null;
  const normalizedDotName = normalize(dotName);
  const dotMatches = projects.filter((project) => normalize(String(project.name ?? project.slug ?? "")).includes(normalizedDotName) || normalizedDotName.includes(normalize(String(project.name ?? project.slug ?? ""))));
  if (dotMatches.length === 1) return dotMatches[0];
  return dotMatches.length ? dotMatches : null;
}

function buildDevelopmentInstruction(input: { rawMessage: string; project: DocumentData; memory: DocumentData; requiredCapabilities: string[] }): string {
  return [
    `Project:\n${String(input.project.name ?? "")}`,
    `User Request:\n${input.rawMessage}`,
    `Repository:\nURL: ${String(input.project.repositoryUrl ?? "未設定")}\nOwner: ${String(input.project.repositoryOwner ?? "未設定")}\nName: ${String(input.project.repositoryName ?? "未設定")}\nDefault Branch: ${String(input.project.defaultBranch ?? "main")}`,
    `Required Capabilities:\n${input.requiredCapabilities.join(", ")}`,
    `Project Memory:\nProduct Overview:\n${String(input.memory.productOverview ?? "")}\n\nArchitecture:\n${String(input.memory.architecture ?? "")}\n\nDesign Rules:\n${String(input.memory.designRules ?? "")}\n\nCoding Rules:\n${String(input.memory.codingRules ?? "")}\n\nDecisions:\n${String(input.memory.decisions ?? "")}\n\nNotes:\n${String(input.memory.notes ?? "")}`,
    [
      "Rules:",
      "- 既存実装を最初に確認する",
      "- AGENTS.mdがあれば必ず読む",
      "- 既存UI・既存設計を優先する",
      "- 不要な依存追加は禁止",
      "- Production deploy、default branch merge、pushは禁止",
      "- destructive commandは禁止",
      "- 実装後にProject設定の検証コマンドを実行できる状態にする",
      "- 結果はdiffと検証結果で確認できるようにする"
    ].join("\n")
  ].join("\n\n---\n\n");
}

function approvalDoneMessage(pendingAction: AgentPendingAction, data: { id: string }): string {
  if (pendingAction.type === "create_task") return `タスクを作成しました。ID: ${data.id}`;
  if (pendingAction.type === "update_task") return `タスクを更新しました。ID: ${data.id}`;
  return `活動ログを追加しました。ID: ${data.id}`;
}

function normalizePendingAction(value: unknown): AgentPendingAction | null {
  if (!value || typeof value !== "object") return null;
  const data = value as AgentPendingAction;
  if (data.type !== "create_task" && data.type !== "update_task" && data.type !== "create_activity") return null;
  if (!data.payload || typeof data.payload !== "object") return null;
  return data;
}

function normalizePendingSelection(value: unknown): AgentPendingSelection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as AgentPendingSelection;
  if (data.targetType !== "lead" && data.targetType !== "company" && data.targetType !== "task" && data.targetType !== "product") return null;
  if (!data.intent || !Array.isArray(data.candidates)) return null;
  return data;
}

function dayWindow(target: "today" | "tomorrow") {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (target === "tomorrow") from.setDate(from.getDate() + 1);
  const to = new Date(from);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function parseDate(message: string): Date | null {
  const now = new Date();
  if (message.includes("明日")) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return date;
  }
  const monthDay = message.match(/(\d{1,2})月(\d{1,2})日/);
  if (monthDay) return new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]), 18, 0, 0);
  const slash = message.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (slash) return new Date(Number(slash[1]), Number(slash[2]) - 1, Number(slash[3]), 18, 0, 0);
  return null;
}

function formatDate(value: unknown): string {
  const millis = tools.dateMillis(value);
  if (!millis) return "未設定";
  return new Date(millis).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(value: unknown): string {
  const map: Record<string, string> = { todo: "未着手", in_progress: "進行中", waiting: "待機", completed: "完了", cancelled: "キャンセル" };
  return map[String(value ?? "")] ?? String(value ?? "未設定");
}

function priorityLabel(value: unknown): string {
  const map: Record<string, string> = { high: "高", medium: "中", low: "低" };
  return map[String(value ?? "")] ?? "中";
}

function arrayText(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3).join(" / ") : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function tokenizeProject(value: string): string[] {
  return value.split(/[\s/_.-]+/).filter((token) => token.length >= 2);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[.。・]/g, "");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
