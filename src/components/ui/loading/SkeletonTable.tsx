import { SkeletonLine } from "@/components/ui/loading/SkeletonCard";

export function SkeletonTable({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-2xl border border-[#F0E7E9] bg-white p-5 shadow-[0_14px_44px_rgba(31,31,34,0.04)]">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonLine className="h-3 w-3/4" key={`head-${index}`} />
        ))}
      </div>
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, row) => (
          <div className="grid gap-3 border-t border-[#F5ECEE] pt-4" key={row} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }, (_, column) => (
              <SkeletonLine className={`h-4 ${column === 0 ? "w-5/6" : "w-2/3"}`} key={`${row}-${column}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
