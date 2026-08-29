import "server-only";

import type { DocumentData } from "firebase-admin/firestore";

export function normalizeComparableName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function findNameDuplicates<T extends DocumentData>(items: T[], name: string, fields: string[] = ["name"]) {
  const normalized = normalizeComparableName(name);
  if (!normalized) return [];
  return items.filter((item) => fields.some((field) => normalizeComparableName(item[field]) === normalized));
}

export function findLooseDuplicates<T extends DocumentData>(items: T[], input: { title?: string; companyId?: string | null; startsAt?: Date | null; dueDate?: Date | null }) {
  const normalizedTitle = normalizeComparableName(input.title);
  return items.filter((item) => {
    if (input.companyId && item.companyId !== input.companyId) return false;
    if (normalizedTitle && normalizeComparableName(item.title) !== normalizedTitle) return false;
    const inputTime = input.startsAt?.getTime() ?? input.dueDate?.getTime() ?? null;
    const itemTime = timestampMillis(item.startAt) ?? timestampMillis(item.dueDate) ?? timestampMillis(item.occurredAt);
    if (inputTime && itemTime) return Math.abs(inputTime - itemTime) <= 60 * 60 * 1000;
    return Boolean(normalizedTitle);
  });
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return date.getTime();
  }
  return null;
}
