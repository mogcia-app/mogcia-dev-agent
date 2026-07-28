import type { Timestamp } from "firebase/firestore";

export type ProductStatus = "active" | "draft" | "paused" | "archived";
export type ProductType = "own_product" | "operation_service" | "web_production" | "custom_development" | "sales_package" | "other";
export type ProductTab = "basic" | "target" | "pricing" | "features" | "implementation" | "sales" | "new" | "existing" | "resources";

export interface ProductPlan {
  id: string;
  name: string;
  description?: string;
  initialFee?: number | null;
  monthlyFee?: number | null;
  oneTimeFee?: number | null;
  features: string[];
  recommended: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ProductFeature {
  id: string;
  name: string;
  description?: string;
  category?: string;
  planIds: string[];
  type: "standard" | "option";
  isPublic: boolean;
  sortOrder: number;
}

export interface ProductFlowStep {
  id: string;
  title: string;
  description?: string;
  owner: "mogcia" | "client" | "both";
  estimatedDays?: number | null;
  sortOrder: number;
}

export interface ProductObjectionItem {
  id: string;
  category: string;
  objection: string;
  responseExample: string;
  howToTell?: string;
  avoidPhrases?: string[];
  sortOrder: number;
}

export interface ProductHearingItem {
  id: string;
  label: string;
  description?: string;
  inputType: "text" | "number" | "currency" | "percentage" | "date" | "single_select" | "multi_select" | "boolean";
  required: boolean;
  options?: string[];
  analysisKey?: string;
  sortOrder: number;
}

export type ProductSalesScene = "teleapo" | "meeting";
export type ProductCustomerSegment = "new" | "existing";

export interface ProductSalesPlaybookEntry {
  proposalDirection: string;
  process: string;
  keyQuestions: string[];
  talkScript: string;
  materials: string[];
  cautions: string[];
}

export type ProductSalesPlaybooks = Record<ProductSalesScene, Record<ProductCustomerSegment, ProductSalesPlaybookEntry>>;

export interface ProductResource {
  id: string;
  title: string;
  type: "proposal" | "pricing" | "service_document" | "demo" | "website" | "simulation" | "case_document" | "contract_template" | "other";
  url?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  description?: string;
  visibility: "internal" | "sales" | "client_shareable" | "public";
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  id: string;
  name: string;
  displayName: string;
  iconUrl?: string | null;
  iconStoragePath?: string | null;
  slug: string;
  categoryIds: string[];
  categoryNames: string[];
  productType: ProductType;
  tagline: string;
  summary: string;
  values: string[];
  problems: string[];
  target: {
    industries: string[];
    regions: string[];
    companySizes: string[];
    facilitySizes: string[];
    roles: string[];
    decisionMakerRoles: string[];
    suitableConditions: string[];
    unsuitableConditions: string[];
    requiredConditions: string[];
    disqualificationConditions: string[];
    idealCustomerConditions: string[];
    lowPotentialConditions: string[];
    winningPatterns: string[];
    losingPatterns: string[];
    effectivePhrases: string[];
    avoidPhrases: string[];
    industryProposalAngles: Array<{ id: string; industry: string; proposalAngle: string; cautions?: string }>;
  };
  pricing: {
    displayType: "fixed" | "from" | "range" | "estimate" | "hidden";
    initialFee?: number | null;
    monthlyFee?: number | null;
    minimumFee?: number | null;
    maximumFee?: number | null;
    plans: ProductPlan[];
    options: Array<{ id: string; name: string; description?: string; fee?: number | null; feeType?: "monthly" | "one_time" | "estimate"; isActive: boolean; sortOrder: number }>;
    minimumContractMonths?: number | null;
    paymentTerms?: string;
    renewalTerms?: string;
    cancellationTerms?: string;
    cost?: number | null;
    grossMarginRate?: number | null;
    notes?: string;
  };
  features: ProductFeature[];
  implementation: {
    estimatedDays?: number | null;
    flowSteps: ProductFlowStep[];
    initialSetup?: string[];
    clientRequirements?: string[];
    mogciaResponsibilities?: string[];
    supportDetails?: string[];
    deliverables?: string[];
    operationFlow?: string[];
    notes?: string[];
  };
  objectionHandbook: ProductObjectionItem[];
  salesSettings: {
    targetMonthlyDeals?: number | null;
    defaultPlanId?: string | null;
    expectedMeetingMinutes?: number | null;
    expectedSalesCycleDays?: number | null;
    salesStages: string[];
    objectionCategories: string[];
    lossReasonCategories: string[];
    leadTemperatureOptions: string[];
    disqualificationConditions: string[];
    requiredHearingItems: ProductHearingItem[];
    salesPlaybooks: ProductSalesPlaybooks;
    notes?: string[];
  };
  resources: ProductResource[];
  ownerId: string;
  ownerName?: string;
  status: ProductStatus;
  sortOrder: number;
  favoriteUserIds: string[];
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
}

export interface ProductChangeLog {
  id: string;
  actorId: string;
  actorName?: string;
  targetTab: ProductTab;
  action: string;
  createdAt: Timestamp;
}
