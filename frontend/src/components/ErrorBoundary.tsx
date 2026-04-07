/**
 * Error Boundary Component
 * Catches React errors anywhere in the component tree
 * Provides fallback UI and recovery options
 * Mobile-friendly: Touch-accessible recovery buttons
 */

import React from 'react';
import type { ReactNode } from 'react';
import type { AppError } from '../hooks/useErrorHandler';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: AppError, recover: () => void) => ReactNode;
  onError?: (error: AppError, errorInfo: { componentStack: string }) => void;
  level?: 'page' | 'section' | 'component';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorInfo: { componentStack: string } | null;
  recovered: number; // Track recovery attempts
}

/**
 * Classic class component Error Boundary
 * (Required for error catching - hooks can't catch errors)
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      recovered: 0,
    };
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const appError = error as AppError;
    appError.code = appError.code || 'REACT_ERROR';
    appError.context = {
      component: errorInfo.componentStack,
      level: this.props.level || 'component',
      timestamp: new Date().toISOString(),
    };

    this.setState({
      error: appError,
      errorInfo: { componentStack: errorInfo.componentStack || '' },
    });

    // Call parent handler
    if (this.props.onError) {
      this.props.onError(appError, { componentStack: errorInfo.componentStack || '' });
    }

    // Log to console
    console.error('Error caught by boundary:', error, errorInfo);

    // Log to localStorage for debugging
    try {
      const logs = JSON.parse(localStorage.getItem('mara_error_logs') || '[]');
      logs.push({
        message: error.message,
        code: appError.code,
        level: this.props.level || 'component',
        timestamp: Date.now(),
      });
      localStorage.setItem('mara_error_logs', JSON.stringify(logs.slice(-50)));
    } catch (e) {
      // Silent fail
    }
  }

  handleRecover = () => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      recovered: prevState.recovered + 1,
    }));
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRecover);
      }

      // Default fallback UI
      const level = this.props.level || 'component';
      const isCritical = level === 'page';
      const errorMessage = this.getUserFriendlyMessage(this.state.error);
      const suggestion = this.getRecoverySuggestion(this.state.error);

      return (
        <div
          className={`error-boundary-fallback ${level}`}
          role="alert"
          aria-live="assertive"
          style={this.getContainerStyle(isCritical)}
        >
          <div className="error-boundary-content">
            {/* Icon */}
            <div className="error-icon" aria-hidden="true">
              {isCritical ? '⚠️' : '❌'}
            </div>

            {/* Title */}
            <h2 className="error-title">
              {isCritical
                ? 'Something went wrong'
                : 'Unable to load this section'}
            </h2>

            {/* Error message */}
            <p className="error-message">{errorMessage}</p>

            {/* Recovery suggestion */}
            <p className="error-suggestion">{suggestion}</p>

            {/* Development mode - show error details */}
            {(import.meta.env.MODE === 'development') && (
              <details className="error-details">
                <summary>Error details (dev only)</summary>
                <pre className="error-stack">
                  {this.state.error.stack}
                  {'\n\n'}
                  Component Stack:
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            {/* Recovery buttons */}
            <div className="error-actions">
              <button
                onClick={this.handleRecover}
                className="error-button primary"
                aria-label="Try again"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="error-button secondary"
                aria-label="Go to home page"
              >
                Home
              </button>
            </div>

            {/* Recovery count feedback */}
            {this.state.recovered > 0 && (
              <p className="error-recovery-count" role="status">
                Recovery attempt {this.state.recovered}
                {this.state.recovered > 2 && ' - Contact support if issues persist'}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }

  private getUserFriendlyMessage(error: AppError): string {
    if (error.statusCode === 404) return 'Resource not found.';
    if (error.statusCode === 401) return 'Please log in again.';
    if (error.statusCode === 500) return 'Server error - try again later.';
    if (error.code === 'NETWORK_ERROR') return 'Network connection error.';
    return error.message || 'An unexpected error occurred.';
  }

  private getRecoverySuggestion(error: AppError): string {
    if (error.code === 'NETWORK_ERROR') {
      return 'Check your internet connection and try again.';
    }
    if (error.statusCode === 500) {
      return 'Our team has been notified. Try again in a moment.';
    }
    return 'Try refreshing the page or clearing your browser cache.';
  }

  private getContainerStyle(isCritical: boolean): React.CSSProperties {
    return {
      padding: isCritical ? '40px 20px' : '20px',
      minHeight: isCritical ? '100vh' : '200px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isCritical
        ? 'linear-gradient(135deg, #000000, #0f0f1a, #1a1a2e)'
        : '#0f0f1a',
      color: '#ffffff',
    };
  }
}

/**
 * Styled error boundary styles
 * Add this to your global CSS or create ErrorBoundary.css
 */
export const errorBoundaryStyles = `
.error-boundary-fallback {
  padding: 20px;
  background: linear-gradient(135deg, #000000, #0f0f1a, #1a1a2e);
  color: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.error-boundary-fallback.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-boundary-fallback.section {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-boundary-fallback.component {
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-boundary-content {
  text-align: center;
  max-width: 500px;
  width: 100%;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #a855f7;
}

.error-message {
  font-size: 16px;
  margin: 8px 0;
  color: #e0e0e0;
  line-height: 1.6;
}

.error-suggestion {
  font-size: 14px;
  margin: 12px 0 16px;
  color: #b0b0b0;
  font-style: italic;
}

.error-details {
  margin: 16px 0;
  text-align: left;
  background: rgba(0, 0, 0, 0.5);
  padding: 8px;
  border-radius: 6px;
  border: 1px solid rgba(168, 85, 247, 0.1);
}

.error-details summary {
  cursor: pointer;
  color: #a855f7;
  font-size: 12px;
  padding: 8px;
}

.error-stack {
  font-size: 11px;
  color: #ff6b6b;
  overflow-x: auto;
  padding: 8px;
  margin: 8px 0 0;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

.error-button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.error-button.primary {
  background: linear-gradient(135deg, #a855f7, #ec4899);
  color: white;
  box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);
}

.error-button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(168, 85, 247, 0.6);
}

.error-button.primary:active {
  transform: translateY(0);
}

.error-button.secondary {
  background: transparent;
  color: #a855f7;
  border: 2px solid #a855f7;
}

.error-button.secondary:hover {
  background: rgba(168, 85, 247, 0.1);
}

.error-button.secondary:active {
  background: rgba(168, 85, 247, 0.2);
}

.error-recovery-count {
  font-size: 12px;
  color: #f59e0b;
  margin-top: 16px;
  margin-bottom: 0;
}

/* Mobile responsiveness */
@media (max-width: 600px) {
  .error-boundary-content {
    padding: 20px;
  }

  .error-title {
    font-size: 20px;
  }

  .error-message {
    font-size: 14px;
  }

  .error-actions {
    flex-direction: column;
    gap: 8px;
  }

  .error-button {
    width: 100%;
  }

  .error-icon {
    font-size: 40px;
  }
}
`;
