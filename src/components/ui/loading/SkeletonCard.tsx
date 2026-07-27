function SkeletonLine({ className = "" }: { className?: string }) {
  return <span className={`mogcia-skeleton block rounded-md ${className}`} />;
}

export function SkeletonCard({ lines = 4, media = false }: { lines?: number; media?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#F0E7E9] bg-white p-5 shadow-[0_14px_44px_rgba(31,31,34,0.04)]">
      <div className="flex gap-4">
        {media ? <span className="mogcia-skeleton h-16 w-16 shrink-0 rounded-xl" /> : null}
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonLine className="h-4 w-1/2" />
          {Array.from({ length: lines }, (_, index) => (
            <SkeletonLine className={`h-3 ${index % 3 === 0 ? "w-5/6" : index % 3 === 1 ? "w-2/3" : "w-4/5"}`} key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export { SkeletonLine };
