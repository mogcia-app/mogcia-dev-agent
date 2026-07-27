export function LoadingProgress({
  progress,
  blocks = 12,
  label = "進行状況"
}: {
  progress?: number;
  blocks?: number;
  label?: string;
}) {
  const activeCount = typeof progress === "number" ? Math.max(0, Math.min(blocks, Math.ceil((progress / 100) * blocks))) : undefined;

  return (
    <div className="w-full" role="progressbar" aria-label={label} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${blocks}, minmax(0, 1fr))` }}>
        {Array.from({ length: blocks }, (_, index) => {
          const active = activeCount === undefined ? index < 4 : index < activeCount;
          return (
            <span
              className={`h-2 rounded-[2px] ${active ? "bg-[#F45F7A]" : "bg-[#F7F7F7]"} ${activeCount === undefined ? "mogcia-progress-block" : ""}`}
              key={index}
              style={{ animationDelay: `${index * 90}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function PageProgress() {
  return (
    <div className="fixed left-0 right-0 top-0 z-[80] h-[3px] overflow-hidden bg-[#F7D6DE]" aria-hidden="true">
      <span className="mogcia-page-progress block h-full w-1/3 bg-[#F45F7A]" />
    </div>
  );
}
