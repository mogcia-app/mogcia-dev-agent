import { Suspense } from "react";
import { KnowledgePageClient } from "@/components/knowledge/KnowledgePageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function KnowledgePage() {
  return (
    <Suspense fallback={<LoadingCard compact title="ナレッジを読み込み中です" description="営業ナレッジを整理しています..." />}>
      <KnowledgePageClient />
    </Suspense>
  );
}
