import { Counter, Gauge, Histogram, register } from 'prom-client';

// System metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

export const errorCounter = new Counter({
  name: 'errors_total',
  help: 'Total number of errors by type',
  labelNames: ['error_type', 'service', 'severity'],
});

// Tool execution metrics
export const toolExecutionDuration = new Histogram({
  name: 'tool_execution_duration_seconds',
  help: 'Tool execution latency in seconds',
  labelNames: ['tool_name', 'provider', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const toolExecutionTotal = new Counter({
  name: 'tool_execution_total',
  help: 'Total number of tool executions',
  labelNames: ['tool_name', 'provider', 'status'],
});

export const toolQueueDepth = new Gauge({
  name: 'tool_queue_depth',
  help: 'Current depth of tool execution queue',
  labelNames: ['tool_name'],
});

// External API metrics
export const externalApiCallDuration = new Histogram({
  name: 'external_api_call_duration_seconds',
  help: 'External API call latency in seconds',
  labelNames: ['api_name', 'endpoint', 'status'],
  buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const externalApiCallTotal = new Counter({
  name: 'external_api_calls_total',
  help: 'Total number of external API calls',
  labelNames: ['api_name', 'endpoint', 'status'],
});

export const externalApiRateLimitHits = new Counter({
  name: 'external_api_rate_limit_hits_total',
  help: 'Total number of rate limit hits from external APIs',
  labelNames: ['api_name'],
});

// Database metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['operation', 'table', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
});

export const dbQueryTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
});

export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Current database connection pool size',
  labelNames: ['pool_name'],
});

// Cache metrics
export const cacheHitRate = new Gauge({
  name: 'cache_hit_ratio',
  help: 'Cache hit ratio (0-1)',
  labelNames: ['cache_name'],
});

export const cacheOperationDuration = new Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Cache operation latency in seconds',
  labelNames: ['cache_name', 'operation', 'status'],
  buckets: [0.001, 0.01, 0.1, 1],
});

// WebSocket metrics
export const websocketConnectionsActive = new Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  labelNames: ['user_id'],
});

export const websocketMessagesTotal = new Counter({
  name: 'websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction', 'message_type'],
});

// Automation/Cortex metrics
export const automationExecutionDuration = new Histogram({
  name: 'automation_execution_duration_seconds',
  help: 'Automation execution latency in seconds',
  labelNames: ['automation_id', 'trigger_type', 'status'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});

export const automationExecutionTotal = new Counter({
  name: 'automation_execution_total',
  help: 'Total number of automation executions',
  labelNames: ['automation_id', 'trigger_type', 'status'],
});

export const webhookProcessingDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Webhook processing latency in seconds',
  labelNames: ['provider', 'event_type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

export const webhookQueueDepth = new Gauge({
  name: 'webhook_queue_depth',
  help: 'Current webhook queue depth',
});

// Business metrics
export const subscriptionCount = new Gauge({
  name: 'subscriptions_active',
  help: 'Number of active subscriptions by status',
  labelNames: ['status'],
});

export const paymentTransactionTotal = new Counter({
  name: 'payment_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['provider', 'status', 'currency'],
});

export const webhookEventsTotal = new Counter({
  name: 'webhook_events_total',
  help: 'Total number of webhook events processed',
  labelNames: ['provider', 'event_type'],
});

// Resource metrics
export const cpuUsagePercent = new Gauge({
  name: 'cpu_usage_percent',
  help: 'CPU usage percentage',
});

export const memoryUsageBytes = new Gauge({
  name: 'memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'],
});

export const uptime = new Gauge({
  name: 'process_uptime_seconds',
  help: 'Process uptime in seconds',
});

export function getMetricsRegistry() {
  return register;
}
