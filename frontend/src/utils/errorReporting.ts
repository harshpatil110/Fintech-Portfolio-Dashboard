import axios from 'axios';
import { ErrorInfo } from 'react';
import { getAuthHeader } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface ErrorReport {
  error: Error;
  errorInfo?: ErrorInfo;
  context?: {
    componentStack?: string;
    url?: string;
    userAgent?: string;
    [key: string]: any;
  };
}

interface ErrorReportPayload {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  context?: Record<string, any>;
}

/**
 * Reports an error to the backend for logging and monitoring
 */
export const reportErrorToBackend = async (report: ErrorReport): Promise<void> => {
  try {
    const payload: ErrorReportPayload = {
      message: report.error.message,
      stack: report.error.stack,
      componentStack: report.errorInfo?.componentStack,
      url: report.context?.url || window.location.href,
      userAgent: report.context?.userAgent || navigator.userAgent,
      timestamp: new Date().toISOString(),
      context: report.context,
    };

    const authHeader = getAuthHeader();
    
    await axios.post(`${API_BASE_URL}/errors/report`, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      timeout: 5000, // 5 second timeout for error reporting
    });
  } catch (error) {
    // Silently fail - don't throw errors when reporting errors
    console.error('Failed to report error to backend:', error);
  }
};

/**
 * Reports an API error with additional context
 */
export const reportApiError = async (
  error: any,
  endpoint: string,
  method: string,
  additionalContext?: Record<string, any>
): Promise<void> => {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  await reportErrorToBackend({
    error: errorObj,
    context: {
      endpoint,
      method,
      statusCode: error.response?.status,
      responseData: error.response?.data,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...additionalContext,
    },
  });
};
