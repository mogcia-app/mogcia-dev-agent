"use client";

import { ExternalLink, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { formatShortDate, formatTimeRange, getCategoryMeta, getMeetingMethodLabel } from "@/lib/calendar-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent, CalendarItem } from "@/types/calendar";
import type { Route } from "next";
import type { LeadOption } from "@/types/workspace-records";

export function CalendarEventDrawer({ item, event, leads, canEdit, canDelete, onClose, onEdit, onDelete }: { item: CalendarItem | null; event: CalendarEvent | null; leads: LeadOption[]; canEdit: boolean; canDelete: boolean; onClose: () => void; onEdit: (event: CalendarEvent) => void; onDelete: (eventId: string) => Promise<void> }) {
  if (!item) return null;
  const meta = getCategoryMeta(item.category);
  const relatedHref = relatedEntityHref(item, leads);
  const productHref = item.productId ? `/products?productId=${item.productId}` as Route : null;
  const productNames = item.productNames?.length ? item.productNames : item.productName ? [item.productName] : [];
  const remove = async () => {
    if (!event || !window.confirm("この予定を削除しますか？")) return;
    await onDelete(event.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1F1F22]/20 backdrop-blur-sm">
      <aside className="ml-auto h-full w-full max-w-xl overflow-auto border-l border-[#F0E7E9] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-none px-3 py-1 text-xs font-medium ${meta.soft} ${meta.text}`}>{meta.label}</span>
            <h2 className="mt-3 text-xl font-medium text-[#2B2B2B]">{item.title}</h2>
            <p className="mt-2 text-sm font-medium text-[#777]">{formatShortDate(item.startAt)} / {formatTimeRange(item.startAt, item.endAt, item.allDay)}</p>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-none hover:bg-[#FFF0F3]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 rounded-none border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-sm font-semibold text-[#5E565A]">
          {item.description ? <Info label="説明" value={item.description} /> : null}
          <Info label="時間" value={formatTimeRange(item.startAt, item.endAt, item.allDay)} />
          <Info label="実施方法" value={getMeetingMethodLabel(item.meetingMethod)} />
          <Info label="担当者" value={getUserDisplayNameById(item.assigneeId, item.assigneeName)} />
          {item.attendeeNames?.length ? <Info label="参加者" value={item.attendeeNames.join(", ")} /> : null}
          {item.relatedName ? <InfoLink href={relatedHref} label="関連先" value={item.relatedName} /> : item.companyName ? <InfoLink href={item.companyId ? `/sales/companies?id=${item.companyId}&tab=overview` as Route : null} label="関連先" value={item.companyName} /> : null}
          {productNames.length > 1 ? <Info label="商材" value={productNames.join(" / ")} /> : productNames[0] ? <InfoLink href={productHref} label="商材" value={productNames[0]} /> : null}
          {item.projectName ? <Info label="案件" value={item.projectName} /> : null}
          {item.location ? <Info label="場所" value={item.location} /> : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            {item.meetingUrl ? <a className="inline-flex h-11 items-center gap-2 rounded-none bg-[#F47E96] px-5 text-sm font-medium text-white" href={item.meetingUrl} rel="noreferrer" target="_blank"><ExternalLink className="h-4 w-4" />オンライン会議を開く</a> : null}
            {event && canEdit ? <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F0E7E9] px-5 text-sm font-medium text-[#655D62]" onClick={() => onEdit(event)} type="button"><Pencil className="h-4 w-4" />編集</button> : null}
          </div>
          {event && canDelete ? <button className="inline-flex h-11 items-center gap-2 rounded-none border border-[#F7CAD2] px-5 text-sm font-medium text-[#E65A78]" onClick={() => void remove()} type="button"><Trash2 className="h-4 w-4" />削除</button> : null}
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><span className="mr-3 inline-block min-w-24 text-[#9A8F94]">{label}</span>{value}</p>;
}

function InfoLink({ label, value, href }: { label: string; value: string; href: Route | null }) {
  return <p><span className="mr-3 inline-block min-w-24 text-[#9A8F94]">{label}</span>{href ? <Link className="text-[#EC6F8B] hover:underline" href={href}>{value} →</Link> : value}</p>;
}

function relatedEntityHref(item: CalendarItem, leads: LeadOption[]): Route | null {
  if (item.relatedType === "company" && item.relatedId) return `/sales/companies?id=${item.relatedId}&tab=overview` as Route;
  if (item.relatedType === "lead" && item.relatedId) {
    const lead = leads.find((entry) => entry.id === item.relatedId);
    if (lead?.convertedCompanyId) return `/sales/companies?id=${lead.convertedCompanyId}&tab=overview` as Route;
    return `/leads?leadId=${item.relatedId}` as Route;
  }
  return null;
}
