/**
 * @aso/observability
 * 
 * Production-ready observability stack for Node.js applications
 * 
 * @example
 * ```typescript
 * import { setupTelemetry, setupMetrics, setupHealth } from '@aso/observability';
 * 
 * const app = express();
 * setupTelemetry(app, { serviceName: 'my-service' });
 * setupMetrics(app);
 * setupHealth(app, { checks: { db: () => db.ping() } });
 * ```
 */

// Telemetry (OpenTelemetry)
export * from './telemetry';

// Metrics (Prometheus)
export * from './metrics';

// Health probes
export * from './health';

// Security middleware
export * from './security';

// Error handling & resilience
export * from './error-handling';

// Structured logging
export * from './logging';
