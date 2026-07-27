import { Suspense } from "react";
import { ProductsPageClient } from "@/components/products/ProductsPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function ProductsPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="商材管理を読み込み中です" description="登録済みの商材情報を確認しています..." />}>
      <ProductsPageClient />
    </Suspense>
  );
}
