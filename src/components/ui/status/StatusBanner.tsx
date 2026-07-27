import { AlertCircle, CheckCircle2, Info } from "lucide-react";

const bannerMeta = {
  success: { icon: CheckCircle2, className: "border-[#DCEED8] bg-[#F3FAF0] text-[#5E9B61]" },
  error: { icon: AlertCircle, className: "border-[#F7CAD2] bg-[#FFF0F3] text-[#D94F6E]" },
  info: { icon: Info, className: "border-[#DDEDF8] bg-[#F1F7FF] text-[#4F78B4]" }
};

export function StatusBanner({ message, type = "info" }: { message?: string | null; type?: keyof typeof bannerMeta }) {
  if (!message) return null;
  const meta = bannerMeta[type];
  const Icon = meta.icon;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${meta.className}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="leading-6">{message}</p>
    </div>
  );
}
