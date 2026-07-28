import { CheckCircle2, Pencil, Sparkles } from "lucide-react";
import type { TaskPriority, TaskSource } from "@/types/task";

export function TaskSourceBadge({ source }: { source: TaskSource }) {
  const Icon = source === "ai" ? Sparkles : source === "manual" ? Pencil : CheckCircle2;
  const label = source === "ai" ? "AI作成" : source === "manual" ? "手動" : "自動";
  const color = source === "manual" ? "bg-[#EEF5FF] text-[#4F78B4]" : source === "automation" ? "bg-[#F3F7EF] text-[#5E9B61]" : "bg-[#FFF0F4] text-[#E85D7B]";

  return (
    <span className={`inline-flex min-h-20 w-24 flex-col items-center justify-center gap-2 rounded-none text-sm font-semibold ${color}`}>
      <Icon className="h-6 w-6" />
      {label}
    </span>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const label = priority === "high" ? "高" : priority === "medium" ? "中" : "低";
  const color = priority === "high" ? "text-[#E85D7B]" : priority === "medium" ? "text-[#C97724]" : "text-[#5F86C9]";
  return (
    <span className={`inline-flex items-center text-xs font-medium ${color}`}>
      優先度{label}
    </span>
  );
}
