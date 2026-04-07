/**
 * Hook for centralized error handling
 * Integrates with ErrorBoundary and provides error logging/recovery
 * Mobile-friendly: Clear error messages, recovery suggestions
 */

import { useCallback, useRef } from 'react';

export interface AppError extends Error {
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  context?: Record<string, any>;
  timestamp?: number;
}

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorLog {
  error: AppError;
  severity: ErrorSeverity;
  timestamp: number;
  context?: Record<string, any>;
  recovered?: boolean;
}

interface UseErrorHandlerOptions {
  onError?: (error: AppError, severity: ErrorSeverity) => void;
  onRecovery?: (error: AppError) => void;
  enableLogging?: boolean;
  maxErrorLogs?: number;
  onCriticalError?: (error: AppError) => void;
}

/**
 * Main error handler hook - manages errors across app
 */
export const useErrorHandler = ({
  onError,
  onRecovery,
  enableLogging = true,
  maxErrorLogs = 50,
  onCriticalError,
}: UseErrorHandlerOptions = {}) => {
  const errorLogsRef = useRef<ErrorLog[]>([]);
  const errorCallbacksRef = useRef<Record<string, Function>>({});

  /**
   * Create user-friendly error message
   */
  const getUserFriendlyMessage = (error: AppError): string => {
    if (error.statusCode === 404) return 'Resource not found. Please try again.';
    if (error.statusCode === 401) return 'Session expired. Please log in again.';
    if (error.statusCode === 403) return 'You don\'t have permission to access this.';
    if (error.statusCode === 500) return 'Server error. Please try again later.';
    if (error.statusCode === 503) return 'Service unavailable. Please try again later.';

    if (error.code === 'NETWORK_ERROR') return 'Network error. Check your connection.';
    if (error.code === 'TIMEOUT_ERROR') return 'Request timed out. Please try again.';
    if (error.code === 'PARSE_ERROR') return 'Data error. Please try again.';

    return error.message || 'Something went wrong. Please try again.';
  };

  /**
   * Determine error severity
   */
  const getSeverity = (error: AppError): ErrorSeverity => {
    if (error.statusCode === 500 || error.statusCode === 503) return 'critical';
    if (error.statusCode === 401 || error.statusCode === 403) return 'warning';
    if (error.code === 'NETWORK_ERROR') return 'error';
    return 'info';
  };

  /**
   * Get recovery suggestion for user
   */
  const getRecoverySuggestion = (error: AppError): string => {
    if (error.statusCode === 404) return 'Try checking the URL or search for the resource.';
    if (error.statusCode === 401) return 'Login with your credentials.';
    if (error.statusCode === 403) return 'Contact support if you believe you should have access.';
    if (error.statusCode === 500) return 'Our team has been notified. Try again in a moment.';
    if (error.code === 'NETWORK_ERROR') return 'Check your internet connection and try again.';
    if (error.code === 'TIMEOUT_ERROR') return 'The request took too long. Try again with better connection.';
    return 'Try refreshing the page or clearing your browser cache.';
  };

  /**
   * Log error to local storage and console
   */
  const logError = useCallback(
    (error: AppError, severity: ErrorSeverity) => {
      const errorLog: ErrorLog = {
        error,
        severity,
        timestamp: Date.now(),
        context: error.context,
      };

      if (enableLogging) {
        errorLogsRef.current.push(errorLog);

        // Keep only recent errors
        if (errorLogsRef.current.length > maxErrorLogs) {
          errorLogsRef.current = errorLogsRef.current.slice(-maxErrorLogs);
        }

        // Console logging
        if (severity === 'critical') {
          console.error(`[${severity.toUpperCase()}] ${error.message}`, error);
        } else if (severity === 'error') {
          console.error(`[${severity.toUpperCase()}] ${error.message}`, error);
        } else if (severity === 'warning') {
          console.warn(`[${severity.toUpperCase()}] ${error.message}`, error);
        } else {
          console.info(`[${severity.toUpperCase()}] ${error.message}`, error);
        }

        // Store in localStorage for debugging (non-intrusive)
        try {
          localStorage.setItem(
            'mara_error_logs',
            JSON.stringify(errorLogsRef.current.map(log => ({
              message: log.error.message,
              code: log.error.code,
              severity: log.severity,
              timestamp: log.timestamp,
            })))
          );
        } catch (e) {
          // Storage quota exceeded - silent fail
        }
      }
    },
    [enableLogging, maxErrorLogs]
  );

  /**
   * Handle error with callbacks and logging
   */
  const handleError = useCallback(
    (
      error: Error | AppError | string,
      context?: Record<string, any>
    ): {
      message: string;
      suggestion: string;
      retryable: boolean;
      recover: () => void;
    } => {
      // Normalize error
      let appError: AppError;
      if (typeof error === 'string') {
        appError = new Error(error) as AppError;
      } else if (error instanceof Error) {
        appError = error as AppError;
      } else {
        appError = new Error('Unknown error occurred') as AppError;
      }

      appError.context = context || appError.context;
      appError.timestamp = Date.now();

      const severity = getSeverity(appError);
      logError(appError, severity);

      // Call global handler
      if (onError) {
        onError(appError, severity);
      }

      // Call critical handler if applicable
      if (severity === 'critical' && onCriticalError) {
        onCriticalError(appError);
      }

      // Get recovery info
      const userMessage = getUserFriendlyMessage(appError);
      const suggestion = getRecoverySuggestion(appError);
      const retryable = appError.retryable !== false && severity !== 'warning';

      // Return recovery object
      return {
        message: userMessage,
        suggestion,
        retryable,
        recover: () => {
          if (onRecovery) onRecovery(appError);
        },
      };
    },
    [logError, onError, onRecovery, onCriticalError]
  );

  /**
   * Wrap async function with error handling
   */
  const withErrorHandler = useCallback(
    async <T,>(
      asyncFn: () => Promise<T>,
      context?: Record<string, any>
    ): Promise<T | null> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error as Error, context);
        return null;
      }
    },
    [handleError]
  );

  /**
   * Register error callback (for specific error types)
   */
  const registerErrorCallback = useCallback(
    (errorCode: string, callback: (error: AppError) => void) => {
      errorCallbacksRef.current[errorCode] = callback;
    },
    []
  );

  /**
   * Clear all error logs
   */
  const clearErrorLogs = useCallback(() => {
    errorLogsRef.current = [];
    try {
      localStorage.removeItem('mara_error_logs');
    } catch (e) {
      // Silent fail
    }
  }, []);

  /**
   * Get error logs (for debugging/reporting)
   */
  const getErrorLogs = useCallback((): ErrorLog[] => {
    return [...errorLogsRef.current];
  }, []);

  /**
   * Export errors for reporting
   */
  const exportErrors = useCallback((): string => {
    return JSON.stringify(errorLogsRef.current, null, 2);
  }, []);

  return {
    handleError,
    withErrorHandler,
    registerErrorCallback,
    clearErrorLogs,
    getErrorLogs,
    exportErrors,
  };
};

/**
 * Hook for API error handling (integrates with useApi)
 */
export const useApiErrorHandler = () => {
  const errorHandler = useErrorHandler();

  return useCallback(
    (error: Error, endpoint: string) => {
      const appError = error as AppError;
      appError.code = appError.code || 'API_ERROR';

      return errorHandler.handleError(appError, {
        endpoint,
        type: 'api_error',
      });
    },
    [errorHandler]
  );
};

/**
 * Hook for debounced error notification
 * Prevents error spam in UI
 */
export const useDebouncedErrorNotification = (delayMs = 500) => {
  const timeoutRef = useRef<number | undefined>(undefined);
  const lastErrorRef = useRef<string | null>(null);

  return useCallback(
    (message: string, callback?: () => void) => {
      if (lastErrorRef.current === message) return; // Ignore duplicates

      lastErrorRef.current = message;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (callback) callback();

      timeoutRef.current = window.setTimeout(() => {
        lastErrorRef.current = null;
      }, delayMs);
    },
    [delayMs]
  );
};
