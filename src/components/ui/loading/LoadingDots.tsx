export function LoadingDots({ label = "処理中" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={label}>
      {[0, 1, 2, 3, 4].map((index) => (
        <span className="mogcia-loading-dot h-2 w-2 rounded-sm bg-[#F45F7A]" key={index} style={{ animationDelay: `${index * 120}ms` }} />
      ))}
    </span>
  );
}
