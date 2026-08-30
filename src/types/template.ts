import type { Timestamp } from "firebase/firestore";

export type TemplateCategory = "email" | "phone" | "meeting" | "proposal" | "hearing" | "line_sns" | "internal" | "other";

export interface BusinessTemplate {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  scene: string;
  content: string;
  favorite: boolean;
  usageCount: number;
  lastUsedAt?: Timestamp | null;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BusinessTemplateDraft {
  title: string;
  description: string;
  category: TemplateCategory;
  scene: string;
  content: string;
  favorite: boolean;
}

export type TemplateRelatedTarget = {
  source: "lead" | "company";
  id: string;
  name: string;
  contactName?: string;
  status?: string;
  productId?: string | null;
  productName?: string | null;
};

export type GeneratedTemplateContent = {
  subject: string;
  body: string;
};
