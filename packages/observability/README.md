# @aso/observability

> Production-ready observability for Node.js applications

## Overview

Drop-in observability stack providing telemetry, metrics, health checks, logging, and error handling for any Express application.

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                          │
├─────────────────────────────────────────────────────────────┤
│                   @aso/observability                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐ │
│  │ Telemetry │  │  Metrics  │  │  Health   │  │ Security │ │
│  │ OpenTel   │  │ Prometheus│  │ K8s probes│  │Rate limit│ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────┬─────┘ │
│        │              │              │              │        │
│        └──────────────┴──────────────┴──────────────┘        │
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               ▼
                      Observability Backend
                   (Jaeger, Prometheus, etc.)
```

## Components

### Telemetry
OpenTelemetry-based distributed tracing:
- Automatic span creation for HTTP requests
- Custom span instrumentation
- Trace context propagation

### Metrics
Prometheus-compatible metrics:
- HTTP request duration histogram
- Request counter by route/status
- Custom business metrics

### Health
Kubernetes-ready health probes:
- `/health/live` - Liveness probe
- `/health/ready` - Readiness probe (checks dependencies)

### Error Handling
Resilience patterns:
- Circuit breakers for external services
- Retry with exponential backoff
- Graceful degradation

### Security
Request protection:
- Rate limiting (configurable per-route)
- CORS configuration
- Security headers (Helmet)

## Installation

```bash
npm install @aso/observability
```

## Usage

### Quick Setup (All Features)

```typescript
import express from 'express';
import { 
  setupTelemetry, 
  setupMetrics, 
  setupHealth,
  setupSecurity,
  setupErrorHandling 
} from '@aso/observability';

const app = express();

// Initialize (order matters)
setupTelemetry(app, { serviceName: 'my-service' });
setupSecurity(app, { rateLimit: { max: 100, windowMs: 60000 } });
setupHealth(app, { 
  checks: {
    database: async () => db.ping(),
    redis: async () => redis.ping()
  }
});
setupMetrics(app);
setupErrorHandling(app);

app.listen(3000);
```

### Individual Components

#### Telemetry Only
```typescript
import { setupTelemetry, createSpan } from '@aso/observability';

setupTelemetry(app, { 
  serviceName: 'my-service',
  exporterUrl: 'http://jaeger:14268/api/traces'
});

// Manual span creation
await createSpan('processOrder', async (span) => {
  span.setAttribute('orderId', orderId);
  await processOrder();
});
```

#### Metrics Only
```typescript
import { setupMetrics, incrementCounter, recordHistogram } from '@aso/observability';

setupMetrics(app, { path: '/metrics' });

// Custom metrics
incrementCounter('orders_processed', { status: 'success' });
recordHistogram('order_processing_time', duration, { type: 'standard' });
```

#### Health Checks Only
```typescript
import { setupHealth } from '@aso/observability';

setupHealth(app, {
  checks: {
    database: async () => {
      await db.query('SELECT 1');
      return true;
    },
    cache: async () => {
      await redis.ping();
      return true;
    },
    external_api: async () => {
      const response = await fetch('https://api.example.com/health');
      return response.ok;
    }
  }
});

// GET /health/live   -> { status: 'ok' }
// GET /health/ready  -> { status: 'ok', checks: { database: true, cache: true, ... } }
```

#### Circuit Breaker
```typescript
import { CircuitBreaker } from '@aso/observability';

const breaker = new CircuitBreaker({
  name: 'external-api',
  timeout: 5000,
  errorThreshold: 5,
  resetTimeout: 30000
});

const result = await breaker.call(async () => {
  return await externalApi.call();
});
```

## Configuration Options

### Telemetry
```typescript
interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  exporterUrl?: string;
  samplingRatio?: number;  // 0.0 - 1.0
  enableConsoleExporter?: boolean;
}
```

### Metrics
```typescript
interface MetricsConfig {
  path?: string;           // Default: '/metrics'
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;
}
```

### Health
```typescript
interface HealthConfig {
  livePath?: string;       // Default: '/health/live'
  readyPath?: string;      // Default: '/health/ready'
  checks?: Record<string, () => Promise<boolean>>;
}
```

### Security
```typescript
interface SecurityConfig {
  rateLimit?: {
    max: number;           // Requests per window
    windowMs: number;      // Window in milliseconds
  };
  cors?: CorsOptions;
  helmet?: HelmetOptions;
}
```

## License

MIT
