"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { archiveKnowledge, createKnowledge, deleteKnowledge, duplicateKnowledge, incrementKnowledgeView, subscribeKnowledge, toggleKnowledgeFavorite, updateKnowledge } from "@/lib/knowledge";
import { isAdminUser } from "@/lib/task-utils";
import { getUserDisplayName } from "@/lib/user-display";
import type { Knowledge, KnowledgeDraft } from "@/types/knowledge";

export function useKnowledgeList() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeKnowledge(
      (nextItems) => {
        setItems(nextItems);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
  }, [user]);

  const currentUser = useMemo(() => ({ id: user?.uid ?? "", name: getUserDisplayName(user) }), [user]);
  const isAdmin = isAdminUser(user?.uid);
  const visibleItems = useMemo(() => items.filter((item) => isAdmin || item.visibility !== "admin").filter((item) => item.visibility !== "private" || item.createdBy === user?.uid), [isAdmin, items, user?.uid]);

  return {
    user,
    currentUser,
    isAdmin,
    items: visibleItems,
    loading,
    error,
    createKnowledge: (draft: KnowledgeDraft) => createKnowledge(draft, currentUser),
    updateKnowledge: (id: string, draft: KnowledgeDraft) => updateKnowledge(id, draft, currentUser),
    duplicateKnowledge: (item: Knowledge) => duplicateKnowledge(item, currentUser),
    archiveKnowledge,
    deleteKnowledge,
    toggleFavorite: (item: Knowledge) => (user ? toggleKnowledgeFavorite(item, user.uid) : Promise.resolve()),
    incrementView: (id: string) => (user ? incrementKnowledgeView(id, user.uid) : Promise.resolve())
  };
}
