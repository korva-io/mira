/**
 * Structured logging system with proper levels and context management
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  readonly userId?: string;
  readonly requestId?: string;
  readonly operation?: string;
  readonly duration?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: LogContext;
  readonly error?: Error;
  readonly service: string;
}

export interface StructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
}

/**
 * Production-ready structured logger implementation
 */
export class ProductionLogger implements StructuredLogger {
  private readonly serviceName: string;
  private readonly logLevel: LogLevel;

  constructor(serviceName: string, logLevel: LogLevel = 'info') {
    this.serviceName = serviceName;
    this.logLevel = logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.sanitizeContext(context),
      error: error ? this.sanitizeError(error) : undefined,
      service: this.serviceName,
    };
  }

  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;

    return {
      ...context,
      metadata: this.sanitizeSensitiveData(context.metadata) as Record<string, unknown> | undefined,
    };
  }

  private sanitizeError(error: Error): Error {
    // Create a clean error object without sensitive data
    const sanitized = new Error(error.message);
    sanitized.name = error.name;
    sanitized.stack = error.stack;
    return sanitized;
  }

  private sanitizeSensitiveData(data: unknown): unknown {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeSensitiveData(item));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeSensitiveData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apikey',
      'connectionstring',
      'auth',
      'credential',
    ];
    return sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive)
    );
  }

  private writeLog(entry: LogEntry): void {
    const output = JSON.stringify(entry, null, 2);
    
    switch (entry.level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.writeLog(this.createLogEntry('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.writeLog(this.createLogEntry('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      this.writeLog(this.createLogEntry('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog('error')) {
      this.writeLog(this.createLogEntry('error', message, context, error));
    }
  }
}

/**
 * Logger factory for creating service-specific loggers
 */
export class LoggerFactory {
  private static logLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel) || 'info';

  static createLogger(serviceName: string): StructuredLogger {
    return new ProductionLogger(serviceName, this.logLevel);
  }

  static setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}
