import { knowledgeTypeLabels, visibilityLabels } from "@/lib/knowledge-utils";
import type { Knowledge } from "@/types/knowledge";

export function exportKnowledgeCsv(items: Knowledge[]): void {
  const rows = [
    ["ナレッジID", "タイトル", "種類", "概要", "関連商材", "関連会社", "関連案件", "タグ", "作成元", "作成者", "作成日", "更新日", "公開範囲"],
    ...items.map((item) => [
      item.id,
      item.title,
      knowledgeTypeLabels[item.type],
      item.summary ?? "",
      item.productNames?.join(" / ") ?? "",
      item.companyName ?? "",
      item.projectName ?? "",
      item.tags.join(" / "),
      item.source,
      item.createdByName ?? "",
      item.createdAt.toDate().toLocaleString("ja-JP"),
      item.updatedAt.toDate().toLocaleString("ja-JP"),
      visibilityLabels[item.visibility]
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `knowledge-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
