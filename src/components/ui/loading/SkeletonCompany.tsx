import { SkeletonLine } from "@/components/ui/loading/SkeletonCard";

export function SkeletonCompany() {
  return (
    <div className="grid gap-5 xl:grid-cols-[34%_1fr]">
      <div className="rounded-2xl border border-[#F0E7E9] bg-white p-5">
        <SkeletonLine className="h-10 w-full" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="grid grid-cols-[56px_1fr] gap-3 rounded-xl border border-[#F5ECEE] p-3" key={index}>
              <span className="mogcia-skeleton h-14 w-14 rounded-xl" />
              <div className="space-y-3">
                <SkeletonLine className="h-4 w-3/4" />
                <SkeletonLine className="h-3 w-1/2" />
                <SkeletonLine className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#F0E7E9] bg-white p-5">
          <div className="flex gap-4">
            <span className="mogcia-skeleton h-20 w-20 rounded-xl" />
            <div className="flex-1 space-y-3">
              <SkeletonLine className="h-5 w-1/2" />
              <SkeletonLine className="h-3 w-3/4" />
              <SkeletonLine className="h-3 w-2/3" />
            </div>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[40%_1fr]">
          <div className="h-80 rounded-2xl border border-[#F0E7E9] bg-white p-5"><SkeletonLine className="h-full w-full" /></div>
          <div className="h-80 rounded-2xl border border-[#F0E7E9] bg-white p-5"><SkeletonLine className="h-full w-full" /></div>
        </div>
      </div>
    </div>
  );
}
