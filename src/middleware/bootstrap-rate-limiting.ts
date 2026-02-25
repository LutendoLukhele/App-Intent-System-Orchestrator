import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Express, Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';

interface CircuitBreakerMetrics {
  isOpen: boolean;
  lastCheckTime: number;
  cpuPercent: number;
  memPercent: number;
  openedAt?: number;
}

class CircuitBreaker {
  private metrics: CircuitBreakerMetrics = {
    isOpen: false,
    lastCheckTime: Date.now(),
    cpuPercent: 0,
    memPercent: 0
  };

  private cpuCritical = parseInt(process.env.CPU_THRESHOLD_CRITICAL || '85', 10);
  private memoryCritical = parseInt(process.env.MEMORY_THRESHOLD_CRITICAL || '92', 10);

  isHealthy(): boolean {
    return !this.metrics.isOpen;
  }

  getMetrics() {
    return this.metrics;
  }

  async checkHealth(cpuPercent: number, memPercent: number): Promise<void> {
    this.metrics.cpuPercent = cpuPercent;
    this.metrics.memPercent = memPercent;
    this.metrics.lastCheckTime = Date.now();

    if (cpuPercent > this.cpuCritical || memPercent > this.memoryCritical) {
      if (!this.metrics.isOpen) {
        this.metrics.isOpen = true;
        this.metrics.openedAt = Date.now();
        console.warn(`⚠️  Circuit breaker OPEN - CPU: ${cpuPercent}%, Memory: ${memPercent}%`);
      }
    } else if (cpuPercent < 70 && memPercent < 80) {
      if (this.metrics.isOpen) {
        this.metrics.isOpen = false;
        console.info(`✅ Circuit breaker CLOSED - System recovered`);
      }
    }
  }
}

export const circuitBreaker = new CircuitBreaker();

/**
 * Standard rate limiter: 300 requests per minute per user/IP
 */
export const createStandardRateLimiter = (redisClient?: Redis) => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per window
    keyGenerator: (req: Request) => {
      // Use authenticated user ID if available, otherwise use IP (with IPv6 support)
      return (req as any).user?.id || ipKeyGenerator(req) || 'unknown';
    },
    skip: (req: Request) => {
      return req.path === '/health' || req.path === '/health/detailed';
    },
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: (req as any).rateLimit?.resetTime
      });
    }
  });
};

/**
 * LLM-specific rate limiter: 50 global calls per 5 minutes, 10 per user
 */
export const createLLMRateLimiter = (redisClient?: Redis) => {
  const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: parseInt(process.env.LLM_RATE_LIMIT_GLOBAL || '50', 10),
    keyGenerator: () => 'global', // All LLM calls share the same limit
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'LLM rate limit exceeded (global)',
        retryAfter: (req as any).rateLimit?.resetTime
      });
    }
  });

  const perUserLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: parseInt(process.env.LLM_RATE_LIMIT_PER_USER || '10', 10),
    keyGenerator: (req: Request) => (req as any).user?.id || ipKeyGenerator(req) || 'unknown',
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'LLM rate limit exceeded (per user)',
        retryAfter: (req as any).rateLimit?.resetTime
      });
    }
  });

  return (req: Request, res: Response, next: NextFunction) => {
    // Check global limit first
    globalLimiter(req, res, (err) => {
      if (err) return next(err);
      // Then check per-user limit
      perUserLimiter(req, res, next);
    });
  };
};

/**
 * Webhook rate limiter: 100 requests per minute by source
 */
export const createWebhookRateLimiter = (redisClient?: Redis) => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    keyGenerator: (req: Request) => {
      // Use X-Webhook-Source header or provider from body, with IPv6 support for IP fallback
      return (
        (req.headers['x-webhook-source'] as string) ||
        ((req.body as any)?.provider as string) ||
        ipKeyGenerator(req) ||
        'unknown'
      );
    },
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'Webhook rate limit exceeded',
        retryAfter: (req as any).rateLimit?.resetTime
      });
    }
  });
};

/**
 * Circuit breaker middleware - rejects requests when system is overloaded
 */
export const circuitBreakerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!circuitBreaker.isHealthy()) {
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'System is under heavy load. Please try again shortly.',
      metrics: circuitBreaker.getMetrics()
    });
  }
  next();
};

/**
 * Setup all bootstrap middleware on the Express app
 */
export const setupBootstrapMiddleware = (app: Express, redisClient?: Redis) => {
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === 'true';

  if (rateLimitEnabled) {
    console.log('🚀 Initializing bootstrap rate limiting...');

    // Apply circuit breaker first
    app.use(circuitBreakerMiddleware);

    // Apply standard rate limiter to all routes except health checks
    app.use(createStandardRateLimiter(redisClient));

    // Apply LLM rate limiter to specific routes
    app.use('/api/llm', createLLMRateLimiter(redisClient));
    app.use('/api/completion', createLLMRateLimiter(redisClient));
    app.use('/api/chat', createLLMRateLimiter(redisClient));

    // Apply webhook rate limiter
    app.use('/api/webhooks', createWebhookRateLimiter(redisClient));

    console.log('✅ Bootstrap rate limiting initialized');
  } else {
    console.log('⏭️  Rate limiting disabled (RATE_LIMIT_ENABLED=false)');
  }
};

export default {
  createStandardRateLimiter,
  createLLMRateLimiter,
  createWebhookRateLimiter,
  circuitBreakerMiddleware,
  setupBootstrapMiddleware,
  circuitBreaker
};
