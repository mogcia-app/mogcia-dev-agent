import { SkeletonLine } from "@/components/ui/loading/SkeletonCard";

export function SkeletonTask({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <div className="grid gap-4 rounded-2xl border border-[#F0E7E9] bg-white p-4 shadow-[0_14px_44px_rgba(31,31,34,0.04)] sm:grid-cols-[28px_92px_1fr_110px]" key={index}>
          <span className="mogcia-skeleton mt-5 h-5 w-5 rounded-md" />
          <div className="mogcia-skeleton h-20 rounded-xl" />
          <div className="space-y-3 py-2">
            <SkeletonLine className="h-5 w-2/3" />
            <SkeletonLine className="h-3 w-5/6" />
            <SkeletonLine className="h-3 w-1/3" />
          </div>
          <span className="mogcia-skeleton mt-6 h-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}
