import type { ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
};
