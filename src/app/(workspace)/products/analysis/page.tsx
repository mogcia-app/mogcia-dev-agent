import { Suspense } from "react";
import { ProductAnalysisPageClient } from "@/components/products/ProductAnalysisPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function ProductAnalysisPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="商材分析を読み込み中です" description="AI参照用の商材情報を確認しています..." />}>
      <ProductAnalysisPageClient />
    </Suspense>
  );
}
