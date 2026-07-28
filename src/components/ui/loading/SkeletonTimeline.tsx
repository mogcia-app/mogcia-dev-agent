import { SkeletonLine } from "@/components/ui/loading/SkeletonCard";

export function SkeletonTimeline({ count = 5 }: { count?: number }) {
  return (
    <div className="rounded-2xl border border-[#F0E7E9] bg-white p-5 shadow-[0_14px_44px_rgba(31,31,34,0.04)]">
      <div className="space-y-5">
        {Array.from({ length: count }, (_, index) => (
          <div className="grid grid-cols-[28px_1fr] gap-4" key={index}>
            <div className="relative flex justify-center">
              <span className="mogcia-skeleton h-3 w-3 rounded-none" />
              {index < count - 1 ? <span className="absolute top-5 h-16 w-px bg-[#F0E7E9]" /> : null}
            </div>
            <div className="space-y-3 rounded-xl border border-[#F5ECEE] bg-[#FFFBFC] p-4">
              <SkeletonLine className="h-3 w-28" />
              <SkeletonLine className="h-4 w-2/3" />
              <SkeletonLine className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
