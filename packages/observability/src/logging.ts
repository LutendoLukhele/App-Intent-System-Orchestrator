import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Winston from 'winston';

// Request context type for trace propagation
export interface RequestContext {
  traceId: string;
  spanId: string;
  userId?: string;
  startTime: number;
}

// Store context on request
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

// Create structured logger
export function createStructuredLogger(serviceName: string) {
  return Winston.createLogger({
    defaultMeta: { service: serviceName },
    format: Winston.format.combine(
      Winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      Winston.format.errors({ stack: true }),
      Winston.format.splat(),
      Winston.format.json()
    ),
    transports: [
      new Winston.transports.Console({
        format: Winston.format.combine(
          Winston.format.colorize(),
          Winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `[${timestamp}] ${level} [${service}] ${message} ${metaStr}`;
          })
        ),
      }),
    ],
  });
}

// Middleware to add trace context to all requests
export function traceContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = req.get('x-trace-id') || uuidv4();
  const spanId = req.get('x-span-id') || uuidv4();

  // Extract user ID if available (from Firebase auth)
  let userId: string | undefined;
  if (req.get('authorization')) {
    // This will be enriched by auth middleware
    userId = req.get('x-user-id');
  }

  req.context = {
    traceId,
    spanId,
    userId,
    startTime: Date.now(),
  };

  // Propagate trace context to response
  res.set('x-trace-id', traceId);
  res.set('x-span-id', spanId);

  next();
}

// Middleware to log HTTP requests and responses
export function httpLoggingMiddleware(logger: Winston.Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = req.context!;
    const contentLength = req.get('content-length');

    // Log request
    logger.info('HTTP request received', {
      traceId: context.traceId,
      spanId: context.spanId,
      userId: context.userId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      contentLength: contentLength ? parseInt(contentLength) : 0,
    });

    // Override res.json to capture response data
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseBody = '';

    res.json = function (data: any) {
      responseBody = JSON.stringify(data);
      return originalJson(data);
    };

    res.send = function (data: string | object) {
      if (typeof data === 'string') {
        responseBody = data;
      } else {
        responseBody = JSON.stringify(data);
      }
      return originalSend(data);
    };

    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - context.startTime;

      logger.info('HTTP request completed', {
        traceId: context.traceId,
        spanId: context.spanId,
        userId: context.userId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: duration,
        responseSize: res.get('content-length') || 0,
        durationMs: `${duration}ms`,
      });
    });

    next();
  };
}

// Utility to log with trace context
export function logWithContext(logger: Winston.Logger, req: Request | RequestContext) {
  const context = (req as any).context ? (req as Request).context : (req as RequestContext);

  return {
    info: (message: string, data?: any) => {
      logger.info(message, { ...data, ...context });
    },
    error: (message: string, error?: any, data?: any) => {
      logger.error(message, { ...data, error: error?.message, stack: error?.stack, ...context });
    },
    warn: (message: string, data?: any) => {
      logger.warn(message, { ...data, ...context });
    },
    debug: (message: string, data?: any) => {
      logger.debug(message, { ...data, ...context });
    },
  };
}
