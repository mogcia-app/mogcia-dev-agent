import { SkeletonCard, SkeletonTimeline } from "@/components/ui/loading";

export function CalendarSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[38%_1fr]">
      <div className="h-[620px] rounded-2xl border border-[#F0E7E9] bg-white p-5">
        <div className="mogcia-skeleton h-full rounded-xl" />
      </div>
      <div className="space-y-5">
        <SkeletonTimeline count={5} />
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}
