import { AlertTriangle, RefreshCw } from "lucide-react";
import { LoadingLogo } from "@/components/ui/loading/LoadingLogo";

export function ErrorState({
  title = "読み込みに失敗しました",
  description,
  actionLabel = "再読み込み",
  onRetry
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#F7CAD2] bg-white px-6 py-10 text-center shadow-[0_18px_56px_rgba(31,31,34,0.06)]">
      <div className="relative mx-auto w-fit">
        <LoadingLogo size="md" />
        <span className="absolute -right-2 bottom-2 grid h-9 w-9 place-items-center rounded-full bg-[#FFF0F3] text-[#D94F6E] shadow-sm">
          <AlertTriangle className="h-5 w-5" />
        </span>
      </div>
      <h3 className="mt-5 text-xl font-bold text-[#222]">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#888]">{description}</p> : null}
      {onRetry ? (
        <button className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#F45F7A] px-5 text-sm font-bold text-white" onClick={onRetry} type="button">
          <RefreshCw className="h-4 w-4" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
