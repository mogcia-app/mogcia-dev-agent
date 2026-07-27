"use client";

import { ExternalLink, Trash2, X } from "lucide-react";
import { formatShortDate, formatTime, getCategoryMeta } from "@/lib/calendar-utils";
import { getUserDisplayNameById } from "@/lib/user-display";
import type { CalendarEvent, CalendarItem } from "@/types/calendar";

export function CalendarEventDrawer({ item, event, canDelete, onClose, onDelete }: { item: CalendarItem | null; event: CalendarEvent | null; canDelete: boolean; onClose: () => void; onDelete: (eventId: string) => Promise<void> }) {
  if (!item) return null;
  const meta = getCategoryMeta(item.category);
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
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${meta.soft} ${meta.text}`}>{meta.label}</span>
            <h2 className="mt-3 text-2xl font-bold text-[#2B2B2B]">{item.title}</h2>
            <p className="mt-2 text-sm font-bold text-[#777]">{formatShortDate(item.startAt)} {item.allDay ? "終日" : `${formatTime(item.startAt)}${item.endAt ? ` - ${formatTime(item.endAt)}` : ""}`}</p>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#FFF0F3]" onClick={onClose} type="button" aria-label="閉じる"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 rounded-lg border border-[#F0E7E9] bg-[#FFFBFC] p-4 text-sm font-semibold text-[#5E565A]">
          {item.description ? <Info label="説明" value={item.description} /> : null}
          <Info label="担当者" value={getUserDisplayNameById(item.assigneeId, item.assigneeName)} />
          {item.attendeeNames?.length ? <Info label="参加者" value={item.attendeeNames.join(", ")} /> : null}
          {item.companyName ? <Info label="会社" value={item.companyName} /> : null}
          {item.projectName ? <Info label="案件" value={item.projectName} /> : null}
          {item.location ? <Info label="場所" value={item.location} /> : null}
          {item.createdBy ? <Info label="作成者" value={getUserDisplayNameById(item.createdBy, item.createdByName)} /> : null}
          {item.createdAt ? <Info label="作成日時" value={item.createdAt.toLocaleString("ja-JP")} /> : null}
          {item.updatedAt ? <Info label="更新日時" value={item.updatedAt.toLocaleString("ja-JP")} /> : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            {item.meetingUrl ? <a className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F47E96] px-5 text-sm font-bold text-white" href={item.meetingUrl} rel="noreferrer" target="_blank"><ExternalLink className="h-4 w-4" />オンライン会議を開く</a> : null}
          </div>
          {event && canDelete ? <button className="inline-flex h-11 items-center gap-2 rounded-full border border-[#F7CAD2] px-5 text-sm font-bold text-[#E65A78]" onClick={() => void remove()} type="button"><Trash2 className="h-4 w-4" />削除</button> : null}
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><span className="mr-3 inline-block min-w-24 text-[#9A8F94]">{label}</span>{value}</p>;
}
