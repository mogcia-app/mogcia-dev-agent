export type SystemMapCellStatus = "not_started" | "considering" | "in_progress" | "reviewing" | "confirmed" | "on_hold";

export interface SystemMap {
  id: string;
  projectId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemMapCell {
  id: string;
  mapId: string;
  title: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: SystemMapCellStatus | null;
  tags: string[];
  includeInProgress: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemMapBundle { maps: SystemMap[]; cells: SystemMapCell[]; }
