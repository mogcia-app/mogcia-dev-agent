import { Suspense } from "react";
import { SalesAnalysisListPageClient } from "@/components/sales/SalesAnalysisListPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function SalesAnalysisPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="分析済み一覧を読み込み中です" description="保存済みの分析データを確認しています..." />}>
      <SalesAnalysisListPageClient />
    </Suspense>
  );
}
