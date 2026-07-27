"use client";

import { useCallback, useState } from "react";

export type LoadingState = {
  isLoading: boolean;
  message: string;
  progress?: number;
};

export function useLoading(initialMessage = "") {
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    message: initialMessage
  });

  const startLoading = useCallback((message = initialMessage, progress?: number) => {
    setState({ isLoading: true, message, progress });
  }, [initialMessage]);

  const stopLoading = useCallback(() => {
    setState((current) => ({ ...current, isLoading: false, progress: undefined }));
  }, []);

  const updateLoading = useCallback((message: string, progress?: number) => {
    setState((current) => ({ ...current, message, progress }));
  }, []);

  return {
    ...state,
    startLoading,
    stopLoading,
    updateLoading
  };
}
