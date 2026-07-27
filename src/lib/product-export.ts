import type { Product } from "@/types/product";

export function exportProductsCsv(products: Product[]): void {
  const rows = [
    ["商材ID", "商材名", "商材種別", "初期費用", "月額費用", "商材責任者", "作成日", "最終更新日"],
    ...products.map((product) => [
      product.id,
      product.name,
      product.productType,
      String(product.pricing.initialFee ?? ""),
      String(product.pricing.monthlyFee ?? ""),
      product.ownerName ?? "",
      product.createdAt.toDate().toLocaleString("ja-JP"),
      product.updatedAt.toDate().toLocaleString("ja-JP")
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `products-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
