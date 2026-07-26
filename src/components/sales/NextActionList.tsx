import type { SalesActionTask } from "@/domain/types";
import { EmptyState } from "./EmptyState";

export function NextActionList({ onAdd, tasks }: { onAdd: () => void; tasks: SalesActionTask[] }) {
  const openTasks = tasks.filter((task) => task.status !== "done");

  return (
    <section className="rounded-[22px] border border-mogcia-light bg-mogcia-icon p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mogcia-blush">Next action</p>
          <h3 className="mt-1 text-xl font-semibold text-neutral-950">次にすること</h3>
        </div>
        <button className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-mogcia-blush ring-1 ring-mogcia-light" onClick={onAdd} type="button">追加</button>
      </div>
      <div className="mt-4 grid gap-3">
        {openTasks.length > 0 ? (
          openTasks.slice(0, 6).map((task) => (
            <div key={task.id} className="rounded-[18px] border border-line bg-white px-4 py-4">
              <p className="font-semibold text-neutral-900">{task.title}</p>
              <p className="mt-2 text-sm text-neutral-600">担当: {task.assignee} / 期限: {task.due || "未設定"}</p>
              <span className="mt-3 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">{task.importance} / {task.status}</span>
            </div>
          ))
        ) : (
          <EmptyState actionLabel="アクションを追加" message="次回アクションは登録されていません。" onAction={onAdd} title="次にすることはありません。" />
        )}
      </div>
    </section>
  );
}
