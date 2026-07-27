import type { Company } from "@/types/company";

export function exportCompaniesCsv(companies: Company[]): void {
  const rows = [
    ["会社ID", "会社名", "会社名カナ", "業種", "所在地", "先方担当者", "Webサイト", "社内担当者", "同行者", "最終接触日", "更新日"],
    ...companies.map((company) => [
      company.id,
      company.name,
      company.nameKana ?? "",
      company.industry ?? "",
      company.address ?? "",
      formatContactsForCsv(company),
      company.website ?? "",
      company.internalOwnerName ?? "",
      company.companionNames?.join(" / ") ?? "",
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

function formatContactsForCsv(company: Company): string {
  const contacts = company.contacts?.length ? company.contacts : [{ id: "primary", name: company.primaryContactName ?? "", email: company.email ?? "", phone: company.phone ?? "" }];
  return contacts
    .map((contact) => [contact.name, contact.email, contact.phone].filter(Boolean).join(" / "))
    .filter(Boolean)
    .join("\n");
}
