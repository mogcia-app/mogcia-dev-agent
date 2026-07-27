"use client";

import { useEffect, useState } from "react";
import { LoadingCard } from "@/components/ui/loading/LoadingCard";

const defaultSteps = ["会社を検索しています...", "活動ログを整理しています...", "タスクを考えています...", "ナレッジを抽出しています..."];

export function AIProcessingCard({
  steps = defaultSteps,
  completed = false,
  compact = false
}: {
  steps?: string[];
  completed?: boolean;
  compact?: boolean;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (completed || steps.length <= 1) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % steps.length), 1600);
    return () => window.clearInterval(timer);
  }, [completed, steps.length]);

  return (
    <LoadingCard
      compact={compact}
      currentStep={completed ? "完了しました" : steps[index] ?? steps[0]}
      progress={completed ? 100 : undefined}
      title={completed ? "完了しました" : "AIが考えています..."}
      description="内容を整理しています"
      variant="ai"
    />
  );
}
