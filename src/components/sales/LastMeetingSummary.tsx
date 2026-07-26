import type { MeetingAnalysis, MeetingRecord } from "@/domain/types";
import { EmptyState } from "./EmptyState";

export function LastMeetingSummary({
  analysis,
  meeting,
  onAdd
}: {
  analysis?: MeetingAnalysis;
  meeting?: MeetingRecord;
  onAdd: () => void;
}) {
  if (!meeting) {
    return <EmptyState actionLabel="商談を追加" message="商談を追加すると、前回の要点や次回アクションがここに表示されます。" onAction={onAdd} title="商談履歴はまだありません。" />;
  }

  return (
    <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mogcia-blush">Last meeting</p>
          <h3 className="mt-1 text-xl font-semibold text-neutral-950">前回の商談</h3>
          <p className="mt-1 text-sm text-neutral-500">{new Date(meeting.startedAt).toLocaleString("ja-JP")} / {meeting.kind}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{analysis?.status ?? "解析未作成"}</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Block title="要約" items={[analysis?.summary ?? meeting.manualMemo ?? meeting.transcription ?? "要約はまだありません。"]} />
        <Block title="顧客の課題" items={analysis?.issues ?? []} />
        <Block title="顧客の懸念" items={analysis?.concerns ?? []} />
        <Block title="MOGCIA側の提案" items={analysis?.proposals ?? analysis?.mogciaStatements ?? []} />
        <Block title="決定事項" items={analysis?.decisions ?? []} />
        <Block title="次回アクション" items={(analysis?.nextActions ?? []).map((action) => `${action.title} / ${action.due || "期限未定"}`)} />
      </div>
    </section>
  );
}

function Block({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-[16px] bg-neutral-50 px-4 py-3">
      <p className="text-sm font-semibold text-neutral-800">{title}</p>
      <div className="mt-2 grid gap-1 text-sm leading-6 text-neutral-600">
        {items.length > 0 ? items.slice(0, 4).map((item) => <p key={item}>・{item}</p>) : <p className="text-neutral-400">未登録</p>}
      </div>
    </div>
  );
}
