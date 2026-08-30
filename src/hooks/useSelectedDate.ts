"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { toDateKey } from "@/lib/calendar-utils";
import type { CalendarViewMode } from "@/types/calendar";

export function useSelectedDate(): {
  selectedDate: Date;
  selectedDateKey: string;
  view: CalendarViewMode;
  member: string;
  setSelectedDate: (date: Date) => void;
  setView: (nextView: CalendarViewMode) => void;
  setMember: (nextMember: string) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selectedDate, setSelectedDateState] = useState(() => new Date());
  const view: CalendarViewMode = params.get("view") === "list" ? "list" : "timeline";
  const member = params.get("member") ?? "all";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("date");
    if ((key === "view" && value === "timeline") || (key === "member" && value === "all")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}` as Route, { scroll: false });
  };

  return {
    selectedDate,
    selectedDateKey: toDateKey(selectedDate),
    view,
    member,
    setSelectedDate: (date: Date) => {
      setSelectedDateState(date);
      const next = new URLSearchParams(params.toString());
      next.delete("date");
      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}` as Route, { scroll: false });
    },
    setView: (nextView: CalendarViewMode) => setParam("view", nextView),
    setMember: (nextMember: string) => setParam("member", nextMember)
  };
}
