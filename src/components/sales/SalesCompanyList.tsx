import type { Client, MeetingAnalysis, MeetingRecord, SalesActionTask } from "@/domain/types";
import { EmptyState } from "./EmptyState";

export function SalesCompanyList({
  clients,
  analyses,
  meetings,
  onCreateCompany,
  onOpenClient,
  search,
  tasks
}: {
  clients: Client[];
  analyses: MeetingAnalysis[];
  meetings: MeetingRecord[];
  onCreateCompany: () => void;
  onOpenClient: (clientId: string) => void;
  search: string;
  tasks: SalesActionTask[];
}) {
  const filtered = clients.filter((client) => `${client.name} ${client.industry} ${client.contactName}`.toLowerCase().includes(search.toLowerCase()));

  if (filtered.length === 0) {
    return <EmptyState actionLabel="会社を追加" message="会社を追加すると、次回アクションと前回商談がここに表示されます。" onAction={onCreateCompany} title="表示できる会社がありません。" />;
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
      <div className="grid grid-cols-[1.2fr_0.8fr_1.2fr_1fr_120px] gap-4 border-b border-line bg-neutral-50 px-5 py-3 text-xs font-semibold text-neutral-500">
        <span>会社</span>
        <span>状況</span>
        <span>次回アクション</span>
        <span>前回の要点</span>
        <span className="text-right">最終接触</span>
      </div>
      <div className="divide-y divide-line">
      {filtered.map((client) => {
        const clientMeetings = meetings.filter((meeting) => meeting.clientId === client.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        const latestMeeting = clientMeetings[0];
        const latestAnalysis = latestMeeting ? analyses.find((analysis) => analysis.meetingId === latestMeeting.id) : undefined;
        const nextTask = tasks.find((task) => task.clientId === client.id && task.status !== "done");

        return (
          <button key={client.id} className="grid w-full grid-cols-[1.2fr_0.8fr_1.2fr_1fr_120px] gap-4 px-5 py-4 text-left transition hover:bg-mogcia-icon/70" onClick={() => onOpenClient(client.id)} type="button">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-neutral-950">{client.name}</span>
              <span className="mt-1 block truncate text-xs text-neutral-500">{client.industry} / {client.contactName}</span>
            </span>
            <span className="min-w-0">
              <span className="inline-flex rounded-full bg-mogcia-light px-2.5 py-1 text-xs font-semibold text-mogcia-blush">{client.salesStatus ?? client.companyType ?? "未設定"}</span>
              <span className="mt-1 block text-xs text-neutral-500">{client.contractStatus ?? "未契約"}</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-neutral-800">{nextTask?.title ?? "未登録"}</span>
              <span className="mt-1 block text-xs text-neutral-500">{nextTask?.due ? `期限: ${nextTask.due}` : "期限未設定"}</span>
            </span>
            <span className="line-clamp-2 text-sm leading-6 text-neutral-600">{latestAnalysis?.summary ?? latestMeeting?.manualMemo ?? latestMeeting?.transcription ?? "商談履歴なし"}</span>
            <span className="text-right text-sm font-medium text-neutral-600">{latestMeeting ? relativeDate(latestMeeting.startedAt) : "未接触"}</span>
          </button>
        );
      })}
      </div>
    </section>
  );
}

function relativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(diff / 86400000));
  if (days === 0) return "今日";
  if (days === 1) return "1日前";
  return `${days}日前`;
}
