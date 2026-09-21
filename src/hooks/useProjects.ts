"use client";

import { useEffect, useState } from "react";
import { subscribeProjectRecords } from "@/lib/projects";
import type { Project } from "@/types/project";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => subscribeProjectRecords((next) => { setProjects(next); setLoading(false); }, (next) => { setError(next.message); setLoading(false); }), []);
  return { projects, loading, error };
}
