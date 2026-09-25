import { Suspense } from "react";
import { AgentPageClient } from "@/components/agent/AgentPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function AgentPage() { return <Suspense fallback={<LoadingCard compact title="Agentを読み込み中です" description="開発依頼と実行履歴を確認しています…" />}><AgentPageClient /></Suspense>; }
