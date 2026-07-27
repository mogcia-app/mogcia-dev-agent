import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  title = "まだデータがありません",
  description,
  actionLabel,
  onAction,
  icon: Icon = Inbox
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#F0E7E9] bg-white/80 px-6 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF0F3] text-[#F45F7A]">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-lg font-bold text-[#222]">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#888]">{description}</p> : null}
      {actionLabel && onAction ? (
        <button className="mt-5 h-11 rounded-full bg-[#F45F7A] px-5 text-sm font-bold text-white shadow-[0_12px_26px_rgba(244,95,122,0.18)]" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
