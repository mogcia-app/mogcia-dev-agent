import type { MonthlyReport } from "./types";

export function createMonthlyReport({
  title,
  period,
  sourceText,
  createdBy
}: {
  title: string;
  period: string;
  sourceText: string;
  createdBy: string;
}): MonthlyReport {
  const trimmedSource = sourceText.trim();

  return {
    id: `monthly-report-${crypto.randomUUID()}`,
    title: title.trim() || "月次レポート",
    period: period.trim() || new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long" }),
    summary: trimmedSource
      ? `入力データをもとに、今月は「流入導線」「予約・問い合わせ」「継続接点」の改善余地を確認しました。`
      : "今月の定量データが未入力のため、営業・運用観点の仮説ベースで改善方針を作成しました。",
    nextActions: [
      "最も成果に近いCTAを1つ決め、ファーストビューに固定する",
      "LINE、予約、問い合わせの導線をスマホ基準で再確認する",
      "来月の改善Demoを1本作成し、商談または運用提案に使う"
    ],
    improvements: [
      "数値レポートだけで終わらせず、次に変える画面・導線まで明示する",
      "顧客に送る文章は下書きまでに留め、送信は人が確認する",
      "改善案はMOGCIAトンマナに合わせたDemoとして見せる"
    ],
    demoSuggestion: "来月は、CTA改善版のLP/HPセクションDemoを作成し、予約導線とLINE導線のBefore/Afterを比較する。",
    createdAt: new Date().toISOString(),
    createdBy
  };
}
