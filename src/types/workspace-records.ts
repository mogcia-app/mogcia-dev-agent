export interface WorkspaceOption {
  id: string;
  name: string;
}

export interface CompanyOption extends WorkspaceOption {
  industry?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  status?: string;
  nextActionAt?: import("firebase/firestore").Timestamp | null;
  nextActionTitle?: string | null;
}

export interface ProductOption extends WorkspaceOption {
  tagline?: string;
}

export interface LeadOption extends WorkspaceOption {
  contactName?: string;
  phone?: string;
  email?: string;
  status?: string;
  productId?: string | null;
  productName?: string | null;
  convertedCompanyId?: string | null;
  nextActionAt?: import("firebase/firestore").Timestamp | null;
  nextActionTitle?: string | null;
}

export interface ProjectOption extends WorkspaceOption {
  companyId?: string | null;
  companyName?: string | null;
  productId?: string | null;
  productName?: string | null;
  type?: "client" | "product" | "internal";
  status?: "planning" | "active" | "paused" | "completed" | "archived";
  phase?: string;
  targetDate?: import("firebase/firestore").Timestamp | null;
}

export interface MeetingOption extends WorkspaceOption {
  companyId?: string | null;
  companyName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}
