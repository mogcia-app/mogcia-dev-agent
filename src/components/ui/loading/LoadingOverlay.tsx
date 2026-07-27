import { LoadingCard } from "@/components/ui/loading/LoadingCard";

export function LoadingOverlay({
  variant = "initial",
  title,
  description,
  currentStep,
  progress,
  blocking = true
}: {
  variant?: "auth" | "initial" | "ai" | "saving";
  title?: string;
  description?: string;
  currentStep?: string;
  progress?: number;
  blocking?: boolean;
}) {
  return (
    <div className={`fixed inset-0 z-[70] grid place-items-center bg-[#FCF9F9]/75 px-5 backdrop-blur-sm ${blocking ? "" : "pointer-events-none"}`}>
      <LoadingCard currentStep={currentStep} description={description} progress={progress} title={title} variant={variant} />
    </div>
  );
}
