import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

type NotificationReason = "created" | "reassigned";

interface AssignmentNotificationBody {
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  assigneeId?: string;
  assigneeName?: string;
  actorName?: string;
  companyName?: string;
  productName?: string;
  dueDate?: string;
  dueTime?: string;
  reason?: NotificationReason;
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireUserFromRequest(request);
    const body = (await request.json()) as AssignmentNotificationBody;
    const assigneeId = requireString(body.assigneeId, "担当者ID", 120);
    if (assigneeId === currentUser.uid) {
      return NextResponse.json({ sent: false, skipped: true, reason: "self_assignment" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      return NextResponse.json({ sent: false, skipped: true, reason: "email_not_configured" });
    }

    const assignee = await getAdminAuth().getUser(assigneeId);
    if (!assignee.email) {
      return NextResponse.json({ sent: false, skipped: true, reason: "assignee_email_missing" });
    }

    const actorName = cleanString(body.actorName) || currentUser.name || currentUser.email || "MOGCIA";
    const taskTitle = requireString(body.taskTitle, "タスク名", 300);
    const subjectPrefix = body.reason === "reassigned" ? "担当者が変更されました" : "新しいタスクが割り当てられました";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [assignee.email],
        subject: `【MOGCIA】${subjectPrefix}: ${taskTitle}`,
        text: buildText({
          taskTitle,
          taskDescription: cleanString(body.taskDescription),
          assigneeName: cleanString(body.assigneeName) || assignee.displayName || assignee.email,
          actorName,
          companyName: cleanString(body.companyName),
          productName: cleanString(body.productName),
          dueDate: cleanString(body.dueDate),
          dueTime: cleanString(body.dueTime),
          reason: body.reason === "reassigned" ? "reassigned" : "created",
          appUrl: process.env.NEXT_PUBLIC_APP_URL || ""
        })
      })
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json({ sent: false, error: message || "メール送信に失敗しました" }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json({ sent: false, error: error instanceof Error ? error.message : "通知を送信できませんでした" }, { status: 400 });
  }
}

function buildText(input: {
  taskTitle: string;
  taskDescription: string;
  assigneeName: string;
  actorName: string;
  companyName: string;
  productName: string;
  dueDate: string;
  dueTime: string;
  reason: NotificationReason;
  appUrl: string;
}): string {
  const action = input.reason === "reassigned" ? "担当者が変更されました。" : "新しいタスクが割り当てられました。";
  return [
    `${input.assigneeName}さん`,
    "",
    `MOGCIAで${action}`,
    "",
    `タスク: ${input.taskTitle}`,
    input.companyName ? `会社: ${input.companyName}` : "",
    input.productName ? `商材: ${input.productName}` : "",
    input.dueDate ? `期限: ${input.dueDate}${input.dueTime ? ` ${input.dueTime}` : ""}` : "",
    input.taskDescription ? `内容: ${input.taskDescription}` : "",
    "",
    `依頼者: ${input.actorName}`,
    input.appUrl ? `確認: ${input.appUrl}/tasks` : ""
  ].filter((line) => line !== "").join("\n");
}

function requireString(value: unknown, label: string, maxLength: number): string {
  const text = cleanString(value);
  if (!text) throw new Error(`${label}が不足しています。`);
  if (text.length > maxLength) throw new Error(`${label}が長すぎます。`);
  return text;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
