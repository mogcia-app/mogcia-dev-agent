import { companyStatusLabels, customerRankLabels } from "@/lib/company-utils";
import type { Company } from "@/types/company";

export function exportCompaniesCsv(companies: Company[]): void {
  const rows = [
    ["会社ID", "会社名", "会社名カナ", "業種", "所在地", "電話番号", "メール", "Webサイト", "顧客ランク", "ステータス", "担当者", "最終接触日", "更新日"],
    ...companies.map((company) => [
      company.id,
      company.name,
      company.nameKana ?? "",
      company.industry ?? "",
      company.address ?? "",
      company.phone ?? "",
      company.email ?? "",
      company.website ?? "",
      company.customerRank ? customerRankLabels[company.customerRank] : "",
      companyStatusLabels[company.status],
      company.internalOwnerName ?? "",
      company.lastContactAt?.toDate().toLocaleString("ja-JP") ?? "",
      company.updatedAt.toDate().toLocaleString("ja-JP")
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `companies-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
