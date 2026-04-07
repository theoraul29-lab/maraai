import { useState, useCallback } from 'react';

interface UseApiOptions {
  timeout?: number; // milliseconds
  retries?: number;
  backoffMultiplier?: number;
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
}

interface ApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (url: string, options?: RequestInit) => Promise<T>;
}

/**
 * Hook for making API calls with automatic retry, timeout, and error handling
 * Mobile-friendly: Single execution function, no refs needed
 */
export const useApi = <T = any>(options: UseApiOptions = {}): ApiResponse<T> => {
  const {
    timeout = 15000, // 15 seconds default
    retries = 3,
    backoffMultiplier = 2,
    onError,
    onSuccess,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (url: string, fetchOptions: RequestInit = {}): Promise<T> => {
      setLoading(true);
      setError(null);
      let lastError: Error | null = null;

      // Retry loop
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`
            );
          }

          const result: T = await response.json();
          setData(result);
          setLoading(false);
          onSuccess?.(result);
          return result;
        } catch (err) {
          lastError =
            err instanceof Error ? err : new Error(String(err) || 'Unknown error');

          // Log retry attempts
          if (attempt < retries) {
            const delay = Math.pow(backoffMultiplier, attempt) * 1000;
            console.warn(
              `API call failed (attempt ${attempt + 1}/${retries + 1}). Retrying in ${delay}ms...`,
              lastError.message
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      setError(lastError);
      setLoading(false);
      onError?.(lastError || new Error('Unknown error'));
      throw lastError;
    },
    [timeout, retries, backoffMultiplier, onError, onSuccess]
  );

  return {
    data,
    loading,
    error,
    execute,
  };
};

/**
 * Helper function to make direct API calls with retry logic
 * Useful for one-off calls outside of React components
 */
export const apiCall = async <T = any>(
  url: string,
  options: RequestInit & UseApiOptions = {}
): Promise<T> => {
  const {
    timeout = 15000,
    retries = 3,
    backoffMultiplier = 2,
    ...fetchOptions
  } = options as any;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`
        );
      }

      return await response.json();
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error(String(err) || 'Unknown error');

      if (attempt < retries) {
        const delay = Math.pow(backoffMultiplier, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('API call failed');
};
