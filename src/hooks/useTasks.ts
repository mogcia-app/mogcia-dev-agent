"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ADMIN_UID, isAdminUser } from "@/lib/task-utils";
import { createTask, deleteTask, duplicateTask, setTaskCompleted, subscribeTasks, updateTask } from "@/lib/tasks";
import type { MemberOption, Task, TaskDraft } from "@/types/task";

function getUserName(user: User): string {
  return user.displayName || user.email?.split("@")[0] || "ログインユーザー";
}

export function useTasks() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      window.setTimeout(() => {
        setLoading(false);
        setError("Firebaseが未設定です。");
      }, 0);
      return undefined;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    window.setTimeout(() => setLoading(true), 0);
    return subscribeTasks(
      (nextTasks) => {
        setTasks(nextTasks);
        setError(null);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
  }, [user]);

  const currentMember = useMemo<MemberOption & { uid: string }>(() => {
    if (!user) return { id: "", uid: "", name: "ログインユーザー" };
    return { id: user.uid, uid: user.uid, name: getUserName(user) };
  }, [user]);

  const members = useMemo<MemberOption[]>(() => {
    const memberMap = new Map<string, string>();
    if (user) memberMap.set(user.uid, getUserName(user));
    if (ADMIN_UID) memberMap.set(ADMIN_UID, "管理者");
    tasks.forEach((task) => {
      if (task.assigneeId) memberMap.set(task.assigneeId, task.assigneeName || task.assigneeId);
      if (task.createdBy) memberMap.set(task.createdBy, task.createdByName || task.createdBy);
    });
    return Array.from(memberMap, ([id, name]) => ({ id, name }));
  }, [tasks, user]);

  const canEditTask = useCallback(
    (task: Task) => isAdminUser(user?.uid) || task.assigneeId === user?.uid || task.createdBy === user?.uid,
    [user?.uid]
  );

  const canDeleteTask = useCallback(() => isAdminUser(user?.uid), [user?.uid]);

  return {
    user,
    tasks,
    members,
    currentMember,
    loading,
    error,
    isAdmin: isAdminUser(user?.uid),
    canEditTask,
    canDeleteTask,
    createTask: (draft: TaskDraft) => createTask(draft, currentMember),
    updateTask: (taskId: string, draft: TaskDraft) => updateTask(taskId, draft, currentMember),
    completeTask: setTaskCompleted,
    deleteTask,
    duplicateTask: (task: Task) => duplicateTask(task, currentMember)
  };
}
