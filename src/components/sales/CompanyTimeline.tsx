import type { CompanyTimelineEvent } from "@/domain/types";
import { EmptyState } from "./EmptyState";

export function CompanyTimeline({ events, onAdd }: { events: CompanyTimelineEvent[]; onAdd: () => void }) {
  return (
    <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mogcia-blush">Timeline</p>
          <h3 className="mt-1 text-xl font-semibold text-neutral-950">会社タイムライン</h3>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{events.length}件</span>
      </div>
      <div className="mt-4 grid gap-3">
        {events.length > 0 ? (
          events.slice(0, 12).map((event) => (
            <div key={event.id} className="border-l border-mogcia-primary pl-4">
              <p className="text-xs text-neutral-500">{new Date(event.eventAt).toLocaleString("ja-JP")} / {event.kind}</p>
              <p className="mt-1 text-sm font-semibold text-neutral-900">{event.title}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-neutral-600">{event.summary}</p>
            </div>
          ))
        ) : (
          <EmptyState actionLabel="営業メモを追加" message="営業メモや商談を追加すると、会社の履歴が時系列で表示されます。" onAction={onAdd} title="タイムラインはまだありません。" />
        )}
      </div>
    </section>
  );
}
