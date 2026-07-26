export function EmptyState({
  actionLabel,
  message,
  onAction,
  title
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="rounded-[18px] border border-line bg-white px-5 py-6 text-sm">
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="mt-2 leading-6 text-neutral-500">{message}</p>
      {actionLabel && onAction ? (
        <button className="mt-4 rounded-full bg-mogcia-light px-4 py-2 text-sm font-semibold text-mogcia-blush hover:bg-mogcia-primary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
