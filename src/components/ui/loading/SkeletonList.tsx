import { SkeletonCard } from "@/components/ui/loading/SkeletonCard";

export function SkeletonList({ count = 5, media = true }: { count?: number; media?: boolean }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} lines={3} media={media} />
      ))}
    </div>
  );
}
