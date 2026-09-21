import type { Timestamp } from "firebase/firestore";

export type ProjectType = "client" | "product" | "internal";
export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  phase: string;
  companyId: string | null;
  companyName: string | null;
  productId: string | null;
  productName: string | null;
  description: string;
  startDate: Timestamp | null;
  targetDate: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export type ProjectDraft = {
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  phase: string;
  companyId: string;
  companyName: string;
  productId: string;
  productName: string;
  description: string;
  startDate: string;
  targetDate: string;
};
