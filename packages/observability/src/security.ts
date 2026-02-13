import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Joi from 'joi';
import Winston from 'winston';

// Security headers middleware
export function securityHeadersMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        frameSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
  });
}

// Rate limiting by user/IP
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req: any) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

export const strictRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// Request size limits
export const requestLimitMiddleware = (limit: string = '50mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSize = parseSize(limit);

    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Payload too large',
        maxSize,
        received: contentLength,
      });
    }

    next();
  };
};

// Input validation
export interface ValidationSchema {
  body?: any;
  query?: any;
  params?: any;
}

export function validateRequest(schema: ValidationSchema, logger?: Winston.Logger) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        const { error, value } = (schema.body as any).validate(req.body, { abortEarly: false });
        if (error) {
          const details = (error as any).details.map((d: any) => ({
            path: d.path.join('.'),
            message: d.message,
          }));
          logger?.warn('Request validation failed', { path: req.path, details });
          return res.status(400).json({ error: 'Validation failed', details });
        }
        req.body = value;
      }

      if (schema.query) {
        const { error, value } = (schema.query as any).validate(req.query, { abortEarly: false });
        if (error) {
          const details = (error as any).details.map((d: any) => ({
            path: d.path.join('.'),
            message: d.message,
          }));
          logger?.warn('Query validation failed', { path: req.path, details });
          return res.status(400).json({ error: 'Validation failed', details });
        }
        req.query = value;
      }

      if (schema.params) {
        const { error, value } = (schema.params as any).validate(req.params, { abortEarly: false });
        if (error) {
          const details = (error as any).details.map((d: any) => ({
            path: d.path.join('.'),
            message: d.message,
          }));
          logger?.warn('Params validation failed', { path: req.path, details });
          return res.status(400).json({ error: 'Validation failed', details });
        }
        req.params = value;
      }

      next();
    } catch (err) {
      logger?.error('Validation error', err as Error);
      res.status(500).json({ error: 'Internal validation error' });
    }
  };
}

// CORS with security
export function corsOptionsSecure() {
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-trace-id', 'x-span-id'],
    optionsSuccessStatus: 200,
  };
}

// Error handling with security (don't leak stack traces in production)
export function secureErrorHandler(logger: Winston.Logger) {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    const isDevelopment = process.env.NODE_ENV === 'development';
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
      error: err.message || 'Internal server error',
      ...(isDevelopment && { stack: err.stack }),
      traceId: req.context?.traceId,
    });
  };
}

// Helper to parse size strings like "50mb" to bytes
function parseSize(sizeStr: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
  };

  const match = sizeStr.toLowerCase().match(/^(\d+)([a-z]+)$/);
  if (!match) return 50 * 1024 * 1024; // Default 50mb

  const [, num, unit] = match;
  return parseInt(num) * (units[unit] || 1024 ** 2);
}

// Token validation middleware
export function validateTokenExpiry(logger?: Winston.Logger) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return next();
    }

    try {
      // Decode JWT without verification to check expiry
      const parts = token.split('.');
      if (parts.length !== 3) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      if (payload.exp && Date.now() >= payload.exp * 1000) {
        logger?.warn('Expired token rejected', { userId: payload.sub });
        return res.status(401).json({ error: 'Token expired' });
      }

      next();
    } catch (err) {
      logger?.error('Token validation error', err as Error);
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}
