import { Timestamp } from "firebase/firestore";
import type { Product, ProductSalesPlaybookEntry, ProductSalesPlaybooks, ProductStatus, ProductTab, ProductType } from "@/types/product";

export const productTabs: Array<{ value: ProductTab; label: string }> = [
  { value: "basic", label: "概要" },
  { value: "target", label: "ターゲット" },
  { value: "new", label: "新規提案" },
  { value: "existing", label: "継続・追加提案" },
  { value: "implementation", label: "反論・切り返し" },
  { value: "sales", label: "営業設定" },
  { value: "pricing", label: "料金・契約" },
  { value: "features", label: "機能" },
  { value: "insights", label: "商談インサイト" },
  { value: "resources", label: "資料" },
  { value: "notes", label: "設定・メモ" }
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
      regions: [],
      companySizes: [],
      facilitySizes: [],
      roles: [],
      decisionMakerRoles: [],
      suitableConditions: [],
      unsuitableConditions: [],
      requiredConditions: [],
      disqualificationConditions: [],
      idealCustomerConditions: [],
      lowPotentialConditions: [],
      winningPatterns: [],
      losingPatterns: [],
      effectivePhrases: [],
      avoidPhrases: [],
      industryProposalAngles: []
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
