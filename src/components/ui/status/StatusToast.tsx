import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info
};

export function StatusToast({
  message,
  type = "success",
  onClose
}: {
  message: string | null;
  type?: "success" | "error" | "info";
  onClose?: () => void;
}) {
  if (!message) return null;
  const Icon = icons[type];
  const tone = type === "error" ? "border-[#F7CAD2] text-[#D94F6E]" : type === "info" ? "border-[#DDEDF8] text-[#4F78B4]" : "border-[#F7CAD2] text-[#EC6F8B]";

  return (
    <div className={`fixed right-5 top-5 z-[90] flex max-w-sm items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-medium shadow-[0_18px_48px_rgba(31,31,34,0.12)] ${tone}`} role="status">
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onClose ? (
        <button className="grid h-7 w-7 place-items-center rounded-none hover:bg-[#FCF9F9]" onClick={onClose} type="button" aria-label="閉じる">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
