export function SalesSummary({
  confirmationCount,
  overdueCount,
  todayMeetingCount,
  todayTaskCount
}: {
  confirmationCount: number;
  overdueCount: number;
  todayMeetingCount: number;
  todayTaskCount: number;
}) {
  const items = [
    { label: "今日対応する会社", value: todayTaskCount, note: "次回アクション" },
    { label: "今日の商談予定", value: todayMeetingCount, note: "予定・未整理" },
    { label: "期限超過", value: overdueCount, note: "要確認" },
    { label: "確認待ち", value: confirmationCount, note: "商談・タスク" }
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-[20px] border border-line bg-white p-5 shadow-[0_10px_30px_rgba(31,31,34,0.035)]">
          <p className="text-sm font-medium text-neutral-600">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-950">{item.value}<span className="ml-1 text-sm">件</span></p>
          <p className={`mt-3 text-xs ${item.label === "期限超過" && item.value > 0 ? "font-semibold text-rose-500" : "text-neutral-500"}`}>{item.note}</p>
        </div>
      ))}
    </section>
  );
}
