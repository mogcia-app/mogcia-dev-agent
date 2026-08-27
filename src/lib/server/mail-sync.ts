import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAgentNotification } from "@/lib/server/agent/repository";

export type MailEntityMatch = {
  email: string;
  entityType: "lead" | "company" | "contact";
  entityId: string;
  displayName: string;
  leadId: string | null;
  companyId: string | null;
  contactId: string | null;
};

export async function resolveMailAddresses(addresses: string[]): Promise<MailEntityMatch[]> {
  const wanted = new Set(addresses.map(normalizeAddress).filter(Boolean));
  if (!wanted.size) return [];
  const db = getAdminDb();
  const [leadSnapshot, companySnapshot] = await Promise.all([
    db.collection("leads").limit(1000).get(),
    db.collection("companies").limit(1000).get()
  ]);
  const matches = new Map<string, MailEntityMatch>();
  for (const document of leadSnapshot.docs) {
    const data = document.data();
    const email = normalizeAddress(data.email);
    if (wanted.has(email)) matches.set(`lead:${document.id}:${email}`, {
      email, entityType: "lead", entityId: document.id,
      displayName: stringValue(data.companyName) || stringValue(data.contactName) || email,
      leadId: document.id, companyId: nullableString(data.companyId), contactId: null
    });
  }
  for (const document of companySnapshot.docs) {
    const data = document.data();
    const companyEmail = normalizeAddress(data.email);
    if (wanted.has(companyEmail)) matches.set(`company:${document.id}:${companyEmail}`, {
      email: companyEmail, entityType: "company", entityId: document.id,
      displayName: stringValue(data.name) || companyEmail,
      leadId: null, companyId: document.id, contactId: null
    });
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    for (const rawContact of contacts) {
      const contact = rawContact && typeof rawContact === "object" ? rawContact as Record<string, unknown> : {};
      const email = normalizeAddress(contact.email);
      if (!wanted.has(email)) continue;
      const contactId = stringValue(contact.id) || null;
      matches.set(`contact:${document.id}:${contactId ?? email}`, {
        email, entityType: "contact", entityId: contactId ?? `${document.id}:${email}`,
        displayName: stringValue(contact.name) || stringValue(data.name) || email,
        leadId: null, companyId: document.id, contactId
      });
    }
  }
  return [...matches.values()];
}

export async function importMailActivity(input: Record<string, unknown>, user: { uid: string; name?: string }) {
  const direction = input.direction === "sent" ? "sent" : input.direction === "received" ? "received" : null;
  const messageId = limitedString(input.messageId, 998);
  const from = normalizeAddress(input.from);
  const to = stringArray(input.to).map(normalizeAddress).filter(Boolean);
  const cc = stringArray(input.cc).map(normalizeAddress).filter(Boolean);
  if (!direction || !messageId || !from) throw new Error("メール識別情報が不足しています。");
  const counterpart = direction === "sent" ? [...to, ...cc] : [from];
  const matches = await resolveMailAddresses(counterpart);
  if (!matches.length) throw new Error("登録済みの相手に一致しないため保存しませんでした。");
  const chosen = chooseMatch(matches, input);
  if (!chosen) throw new Error("指定された紐付け先を確認できませんでした。");

  const db = getAdminDb();
  const dedupKey = createHash("sha256").update(`${user.uid}\u0000${messageId}`).digest("hex");
  const dedupRef = db.collection("mailActivityImports").doc(dedupKey);
  const activityRef = db.collection("activities").doc();
  const occurredAt = timestampOrNow(input.occurredAt);
  const subject = limitedString(input.subject, 500) || "件名なし";
  const body = input.storeBody === true ? limitedString(input.bodyText, 20_000) : "";
  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(dedupRef);
    if (existing.exists) return { id: String(existing.data()?.activityId ?? ""), duplicate: true };
    transaction.create(activityRef, {
      leadId: chosen.leadId, companyId: chosen.companyId, dealId: null,
      type: "email", title: `${direction === "sent" ? "メール送信" : "メール受信"}: ${subject}`,
      content: body, direction: direction === "sent" ? "outbound" : "inbound", source: "email",
      mailMessageId: messageId, mailDirection: direction, mailAccount: limitedString(input.mailAccount, 320) || null,
      mailFrom: from, mailTo: to, mailCc: cc, mailSubject: subject,
      contactId: chosen.contactId, contactName: chosen.displayName,
      hasAttachments: input.hasAttachments === true,
      attachmentCount: boundedInteger(input.attachmentCount, 0, 1000),
      occurredAt, createdBy: user.uid, createdByName: user.name ?? "",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    transaction.create(dedupRef, { userId: user.uid, messageId, activityId: activityRef.id, createdAt: FieldValue.serverTimestamp() });
    return { id: activityRef.id, duplicate: false };
  });
  if (!created.duplicate && chosen.leadId) {
    await db.collection("leads").doc(chosen.leadId).update({ lastActivityAt: occurredAt, updatedAt: FieldValue.serverTimestamp() });
  }
  if (!created.duplicate && direction === "received" && input.notify === true) {
    await createAgentNotification({
      userId: user.uid, type: "email_received", title: `${chosen.displayName}からメールを受信しました`,
      message: subject, runId: null, projectId: null,
      targetUrl: chosen.leadId ? `/leads?leadId=${chosen.leadId}` : `/companies?companyId=${chosen.companyId}`
    });
  }
  return { ...created, match: chosen };
}

function chooseMatch(matches: MailEntityMatch[], input: Record<string, unknown>) {
  const leadId = nullableString(input.leadId); const companyId = nullableString(input.companyId); const contactId = nullableString(input.contactId);
  if (leadId || companyId || contactId) return matches.find((match) => (!leadId || match.leadId === leadId) && (!companyId || match.companyId === companyId) && (!contactId || match.contactId === contactId));
  return matches.length === 1 ? matches[0] : undefined;
}
export function normalizeAddress(value: unknown): string {
  const raw = stringValue(value).toLowerCase();
  const bracketed = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (bracketed?.[1] ?? raw).replace(/^mailto:/, "").trim();
}
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableString(value: unknown) { return stringValue(value) || null; }
function limitedString(value: unknown, max: number) { return stringValue(value).slice(0, max); }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 100) : []; }
function boundedInteger(value: unknown, min: number, max: number) { const number = typeof value === "number" ? Math.trunc(value) : 0; return Math.min(max, Math.max(min, number)); }
function timestampOrNow(value: unknown) { const date = typeof value === "string" ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? Timestamp.fromDate(date) : Timestamp.now(); }
