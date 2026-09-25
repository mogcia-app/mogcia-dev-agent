import type { SystemMapCell, SystemMapCellStatus } from "@/types/system-map";

export const mapStatusLabels: Record<SystemMapCellStatus, string> = {
  not_started: "未着手", considering: "検討中", in_progress: "進行中",
  reviewing: "確認中", confirmed: "確定", on_hold: "保留"
};
export const mapStatusOptions = Object.entries(mapStatusLabels) as Array<[SystemMapCellStatus, string]>;
const progressValues: Record<SystemMapCellStatus, number> = { not_started: 0, considering: 20, in_progress: 55, reviewing: 80, confirmed: 100, on_hold: 0 };

export function calculateMapProgress(cells: SystemMapCell[]): number | null {
  const targets = cells.filter((cell) => cell.includeInProgress && cell.status && cell.status !== "on_hold");
  if (!targets.length) return null;
  return Math.round(targets.reduce((total, cell) => total + progressValues[cell.status!], 0) / targets.length);
}
