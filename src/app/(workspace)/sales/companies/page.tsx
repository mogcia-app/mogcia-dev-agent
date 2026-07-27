import { Suspense } from "react";
import { CompaniesPageClient } from "@/components/companies/CompaniesPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function CompaniesPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="会社一覧を読み込み中です" description="取引先情報を確認しています..." />}>
      <CompaniesPageClient />
    </Suspense>
  );
}
