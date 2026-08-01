"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { addCompanyLog, addCompanyMemo, addManualMeeting, createCompany, deleteCompany, deleteCompanyMemo, subscribeCompaniesMaster, subscribeCompanyActivityLogs, subscribeCompanyFiles, subscribeCompanyMeetings, subscribeCompanyMemos, toggleCompanyFavorite, updateCompany, uploadCompanyFile } from "@/lib/companies";
import { isAdminUser } from "@/lib/task-utils";
import { subscribeTasks } from "@/lib/tasks";
import { getUserDisplayName } from "@/lib/user-display";
import type { Company, CompanyActivityLog, CompanyFile, CompanyMeeting, CompanyMemo } from "@/types/company";
import type { Task } from "@/types/task";

export function useCompanies(selectedCompanyId?: string | null, logLimit = 30) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [logs, setLogs] = useState<CompanyActivityLog[]>([]);
  const [meetings, setMeetings] = useState<CompanyMeeting[]>([]);
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [memos, setMemos] = useState<CompanyMemo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeCompaniesMaster((next) => { setCompanies(next); setLoading(false); }, (nextError) => { setError(nextError.message); setLoading(false); });
  }, [user]);

  useEffect(() => {
    if (!selectedCompanyId) return undefined;
    const onError = (nextError: Error) => setError(nextError.message);
    const unsubLogs = subscribeCompanyActivityLogs(selectedCompanyId, logLimit, setLogs, onError);
    const unsubMeetings = subscribeCompanyMeetings(selectedCompanyId, setMeetings, onError);
    const unsubFiles = subscribeCompanyFiles(selectedCompanyId, setFiles, onError);
    const unsubMemos = subscribeCompanyMemos(selectedCompanyId, setMemos, onError);
    const unsubTasks = subscribeTasks((nextTasks) => setTasks(nextTasks.filter((task) => task.companyId === selectedCompanyId)), onError);
    return () => {
      unsubLogs();
      unsubMeetings();
      unsubFiles();
      unsubMemos();
      unsubTasks();
    };
  }, [logLimit, selectedCompanyId]);

  const currentUser = useMemo(() => ({ id: user?.uid ?? "", name: getUserDisplayName(user) }), [user]);
  const isAdmin = isAdminUser(user?.uid);

  return {
    user,
    currentUser,
    isAdmin,
    companies,
    logs,
    meetings,
    files,
    memos,
    tasks,
    loading,
    error,
    createCompany: (patch: Partial<Company>) => createCompany(currentUser, patch),
    updateCompany: (companyId: string, patch: Partial<Company>) => updateCompany(companyId, currentUser, patch),
    toggleFavorite: (company: Company) => (user ? toggleCompanyFavorite(company, user.uid) : Promise.resolve()),
    addLog: (companyId: string, input: Parameters<typeof addCompanyLog>[2]) => addCompanyLog(companyId, currentUser, input),
    addMeeting: (company: Company, input: Parameters<typeof addManualMeeting>[2]) => addManualMeeting(company, currentUser, input),
    addMemo: (companyId: string, input: Parameters<typeof addCompanyMemo>[2]) => addCompanyMemo(companyId, currentUser, input),
    deleteMemo: deleteCompanyMemo,
    uploadFile: (companyId: string, file: File, onProgress: (progress: number) => void) => uploadCompanyFile(companyId, currentUser, file, onProgress),
    deleteCompany
  };
}
