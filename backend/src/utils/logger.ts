import { Request } from 'express';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4
};

/**
 * Structured log entry interface
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: ErrorContext;
  metadata?: Record<string, any>;
}

/**
 * Request context for logging
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  method?: string;
  url?: string;
  path?: string;
  query?: any;
  ip?: string;
  userAgent?: string;
  executionTime?: number;
}

/**
 * Error context for logging
 */
export interface ErrorContext {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  stack?: string;
  isOperational?: boolean;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  includeStackTrace: boolean;
  sanitizeSensitiveData: boolean;
}

/**
 * Structured logger for error and application logging
 */
export class Logger {
  private config: LoggerConfig;
  private minLevel: number;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
      enableConsole: true,
      enableStructured: process.env.NODE_ENV === 'production',
      includeStackTrace: process.env.NODE_ENV === 'development',
      sanitizeSensitiveData: true,
      ...config
    };
    this.minLevel = LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.minLevel;
  }

  /**
   * Create a structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: ErrorContext,
    metadata?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message: this.config.sanitizeSensitiveData ? this.sanitize(message) : message,
      context: context ? this.sanitizeContext(context) : undefined,
      error: error ? this.sanitizeError(error) : undefined,
      metadata: metadata ? this.sanitizeMetadata(metadata) : undefined
    };
  }

  /**
   * Sanitize sensitive data from strings
   */
  private sanitize(text: string): string {
    if (!this.config.sanitizeSensitiveData) return text;
    
    return text
      .replace(/password|token|secret|key|authorization/gi, '[REDACTED]')
      .replace(/\b\d{16}\b/g, '[CARD]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  }

  /**
   * Sanitize context data
   */
  private sanitizeContext(context: LogContext): LogContext {
    if (!this.config.sanitizeSensitiveData) return context;
    
    const sanitized = { ...context };
    if (sanitized.userAgent) {
      sanitized.userAgent = this.sanitize(sanitized.userAgent);
    }
    return sanitized;
  }

  /**
   * Sanitize error data
   */
  private sanitizeError(error: ErrorContext): ErrorContext {
    if (!this.config.sanitizeSensitiveData) return error;
    
    return {
      ...error,
      message: this.sanitize(error.message),
      stack: this.config.includeStackTrace ? error.stack : undefined
    };
  }

  /**
   * Sanitize metadata
   */
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    if (!this.config.sanitizeSensitiveData) return metadata;
    
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitize(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Format log entry for console output
   */
  private formatConsoleOutput(entry: LogEntry): string {
    const emoji = this.getLevelEmoji(entry.level);
    const levelStr = entry.level.toUpperCase().padEnd(5);
    
    if (this.config.enableStructured) {
      return JSON.stringify(entry, null, 2);
    }
    
    let output = `${emoji} [${entry.timestamp}] ${levelStr} ${entry.message}`;
    
    if (entry.context?.requestId) {
      output += ` [RequestID: ${entry.context.requestId}]`;
    }
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.name} - ${entry.error.message}`;
      if (entry.error.code) {
        output += ` (${entry.error.code})`;
      }
      if (entry.error.stack && this.config.includeStackTrace) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }
    
    if (entry.context) {
      const contextStr = Object.entries(entry.context)
        .filter(([key]) => key !== 'requestId')
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      if (contextStr) {
        output += `\n  Context: ${contextStr}`;
      }
    }
    
    if (entry.metadata) {
      output += `\n  Metadata: ${JSON.stringify(entry.metadata)}`;
    }
    
    return output;
  }

  /**
   * Get emoji for log level
   */
  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.WARN: return '⚠️';
      case LogLevel.ERROR: return '❌';
      case LogLevel.FATAL: return '💀';
      default: return '📝';
    }
  }

  /**
   * Write log entry
   */
  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    
    if (this.config.enableConsole) {
      const output = this.formatConsoleOutput(entry);
      
      switch (entry.level) {
        case LogLevel.DEBUG:
        case LogLevel.INFO:
          console.log(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(output);
          break;
      }
    }
  }

  /**
   * Extract context from Express request
   */
  extractRequestContext(req: Request, executionTime?: number): LogContext {
    return {
      requestId: req.headers['x-request-id'] as string,
      userId: (req as any).user?.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      executionTime
    };
  }

  /**
   * Extract error context from error object
   */
  extractErrorContext(error: any): ErrorContext {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      isOperational: error.isOperational
    };
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context, undefined, metadata);
    this.log(entry);
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, context, undefined, metadata);
    this.log(entry);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, context, undefined, metadata);
    this.log(entry);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: any, context?: LogContext, metadata?: Record<string, any>): void {
    const errorContext = error ? this.extractErrorContext(error) : undefined;
    const entry = this.createLogEntry(LogLevel.ERROR, message, context, errorContext, metadata);
    this.log(entry);
  }

  /**
   * Fatal level logging
   */
  fatal(message: string, error?: any, context?: LogContext, metadata?: Record<string, any>): void {
    const errorContext = error ? this.extractErrorContext(error) : undefined;
    const entry = this.createLogEntry(LogLevel.FATAL, message, context, errorContext, metadata);
    this.log(entry);
  }

  /**
   * Log HTTP request
   */
  logRequest(req: Request, statusCode: number, executionTime: number): void {
    const context = this.extractRequestContext(req, executionTime);
    const message = `${req.method} ${req.path} ${statusCode}`;
    
    if (statusCode >= 500) {
      this.error(message, undefined, context);
    } else if (statusCode >= 400) {
      this.warn(message, context);
    } else {
      this.info(message, context);
    }
  }

  /**
   * Log error with full context
   */
  logError(error: any, req?: Request, metadata?: Record<string, any>): void {
    const context = req ? this.extractRequestContext(req) : undefined;
    const message = `Error occurred: ${error.message || 'Unknown error'}`;
    
    if (error.isOperational === false || error.statusCode >= 500) {
      this.fatal(message, error, context, metadata);
    } else {
      this.error(message, error, context, metadata);
    }
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

export default logger;
