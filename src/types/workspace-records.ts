export interface WorkspaceOption {
  id: string;
  name: string;
}

export interface CompanyOption extends WorkspaceOption {
  industry?: string;
}

export interface ProductOption extends WorkspaceOption {
  tagline?: string;
}

export interface ProjectOption extends WorkspaceOption {
  companyId?: string | null;
  companyName?: string | null;
}

export interface MeetingOption extends WorkspaceOption {
  companyId?: string | null;
  companyName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}
