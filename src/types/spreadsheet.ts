import type { Timestamp } from "firebase/firestore";

export type WorkspaceSpreadsheet = {
  id: string;
  name: string;
  month: string;
  originalFileName: string;
  url: string;
  storagePath: string;
  size: number;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
