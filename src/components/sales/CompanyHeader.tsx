import type { Client, MeetingRecord, SalesActionTask } from "@/domain/types";

export function CompanyHeader({
  client,
  latestMeeting,
  nextTask,
  onAdd
}: {
  client: Client;
  latestMeeting?: MeetingRecord;
  nextTask?: SalesActionTask;
  onAdd: () => void;
}) {
  const nextSchedule = nextTask?.due ?? (latestMeeting ? new Date(latestMeeting.startedAt).toLocaleDateString("ja-JP") : "未登録");

  return (
    <section className="rounded-[22px] border border-line bg-white p-6 shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-mogcia-blush">{client.industry}</p>
          <h2 className="mt-2 text-3xl font-semibold text-neutral-950">{client.name}</h2>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-neutral-600">
            <span className="rounded-full bg-mogcia-light px-3 py-1 text-mogcia-blush">{client.salesStatus ?? client.companyType ?? "営業管理"}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1">主担当: {client.contactName}</span>
            {client.salesOwner ? <span className="rounded-full bg-neutral-100 px-3 py-1">担当営業: {client.salesOwner}</span> : null}
          </div>
        </div>
        <button className="rounded-full bg-mogcia-primary px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-mogcia-primary-dark" onClick={onAdd} type="button">
          ＋追加
        </button>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Info label="電話" value={client.phone ?? "未登録"} />
        <Info label="メール" value={client.email ?? "未登録"} />
        <Info label="Webサイト" value={client.website ?? "未登録"} />
        <Info label="次回予定" value={nextSchedule} />
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-neutral-50 px-4 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-800">{value}</p>
    </div>
  );
}
