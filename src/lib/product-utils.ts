import { Timestamp } from "firebase/firestore";
import type { Product, ProductSalesPlaybookEntry, ProductSalesPlaybooks, ProductStatus, ProductTab, ProductType } from "@/types/product";

export const productTabs: Array<{ value: ProductTab; label: string; aiPurpose: string }> = [
  { value: "basic", label: "基本情報", aiPurpose: "AIが商材概要、提供価値、解決できる課題を理解するための参照情報" },
  { value: "target", label: "ターゲット", aiPurpose: "AIが提案すべき顧客、向き不向き、決裁者像を判断するための参照情報" },
  { value: "pricing", label: "料金・契約", aiPurpose: "AIが見積・契約条件・費用面の反論対応を作るための参照情報" },
  { value: "features", label: "機能", aiPurpose: "AIが顧客課題に対して使う機能やオプションを選ぶための参照情報" },
  { value: "implementation", label: "反論想定", aiPurpose: "AIが料金・効果・運用負担などの反論に対して回答例と避ける表現を選ぶための参照情報" },
  { value: "sales", label: "営業設定", aiPurpose: "AIが商談時間、受注期間、反論カテゴリ、失注理由を判断するための共通参照情報" },
  { value: "new", label: "新規", aiPurpose: "AIが新規顧客への提案方針、ヒアリング、トーク、必要資料を作るための参照情報" },
  { value: "existing", label: "既存", aiPurpose: "AIが成約後・既存顧客への進め方、追加提案、運用フォローを作るための参照情報" },
  { value: "resources", label: "資料・デモ", aiPurpose: "AIが次に送る資料、提案書、事例、デモ候補を選ぶための参照情報" },
  { value: "history", label: "変更履歴", aiPurpose: "AI参照情報の更新経緯を確認するための履歴" }
];

export const productStatusLabels: Record<ProductStatus, string> = {
  active: "公開中",
  draft: "準備中",
  paused: "停止中",
  archived: "アーカイブ"
};

export const productTypeLabels: Record<ProductType, string> = {
  own_product: "自社プロダクト",
  operation_service: "運用代行",
  web_production: "Web制作",
  custom_development: "受託開発",
  sales_package: "提案パッケージ",
  other: "その他"
};

export function createDefaultSalesPlaybookEntry(): ProductSalesPlaybookEntry {
  return {
    proposalDirection: "",
    process: "",
    keyQuestions: [],
    talkScript: "",
    materials: [],
    cautions: []
  };
}

export function createDefaultSalesPlaybooks(): ProductSalesPlaybooks {
  return {
    teleapo: {
      new: createDefaultSalesPlaybookEntry(),
      existing: createDefaultSalesPlaybookEntry()
    },
    meeting: {
      new: createDefaultSalesPlaybookEntry(),
      existing: createDefaultSalesPlaybookEntry()
    }
  };
}

export function createDefaultProduct(user: { id: string; name: string }, input: Pick<Product, "name" | "displayName" | "categoryNames" | "productType" | "tagline" | "status">): Omit<Product, "id"> {
  const now = Timestamp.now();
  return {
    ...input,
    displayName: input.displayName || input.name,
    iconUrl: null,
    iconStoragePath: null,
    slug: slugify(input.name),
    categoryIds: input.categoryNames.map(slugify),
    summary: "",
    values: [],
    problems: [],
    target: {
      industries: [],
      companySizes: [],
      facilitySizes: [],
      roles: [],
      decisionMakerRoles: [],
      suitableConditions: [],
      unsuitableConditions: [],
      requiredConditions: [],
      disqualificationConditions: []
    },
    pricing: {
      displayType: "estimate",
      initialFee: null,
      monthlyFee: null,
      minimumFee: null,
      maximumFee: null,
      plans: [],
      options: [],
      minimumContractMonths: null,
      paymentTerms: "",
      renewalTerms: "",
      cancellationTerms: "",
      cost: null,
      grossMarginRate: null,
      notes: ""
    },
    features: [],
    implementation: {
      estimatedDays: null,
      flowSteps: [],
      initialSetup: [],
      clientRequirements: [],
      mogciaResponsibilities: [],
      supportDetails: [],
      deliverables: [],
      operationFlow: [],
      notes: []
    },
    objectionHandbook: [],
    salesSettings: {
      targetMonthlyDeals: null,
      defaultPlanId: null,
      expectedMeetingMinutes: null,
      expectedSalesCycleDays: null,
      salesStages: ["初回接触", "ヒアリング", "提案", "見積", "クロージング"],
      objectionCategories: ["料金", "効果", "必要性", "既存サービス", "時期"],
      lossReasonCategories: ["料金", "時期", "決裁者不在", "競合導入済み", "連絡不通"],
      leadTemperatureOptions: ["high", "middle", "low"],
      disqualificationConditions: [],
      requiredHearingItems: [],
      salesPlaybooks: createDefaultSalesPlaybooks(),
      notes: []
    },
    resources: [],
    ownerId: user.id,
    ownerName: user.name,
    sortOrder: Date.now(),
    favoriteUserIds: [],
    createdBy: user.id,
    createdByName: user.name,
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9ぁ-んァ-ヶ一-龠ー-]/g, "");
}

export function toLines(value?: string[]): string {
  return (value ?? []).join("\n");
}

export function fromLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function yen(value?: number | null): string {
  return typeof value === "number" ? `${value.toLocaleString("ja-JP")}円` : "未設定";
}
