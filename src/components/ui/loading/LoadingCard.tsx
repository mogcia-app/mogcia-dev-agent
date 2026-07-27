import { LoadingDots } from "@/components/ui/loading/LoadingDots";
import { LoadingLogo } from "@/components/ui/loading/LoadingLogo";
import { LoadingProgress } from "@/components/ui/loading/LoadingProgress";

const loadingCopy = {
  auth: {
    title: "認証しています",
    description: "アカウントを確認しています..."
  },
  initial: {
    title: "読み込み中です",
    description: "しばらくお待ちください"
  },
  ai: {
    title: "AIが考えています...",
    description: "内容を整理しています"
  },
  saving: {
    title: "保存しています",
    description: "変更内容を反映しています..."
  }
};

export function LoadingCard({
  variant = "initial",
  title,
  description,
  currentStep,
  progress,
  compact = false
}: {
  variant?: keyof typeof loadingCopy;
  title?: string;
  description?: string;
  currentStep?: string;
  progress?: number;
  compact?: boolean;
}) {
  const copy = loadingCopy[variant];

  return (
    <div className={`mx-auto w-full max-w-md rounded-2xl border border-[#F0E7E9] bg-white/92 text-center shadow-[0_22px_70px_rgba(31,31,34,0.08)] ${compact ? "p-6" : "p-8"}`}>
      <div className="flex justify-center">
        <LoadingLogo size={compact ? "sm" : "md"} />
      </div>
      <h2 className="mt-5 text-xl font-bold text-[#222]">{title ?? copy.title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#888]">{description ?? copy.description}</p>
      {currentStep ? <p className="mt-4 rounded-lg bg-[#FCF9F9] px-4 py-3 text-sm font-bold text-[#F45F7A]">{currentStep}</p> : null}
      <div className="mt-5">
        {variant === "ai" || typeof progress === "number" ? <LoadingProgress progress={progress} /> : <LoadingDots />}
      </div>
    </div>
  );
}
