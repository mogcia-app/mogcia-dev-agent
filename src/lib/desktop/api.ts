import { NextResponse } from "next/server";

export type DesktopErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "AI_ERROR"
  | "CONVERSATION_EXPIRED"
  | "CANDIDATE_INVALID"
  | "CONFIRMATION_REQUIRED"
  | "SERVER_ERROR";

export class DesktopApiError extends Error {
  constructor(
    public code: DesktopErrorCode,
    message: string,
    public status = 400,
    public options: {
      retryable?: boolean;
      field?: string | null;
      details?: Record<string, unknown> | null;
    } = {}
  ) {
    super(message);
  }
}

export function desktopSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function desktopFailure(error: unknown) {
  if (error instanceof DesktopApiError) {
    return NextResponse.json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: error.options.retryable ?? isRetryableDesktopError(error.code, error.status),
        field: error.options.field ?? null,
        details: error.options.details ?? null
      }
    }, { status: error.status });
  }
  const businessError = normalizeBusinessLikeError(error);
  if (businessError) {
    return NextResponse.json({
      success: false,
      error: {
        code: businessError.code,
        message: businessError.message,
        retryable: isRetryableDesktopError(businessError.code, businessError.status),
        field: businessError.field ?? null,
        details: businessError.details ?? null
      }
    }, { status: businessError.status });
  }

  return NextResponse.json({
    success: false,
    error: {
      code: "SERVER_ERROR",
      message: "処理に失敗しました。時間をおいて再送してください。",
      retryable: true,
      field: null,
      details: null
    }
  }, { status: 500 });
}

function normalizeBusinessLikeError(error: unknown): { code: DesktopErrorCode; message: string; status: number; field?: string | null; details?: Record<string, unknown> | null } | null {
  if (!error || typeof error !== "object") return null;
  const source = error as { code?: unknown; message?: unknown; status?: unknown; details?: unknown; field?: unknown };
  if (typeof source.message !== "string") return null;
  const code = mapErrorCode(source.code);
  if (!code) return null;
  return {
    code,
    message: source.message,
    status: typeof source.status === "number" ? source.status : 400,
    field: typeof source.field === "string" ? source.field : null,
    details: source.details && typeof source.details === "object" && !Array.isArray(source.details) ? source.details as Record<string, unknown> : null
  };
}

function mapErrorCode(code: unknown): DesktopErrorCode | null {
  if (code === "CONFLICT") return "DUPLICATE";
  if (
    code === "UNAUTHORIZED" ||
    code === "FORBIDDEN" ||
    code === "VALIDATION_ERROR" ||
    code === "NOT_FOUND" ||
    code === "DUPLICATE" ||
    code === "RATE_LIMITED" ||
    code === "AI_ERROR" ||
    code === "CONVERSATION_EXPIRED" ||
    code === "CANDIDATE_INVALID" ||
    code === "CONFIRMATION_REQUIRED" ||
    code === "SERVER_ERROR"
  ) return code;
  return null;
}

function isRetryableDesktopError(code: DesktopErrorCode, status: number) {
  if (code === "RATE_LIMITED" || code === "AI_ERROR" || code === "DUPLICATE") return true;
  return status >= 500;
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
