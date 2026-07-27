"use client";

import { useState } from "react";
import { defaultCalendarFilters, filterCalendarItems } from "@/lib/calendar-utils";
import type { CalendarFilters, CalendarItem } from "@/types/calendar";

const storageKey = "mogcia-calendar-filters";

export function useCalendarFilters(items: CalendarItem[], currentUserId: string, memberId: string) {
  const [filters, setFilters] = useState<CalendarFilters>(() => {
    if (typeof window === "undefined") return defaultCalendarFilters;
    const saved = window.localStorage.getItem(storageKey);
    return saved ? { ...defaultCalendarFilters, ...JSON.parse(saved) } : defaultCalendarFilters;
  });

  const updateFilter = (key: keyof CalendarFilters, value: boolean) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  return {
    filters,
    updateFilter,
    filteredItems: filterCalendarItems(items, filters, currentUserId, memberId)
  };
}
