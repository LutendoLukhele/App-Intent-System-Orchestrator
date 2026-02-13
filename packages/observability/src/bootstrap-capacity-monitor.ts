import os from 'os';

export interface BootstrapMetrics {
  timestamp: number;
  cpu: {
    percent: number;
    threshold_warning: number;
    threshold_critical: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  memory: {
    percent: number;
    used_mb: number;
    total_mb: number;
    threshold_warning: number;
    threshold_critical: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  database: {
    active_connections: number;
    idle_connections: number;
    total_connections: number;
    pool_min: number;
    pool_max: number;
    utilization_percent: number;
  };
  http: {
    requests_per_second: number;
    response_time_p50_ms: number;
    response_time_p95_ms: number;
    response_time_p99_ms: number;
    error_rate_percent: number;
  };
  webhooks: {
    queue_size: number;
    processing_rate: number;
    failure_rate_percent: number;
  };
  websockets: {
    active_connections: number;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    cpu: 'healthy' | 'warning' | 'critical';
    memory: 'healthy' | 'warning' | 'critical';
    database: 'healthy' | 'warning' | 'critical';
    http: 'healthy' | 'warning' | 'critical';
  };
  timestamp: number;
}

export interface ScalingRecommendation {
  action: 'none' | 'scale-up' | 'scale-down';
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

class BootstrapCapacityMonitor {
  private metrics: BootstrapMetrics;
  private responseTimes: number[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private windowStartTime = Date.now();

  private cpuWarning = parseInt(process.env.CPU_THRESHOLD_WARNING || '70', 10);
  private cpuCritical = parseInt(process.env.CPU_THRESHOLD_CRITICAL || '85', 10);
  private memoryWarning = parseInt(process.env.MEMORY_THRESHOLD_WARNING || '80', 10);
  private memoryCritical = parseInt(process.env.MEMORY_THRESHOLD_CRITICAL || '92', 10);

  constructor() {
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): BootstrapMetrics {
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();
    const memoryPercent = (usedMemory / totalMemory) * 100;

    return {
      timestamp: Date.now(),
      cpu: {
        percent: this.getCPUUsage(),
        threshold_warning: this.cpuWarning,
        threshold_critical: this.cpuCritical,
        status: 'healthy'
      },
      memory: {
        percent: memoryPercent,
        used_mb: Math.round(usedMemory / 1024 / 1024),
        total_mb: Math.round(totalMemory / 1024 / 1024),
        threshold_warning: this.memoryWarning,
        threshold_critical: this.memoryCritical,
        status: 'healthy'
      },
      database: {
        active_connections: 0,
        idle_connections: 0,
        total_connections: 0,
        pool_min: parseInt(process.env.DB_POOL_MIN || '5', 10),
        pool_max: parseInt(process.env.DB_POOL_MAX || '20', 10),
        utilization_percent: 0
      },
      http: {
        requests_per_second: 0,
        response_time_p50_ms: 0,
        response_time_p95_ms: 0,
        response_time_p99_ms: 0,
        error_rate_percent: 0
      },
      websockets: {
        active_connections: 0
      },
      webhooks: {
        queue_size: 0,
        processing_rate: 0,
        failure_rate_percent: 0
      }
    };
  }

  private getCPUUsage(): number {
    const cpus = os.cpus();
    const avgLoad = os.loadavg()[0];
    const cpuCount = cpus.length;
    return Math.round((avgLoad / cpuCount) * 100);
  }

  updateMetrics(
    dbMetrics?: { active: number; idle: number; total: number },
    httpMetrics?: { count: number; errors: number; responseTimes: number[] },
    websocketCount?: number,
    webhookMetrics?: { queue: number; rate: number; failures: number }
  ): void {
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();
    const memoryPercent = (usedMemory / totalMemory) * 100;

    // Update CPU
    const cpuPercent = this.getCPUUsage();
    this.metrics.cpu.percent = cpuPercent;
    this.metrics.cpu.status =
      cpuPercent > this.cpuCritical
        ? 'critical'
        : cpuPercent > this.cpuWarning
        ? 'warning'
        : 'healthy';

    // Update Memory
    this.metrics.memory.percent = memoryPercent;
    this.metrics.memory.used_mb = Math.round(usedMemory / 1024 / 1024);
    this.metrics.memory.status =
      memoryPercent > this.memoryCritical
        ? 'critical'
        : memoryPercent > this.memoryWarning
        ? 'warning'
        : 'healthy';

    // Update Database metrics
    if (dbMetrics) {
      this.metrics.database.active_connections = dbMetrics.active;
      this.metrics.database.idle_connections = dbMetrics.idle;
      this.metrics.database.total_connections = dbMetrics.total;
      this.metrics.database.utilization_percent = Math.round(
        (dbMetrics.total / this.metrics.database.pool_max) * 100
      );
    }

    // Update HTTP metrics
    if (httpMetrics && httpMetrics.count > 0) {
      this.requestCount += httpMetrics.count;
      this.errorCount += httpMetrics.errors;
      this.responseTimes.push(...httpMetrics.responseTimes);

      const now = Date.now();
      const windowDuration = (now - this.windowStartTime) / 1000; // seconds

      this.metrics.http.requests_per_second = Math.round(this.requestCount / windowDuration);
      this.metrics.http.error_rate_percent = Math.round(
        (this.errorCount / this.requestCount) * 100
      );

      // Calculate percentiles
      if (this.responseTimes.length > 0) {
        const sorted = this.responseTimes.sort((a, b) => a - b);
        this.metrics.http.response_time_p50_ms = sorted[Math.floor(sorted.length * 0.5)];
        this.metrics.http.response_time_p95_ms = sorted[Math.floor(sorted.length * 0.95)];
        this.metrics.http.response_time_p99_ms = sorted[Math.floor(sorted.length * 0.99)];
      }

      // Reset after 1 minute
      if (windowDuration > 60) {
        this.responseTimes = [];
        this.requestCount = 0;
        this.errorCount = 0;
        this.windowStartTime = now;
      }
    }

    // Update WebSocket metrics
    if (websocketCount !== undefined) {
      this.metrics.websockets.active_connections = websocketCount;
    }

    // Update Webhook metrics
    if (webhookMetrics) {
      this.metrics.webhooks.queue_size = webhookMetrics.queue;
      this.metrics.webhooks.processing_rate = webhookMetrics.rate;
      this.metrics.webhooks.failure_rate_percent = webhookMetrics.failures;
    }

    this.metrics.timestamp = Date.now();
  }

  getMetrics(): BootstrapMetrics {
    return this.metrics;
  }

  getHealthStatus(): HealthStatus {
    const now = Date.now();
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (
      this.metrics.cpu.status === 'critical' ||
      this.metrics.memory.status === 'critical'
    ) {
      overallStatus = 'unhealthy';
    } else if (
      this.metrics.cpu.status === 'warning' ||
      this.metrics.memory.status === 'warning'
    ) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      components: {
        cpu: this.metrics.cpu.status,
        memory: this.metrics.memory.status,
        database: this.metrics.database.utilization_percent > 90 ? 'critical' : 'healthy',
        http: this.metrics.http.error_rate_percent > 5 ? 'warning' : 'healthy'
      },
      timestamp: now
    };
  }

  getScalingRecommendation(): ScalingRecommendation {
    // Recommend scale up if consistently high CPU or memory
    if (this.metrics.cpu.status === 'critical' || this.metrics.memory.status === 'critical') {
      return {
        action: 'scale-up',
        reason:
          this.metrics.cpu.status === 'critical'
            ? `CPU usage critical: ${this.metrics.cpu.percent}%`
            : `Memory usage critical: ${this.metrics.memory.percent}%`,
        priority: 'high'
      };
    }

    if (this.metrics.cpu.status === 'warning' || this.metrics.memory.status === 'warning') {
      return {
        action: 'scale-up',
        reason:
          this.metrics.cpu.status === 'warning'
            ? `CPU usage warning: ${this.metrics.cpu.percent}%`
            : `Memory usage warning: ${this.metrics.memory.percent}%`,
        priority: 'medium'
      };
    }

    // Recommend scale down if all metrics are healthy and low utilization
    if (
      this.metrics.cpu.percent < 30 &&
      this.metrics.memory.percent < 50 &&
      this.metrics.database.utilization_percent < 30 &&
      this.metrics.http.error_rate_percent < 1
    ) {
      return {
        action: 'scale-down',
        reason: 'All metrics healthy with low utilization',
        priority: 'low'
      };
    }

    return {
      action: 'none',
      reason: 'System operating normally',
      priority: 'low'
    };
  }
}

export const bootstrapMonitor = new BootstrapCapacityMonitor();

export default bootstrapMonitor;
