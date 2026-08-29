import { Suspense } from "react";
import { LeadsPageClient } from "@/components/leads/LeadsPageClient";
import { LoadingCard } from "@/components/ui/loading";

export default function LeadsPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="営業リストを読み込み中です" description="営業活動と次回対応を確認しています..." />}>
      <LeadsPageClient />
    </Suspense>
  );
}
