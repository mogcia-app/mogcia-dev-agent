"use client";

import { useEffect, useState } from "react";
import { subscribeCompanies, subscribeMeetings, subscribeProjects } from "@/lib/workspace-records";
import type { CompanyOption, MeetingOption, ProjectOption } from "@/types/workspace-records";

export function useWorkspaceOptions() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = (nextError: Error) => setError(nextError.message);
    const unsubCompanies = subscribeCompanies(setCompanies, onError);
    const unsubProjects = subscribeProjects(setProjects, onError);
    const unsubMeetings = subscribeMeetings(setMeetings, onError);
    return () => {
      unsubCompanies();
      unsubProjects();
      unsubMeetings();
    };
  }, []);

  return { companies, projects, meetings, error };
}
