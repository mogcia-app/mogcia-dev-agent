import type { WebsiteAnalysis } from "./types";

export function createWebsiteAnalysis({ url, createdBy }: { url: string; createdBy: string }): WebsiteAnalysis {
  const normalizedUrl = url.trim();
  const hasHttps = normalizedUrl.startsWith("https://");
  const hasPath = new URL(normalizedUrl).pathname !== "/";
  const score = Math.max(58, 84 + (hasHttps ? 8 : -10) + (hasPath ? 2 : 0));

  return {
    id: `website-analysis-${crypto.randomUUID()}`,
    url: normalizedUrl,
    score: Math.min(score, 98),
    findings: [
      hasHttps ? "HTTPSで配信されているため、基本的な信頼性は担保されています。" : "HTTPS化を優先すると、信頼性とSEOの土台が整います。",
      "初回表示で、予約・問い合わせ・公式LINEなどの主要導線が見える状態にする必要があります。",
      "スマホ閲覧時に、CTA、営業時間、料金、アクセスが迷わず確認できる構成が重要です。"
    ],
    improvements: [
      "ファーストビューに主要CTAを固定表示する",
      "サービス別の導線を3つ以内に整理する",
      "Instagram/LINE/予約導線を同じセクションにまとめる",
      "改善版Demoをローカルで生成し、商談前にBefore/Afterで比較する"
    ],
    demoSuggestion: "改善Demoでは、ファーストビュー、予約導線、公式LINE導線、SNS流入導線を重点的に作成する。",
    createdAt: new Date().toISOString(),
    createdBy
  };
}
