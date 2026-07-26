import type { Client, MeetingAnalysis, MeetingRecord, SalesActionTask } from "@/domain/types";

export function SalesCompanyCard({
  client,
  latestAnalysis,
  latestMeeting,
  nextTask,
  onOpen
}: {
  client: Client;
  latestAnalysis?: MeetingAnalysis;
  latestMeeting?: MeetingRecord;
  nextTask?: SalesActionTask;
  onOpen: () => void;
}) {
  return (
    <button className="rounded-[20px] border border-line bg-white p-5 text-left shadow-[0_10px_30px_rgba(31,31,34,0.035)] transition hover:-translate-y-0.5 hover:border-mogcia-primary-dark" onClick={onOpen} type="button">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-neutral-950">{client.name}</p>
          <p className="mt-1 text-sm text-neutral-500">{client.industry} / 担当: {client.contactName}</p>
        </div>
        <span className="rounded-full bg-mogcia-light px-3 py-1 text-xs font-semibold text-mogcia-blush">{client.salesStatus ?? client.companyType ?? "未設定"}</span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-mogcia-blush">次回アクション</p>
          <p className="mt-1 text-sm font-semibold text-neutral-800">{nextTask?.title ?? "未登録"}</p>
          <p className="mt-1 text-xs text-neutral-500">{nextTask?.due ? `期限: ${nextTask.due}` : "期限未設定"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-mogcia-blush">前回の要点</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-neutral-600">{latestAnalysis?.summary ?? latestMeeting?.manualMemo ?? latestMeeting?.transcription ?? "商談履歴はまだありません。"}</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-xs text-neutral-400">最終接触</p>
          <p className="mt-1 text-sm font-semibold text-neutral-700">{latestMeeting ? relativeDate(latestMeeting.startedAt) : "未接触"}</p>
        </div>
      </div>
    </button>
  );
}

function relativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(diff / 86400000));
  if (days === 0) return "今日";
  if (days === 1) return "1日前";
  return `${days}日前`;
}
