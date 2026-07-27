export function LoadingSpinner({ label = "読み込み中" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label={label}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <span className="mogcia-block-spinner h-2 w-2 rounded-[2px] bg-[#F45F7A]" key={index} style={{ animationDelay: `${index * 90}ms` }} />
      ))}
    </span>
  );
}
