import { Router, Request, Response } from 'express';
import os from 'os';
import Winston from 'winston';
import { getMetricsRegistry } from './metrics';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      details?: any;
    };
  };
}

export function createHealthRouter(logger: Winston.Logger, healthChecks?: Map<string, () => Promise<boolean>>) {
  const router = Router();

  // Basic health check
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const checks: HealthCheckResult['checks'] = {};

      // Run custom health checks if provided
      if (healthChecks) {
        for (const [name, check] of healthChecks) {
          try {
            const isHealthy = await check();
            checks[name] = {
              status: isHealthy ? 'ok' : 'error',
              message: isHealthy ? undefined : `${name} check failed`,
            };
          } catch (err) {
            checks[name] = {
              status: 'error',
              message: (err as Error).message,
            };
          }
        }
      }

      // System checks
      checks.memory = {
        status: getMemoryStatus(),
        details: {
          heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
          heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB',
          external: (process.memoryUsage().external / 1024 / 1024).toFixed(2) + ' MB',
        },
      };

      checks.cpu = {
        status: 'ok',
        details: {
          loadAverage: os.loadavg(),
          cpuCount: os.cpus().length,
        },
      };

      // Determine overall status
      const hasErrors = Object.values(checks).some((c) => c.status === 'error');
      const hasWarnings = Object.values(checks).some((c) => c.status === 'warning');
      const overallStatus = hasErrors ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy';

      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 503 : 503;
      res.status(statusCode).json(result);
    } catch (err) {
      logger.error('Health check error', err as Error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          error: {
            status: 'error',
            message: (err as Error).message,
          },
        },
      });
    }
  });

  // Metrics endpoint
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const register = getMetricsRegistry();
      res.set('Content-Type', register.contentType);
      res.send(await register.metrics());
    } catch (err) {
      logger.error('Metrics collection error', err as Error);
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  // Detailed metrics endpoint
  router.get('/metrics/json', async (req: Request, res: Response) => {
    try {
      const register = getMetricsRegistry();
      const metrics = await register.getMetricsAsJSON();

      const formattedMetrics: { [key: string]: any } = {};

      for (const metric of metrics) {
        if (!formattedMetrics[metric.name]) {
          formattedMetrics[metric.name] = {
            help: metric.help,
            type: metric.type,
            values: [],
          };
        }

        formattedMetrics[metric.name].values.push(metric.values);
      }

      res.json({
        timestamp: new Date().toISOString(),
        metrics: formattedMetrics,
      });
    } catch (err) {
      logger.error('Metrics JSON endpoint error', err as Error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  // Liveness probe (for container orchestration)
  router.get('/live', (req: Request, res: Response) => {
    res.json({ status: 'alive' });
  });

  // Readiness probe (for container orchestration)
  router.get('/ready', async (req: Request, res: Response) => {
    // Run all health checks
    if (healthChecks) {
      for (const [name, check] of healthChecks) {
        try {
          const isReady = await check();
          if (!isReady) {
            return res.status(503).json({
              status: 'not-ready',
              reason: `${name} is not ready`,
            });
          }
        } catch (err) {
          return res.status(503).json({
            status: 'not-ready',
            reason: `${name} check failed: ${(err as Error).message}`,
          });
        }
      }
    }

    res.json({ status: 'ready' });
  });

  return router;
}

function getMemoryStatus(): 'ok' | 'warning' | 'error' {
  const memUsage = process.memoryUsage();
  const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  if (heapUsagePercent > 90) {
    return 'error';
  } else if (heapUsagePercent > 75) {
    return 'warning';
  }
  return 'ok';
}
