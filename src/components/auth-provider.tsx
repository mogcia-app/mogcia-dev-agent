"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { getUserRole, isIshidaAccount } from "@/domain/rules";
import type { UserRole } from "@/domain/types";

interface AuthContextValue {
  firebaseConfigured: boolean;
  loading: boolean;
  user: User | null;
  role: UserRole;
  isIshida: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createUserWithEmail: (email: string, password: string) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const firebaseConfigured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseConfigured,
      loading,
      user,
      role: getUserRole(user?.email),
      isIshida: isIshidaAccount(user?.email),
      async signInWithGoogle() {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      async signInWithEmail(email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        await signInWithEmailAndPassword(auth, email, password);
      },
      async createUserWithEmail(email, password) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured.");
        await createUserWithEmailAndPassword(auth, email, password);
      },
      async getIdToken() {
        const auth = getFirebaseAuth();
        return auth?.currentUser ? auth.currentUser.getIdToken() : null;
      },
      async signOutUser() {
        const auth = getFirebaseAuth();
        if (!auth) return;
        await signOut(auth);
      }
    }),
    [firebaseConfigured, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
