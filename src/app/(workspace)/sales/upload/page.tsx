import { Suspense } from "react";
import { SalesUploadWorkspace } from "@/components/sales/SalesUploadWorkspace";
import { LoadingCard } from "@/components/ui/loading";

export default function UploadPage() {
  return (
    <Suspense fallback={<LoadingCard compact title="アップロード画面を読み込み中です" description="音声とAI処理の準備をしています..." />}>
      <SalesUploadWorkspace />
    </Suspense>
  );
}
