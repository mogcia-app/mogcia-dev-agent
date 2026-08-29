import { PageHeader } from "@/components/page-header";
import type { ReactNode } from "react";

export function CalendarPageHeader({ actions }: { actions?: ReactNode }) {
  return (
    <PageHeader
      title="カレンダー"
      description="予定の分布と毎日のスケジュールを月単位で確認できます。"
      actions={actions}
    />
  );
}
