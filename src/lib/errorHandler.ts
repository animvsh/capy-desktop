/**
 * Centralized error handling utilities
 */

export interface AppError {
  message: string;
  code?: string;
  status?: number;
  retryable?: boolean;
}

export function isNetworkError(error: any): boolean {
  if (!error) return false;
  const message = String(error.message || error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    navigator.onLine === false
  );
}

export function isRateLimitError(error: any): boolean {
  if (!error) return false;
  const status = (error as any)?.status;
  const message = String(error.message || error).toLowerCase();
  return status === 429 || message.includes('429') || message.includes('rate limit');
}

export function isPaymentRequiredError(error: any): boolean {
  if (!error) return false;
  const status = (error as any)?.status;
  const message = String(error.message || error).toLowerCase();
  return status === 402 || message.includes('402') || message.includes('payment required');
}

export function isAuthError(error: any): boolean {
  if (!error) return false;
  const status = (error as any)?.status;
  const message = String(error.message || error).toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid token') ||
    message.includes('auth session missing') ||
    message.includes('jwt') ||
    message.includes('expired')
  );
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof Error) {
    return {
      message: error.message || 'An unexpected error occurred',
      retryable: isNetworkError(error),
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      retryable: false,
    };
  }

  if (error && typeof error === 'object') {
    const err = error as any;
    return {
      message: err.message || err.error || 'An unexpected error occurred',
      code: err.code,
      status: err.status,
      retryable: isNetworkError(err) || err.status >= 500,
    };
  }

  return {
    message: 'An unexpected error occurred',
    retryable: false,
  };
}

export function getUserFriendlyMessage(error: unknown): string {
  const normalized = normalizeError(error);

  if (isRateLimitError(error)) {
    return 'Too many requests. Please try again in a moment.';
  }

  if (isPaymentRequiredError(error)) {
    return 'Usage limit reached. Please check your account.';
  }

  if (isAuthError(error)) {
    return 'Your session has expired. Please sign in again.';
  }

  if (isNetworkError(error)) {
    return 'Network error. Please check your connection and try again.';
  }

  return normalized.message;
}

