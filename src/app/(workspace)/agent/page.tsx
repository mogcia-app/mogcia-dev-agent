import { Suspense } from "react";
import { AgentPageClient } from "@/components/agent/AgentPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function AgentPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="Agentを読み込み中です" description="依頼と実行状況を確認しています..." />}>
      <AgentPageClient />
    </Suspense>
  );
}
