import Winston from 'winston';
import { RequestContext } from './logging';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error classification
export enum ErrorType {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  RATE_LIMIT = 'rate_limit',
  EXTERNAL_API = 'external_api',
  DATABASE = 'database',
  TIMEOUT = 'timeout',
  CONFLICT = 'conflict',
  INTERNAL = 'internal',
}

export interface AppError extends Error {
  type: ErrorType;
  statusCode: number;
  severity: ErrorSeverity;
  context?: any;
  retryable?: boolean;
}

export function createAppError(
  message: string,
  type: ErrorType,
  statusCode: number,
  severity: ErrorSeverity,
  options?: {
    context?: any;
    retryable?: boolean;
    originalError?: Error;
  }
): AppError {
  const error = new Error(message) as AppError;
  error.type = type;
  error.statusCode = statusCode;
  error.severity = severity;
  error.context = options?.context;
  error.retryable = options?.retryable ?? false;
  error.stack = options?.originalError?.stack || error.stack;
  return error;
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs?: number;
  jitter?: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

// Exponential backoff with jitter
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig
): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber),
    config.maxDelayMs
  );

  if (config.jitter) {
    return delay * (0.5 + Math.random() * 0.5);
  }

  return delay;
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  logger: Winston.Logger,
  context: RequestContext,
  config?: Partial<RetryConfig>
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      logger.debug(`Executing ${operationName} (attempt ${attempt + 1})`, {
        traceId: context.traceId,
        attempt,
      });

      const result = await operation();
      
      if (attempt > 0) {
        logger.info(`${operationName} succeeded after ${attempt} retries`, {
          traceId: context.traceId,
          attempt,
        });
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable = (error as any)?.retryable !== false &&
        attempt < finalConfig.maxRetries &&
        isTransientError(error as Error);

      if (!isRetryable) {
        logger.error(`${operationName} failed (not retryable)`, {
          traceId: context.traceId,
          error: (error as Error).message,
          stack: (error as Error).stack,
          attempt,
        });
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, finalConfig);
      logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
        traceId: context.traceId,
        error: (error as Error).message,
        attempt,
        nextRetryIn: `${delay}ms`,
      });

      await sleep(delay);
    }
  }

  throw lastError || new Error(`${operationName} failed after ${finalConfig.maxRetries} retries`);
}

// Circuit breaker pattern
export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes before closing
  timeout: number; // Time in ms before attempting reset
}

export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private config: CircuitBreakerConfig;
  private logger: Winston.Logger;

  constructor(logger: Winston.Logger, config: Partial<CircuitBreakerConfig> = {}) {
    this.logger = logger;
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 60000, // 1 minute
    };
  }

  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceLastFailure > this.config.timeout) {
        this.logger.info(`Circuit breaker transitioning to half-open for ${operationName}`);
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker is open for ${operationName}. Retry after ${
            this.config.timeout - timeSinceLastFailure
          }ms`
        );
      }
    }

    try {
      const result = await operation();

      if (this.state === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.logger.info(`Circuit breaker closed for ${operationName}`);
          this.state = 'closed';
          this.failureCount = 0;
        }
      }

      return result;
    } catch (error) {
      this.lastFailureTime = Date.now();
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        this.logger.warn(`Circuit breaker opened for ${operationName}`);
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): string {
    return this.state;
  }
}

// Determine if error is transient
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('etimedout')) {
    return true;
  }

  // HTTP 5xx errors are typically transient
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return true;
  }

  // Rate limit errors
  if (message.includes('429') || message.includes('rate limit')) {
    return true;
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  return false;
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Timeout wrapper
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
