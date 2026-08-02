"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { addProductMemo, archiveProduct, createProduct, deleteProduct, deleteProductMemo, duplicateProduct, reorderProducts, subscribeProductMemos, subscribeProductsMaster, toggleFavorite, updateProduct } from "@/lib/products";
import { isAdminUser } from "@/lib/task-utils";
import { getUserDisplayName } from "@/lib/user-display";
import type { Product, ProductMemo, ProductTab } from "@/types/product";

export function useProducts(selectedProductId?: string | null) {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [memoState, setMemoState] = useState<{ productId: string; memos: ProductMemo[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeProductsMaster(
      (nextProducts) => {
        setProducts(nextProducts);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!selectedProductId) return undefined;
    return subscribeProductMemos(
      selectedProductId,
      (nextMemos) => setMemoState({ productId: selectedProductId, memos: nextMemos }),
      (nextError) => setError(nextError.message)
    );
  }, [selectedProductId]);

  const currentUser = useMemo(() => ({ id: user?.uid ?? "", name: getUserDisplayName(user) }), [user]);
  const isAdmin = isAdminUser(user?.uid);
  const canEdit = Boolean(user);
  const selectedMemos = memoState && memoState.productId === selectedProductId ? memoState.memos : [];

  return {
    user,
    products,
    memos: selectedMemos,
    loading,
    error,
    currentUser,
    isAdmin,
    canEdit,
    createProduct: (input: Parameters<typeof createProduct>[1]) => createProduct(currentUser, input),
    updateProduct: (productId: string, tab: ProductTab, patch: Partial<Product>) => updateProduct(productId, currentUser, tab, patch),
    addMemo: (productId: string, input: Parameters<typeof addProductMemo>[2]) => addProductMemo(productId, currentUser, input),
    deleteMemo: (productId: string, memoId: string) => deleteProductMemo(productId, memoId, currentUser),
    duplicateProduct: (product: Product) => duplicateProduct(product, currentUser),
    archiveProduct: (productId: string) => archiveProduct(productId, currentUser),
    deleteProduct,
    reorderProducts,
    toggleFavorite: (product: Product) => (user ? toggleFavorite(product, user.uid) : Promise.resolve())
  };
}
