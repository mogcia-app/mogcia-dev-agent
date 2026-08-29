import { NextResponse } from "next/server";

export type DesktopErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "AI_ERROR"
  | "SERVER_ERROR";

export class DesktopApiError extends Error {
  constructor(
    public code: DesktopErrorCode,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function desktopSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function desktopFailure(error: unknown) {
  if (error instanceof DesktopApiError) {
    return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "処理に失敗しました";
  return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message } }, { status: 500 });
}

export function requireString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new DesktopApiError("VALIDATION_ERROR", `${label}を入力してください`, 400);
  const trimmed = value.trim();
  if (!trimmed) throw new DesktopApiError("VALIDATION_ERROR", `${label}を入力してください`, 400);
  if (trimmed.length > maxLength) throw new DesktopApiError("VALIDATION_ERROR", `${label}は${maxLength}文字以内で入力してください`, 400);
  return trimmed;
}

export function optionalString(value: unknown, label: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new DesktopApiError("VALIDATION_ERROR", `${label}の形式が正しくありません`, 400);
  if (value.length > maxLength) throw new DesktopApiError("VALIDATION_ERROR", `${label}は${maxLength}文字以内で入力してください`, 400);
  return value.trim();
}

export function parseIsoDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new DesktopApiError("VALIDATION_ERROR", `${label}の形式が正しくありません`, 400);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DesktopApiError("VALIDATION_ERROR", `${label}を解釈できません`, 400);
  return date;
}

export function clampArray<T>(items: T[], max: number): T[] {
  return items.slice(0, max);
}
