// src/services/SessionAwareWarmupManager.ts

import winston from 'winston';
import Redis from 'ioredis';
import { CONFIG } from '../config';

/**
 * SessionAwareWarmupManager: Lightweight provider connection warmer
 * 
 * Goals:
 * - Warm EACH provider connection ONCE per session (eliminates first-fetch latency)
 * - Minimal state tracking (just "warmed" status, no data mirroring)
 * - Real lightweight action that can be triggered programmatically
 * - Session-scoped: different sessions warm independently
 * 
 * Strategy:
 * - Track warmed state in Redis with session key (auto-expires after 30 min)
 * - Perform real lightweight API calls (not mocks)
 * - Can be queued as implicit action before user-triggered actions
 * - Logs warmup status for debugging without storing large data
 * 
 * === USAGE IN TOOLORCHESTRATOR ===
 * 
 * 1. Check if provider needs warming:
 *    const needsWarmup = await warmupManager.isWarmed(sessionId, 'google', connectionId);
 *    if (!needsWarmup) {
 *      await toolOrchestrator.executeWarmupAction('google', connectionId, 'google');
 *    }
 * 
 * 2. Or get all providers needing warmup:
 *    const toWarm = await warmupManager.getProvidersNeedingWarmup(sessionId, {
 *      'google': connectionId1,
 *      'salesforce': connectionId2
 *    });
 *    // Execute warmups in parallel before user actions
 * 
 * === NO PERSISTENT SYNC OR CACHING ===
 * - Redis keys auto-expire after 30 minutes
 * - No background jobs or long-running tasks
 * - No data mirroring or continuous polling
 * - Just lightweight real API calls to validate connectivity
 */

export interface WarmupStatus {
  provider: string;
  connectionId: string;
  warmed: boolean;
  warmedAt: number;
  duration: number;
  error?: string;
}

export interface WarmupAction {
  id: string;
  type: 'warmup';
  provider: string;
  connectionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: WarmupStatus;
}

export class SessionAwareWarmupManager {
  private logger: winston.Logger;
  private redis: Redis;
  private readonly WARMUP_CACHE_TTL = 30 * 60; // 30 minutes per session
  private readonly WARMUP_PREFIX = 'warmup:';

  constructor(redisClient?: Redis) {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'SessionAwareWarmupManager' },
      transports: [new winston.transports.Console()],
    });

    this.redis = redisClient || new Redis(CONFIG.REDIS_URL!);
  }

  /**
   * Check if a provider is already warmed in this session.
   * Returns true if warmed within cache TTL.
   */
  public async isWarmed(
    sessionId: string,
    provider: string,
    connectionId: string
  ): Promise<boolean> {
    const key = this.buildCacheKey(sessionId, provider, connectionId);
    const cached = await this.redis.get(key);
    return cached !== null;
  }

  /**
   * Mark a provider as warmed in this session.
   */
  private async setWarmed(
    sessionId: string,
    provider: string,
    connectionId: string,
    duration: number
  ): Promise<void> {
    const key = this.buildCacheKey(sessionId, provider, connectionId);
    const data = JSON.stringify({
      warmedAt: Date.now(),
      duration,
    });
    await this.redis.setex(key, this.WARMUP_CACHE_TTL, data);
  }

  /**
   * Get list of providers that need warming for this session.
   */
  public async getProvidersNeedingWarmup(
    sessionId: string,
    connectionIds: Record<string, string> // { provider: connectionId }
  ): Promise<Array<{ provider: string; connectionId: string }>> {
    const needsWarmup: Array<{ provider: string; connectionId: string }> = [];

    for (const [provider, connectionId] of Object.entries(connectionIds)) {
      const warmed = await this.isWarmed(sessionId, provider, connectionId);
      if (!warmed) {
        needsWarmup.push({ provider, connectionId });
      }
    }

    return needsWarmup;
  }

  /**
   * Perform actual warmup for a provider via Nango.
   * Results are cached/suppressed and NOT broadcast to client.
   * This is a suppressed action - only tracking success/failure for connection health.
   */
  public async warmupProvider(
    sessionId: string,
    provider: string,
    connectionId: string,
    performWarmup: () => Promise<void> // Callback to Nango action trigger
  ): Promise<WarmupStatus> {
    const startTime = Date.now();
    const status: WarmupStatus = {
      provider,
      connectionId,
      warmed: false,
      warmedAt: 0,
      duration: 0,
    };

    try {
      this.logger.info('Starting provider warmup via Nango', {
        sessionId,
        provider,
        connectionId: '***',
        note: 'Warmup action result will be cached, not broadcast',
      });

      // Execute the real Nango warmup callback
      // Results are suppressed on Nango side and not used/broadcast
      await performWarmup();

      const duration = Date.now() - startTime;
      status.warmed = true;
      status.warmedAt = Date.now();
      status.duration = duration;

      // Cache the warmup status for this session (auto-expires)
      await this.setWarmed(sessionId, provider, connectionId, duration);

      this.logger.info('Provider warmup via Nango successful', {
        sessionId,
        provider,
        duration,
        connectionId: '***',
        note: 'Connection ready for user actions',
      });

      return status;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      status.warmed = false;
      status.duration = duration;
      status.error = error.message || 'Unknown warmup error';

      this.logger.warn('Provider warmup via Nango failed', {
        sessionId,
        provider,
        error: error.message,
        duration,
        connectionId: '***',
        note: 'Will retry on next user action',
      });

      return status;
    }
  }

  /**
   * Create a warmup action for tool orchestration.
   * This can be queued automatically before user-visible actions.
   */
  public createWarmupAction(
    provider: string,
    connectionId: string,
    actionId?: string
  ): WarmupAction {
    return {
      id: actionId || `warmup_${provider}_${Date.now()}`,
      type: 'warmup',
      provider,
      connectionId,
      status: 'pending',
    };
  }

  /**
   * Build cache key for this session + provider combination.
   */
  private buildCacheKey(
    sessionId: string,
    provider: string,
    connectionId: string
  ): string {
    return `${this.WARMUP_PREFIX}${sessionId}:${provider}:${connectionId}`;
  }

  /**
   * Clear warmup cache for a session (e.g., on reconnection).
   */
  public async clearSessionWarmup(sessionId: string): Promise<void> {
    const pattern = `${this.WARMUP_PREFIX}${sessionId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.info('Cleared warmup cache for session', { sessionId, keysCleared: keys.length });
    }
  }

  /**
   * Utility: Get warmup statistics for debugging.
   */
  public async getWarmupStats(sessionId: string): Promise<Record<string, any>> {
    const pattern = `${this.WARMUP_PREFIX}${sessionId}:*`;
    const keys = await this.redis.keys(pattern);
    const stats: Record<string, any> = {
      sessionId,
      providersWarmed: keys.length,
      providers: [],
    };

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        stats.providers.push({
          key: key.replace(this.WARMUP_PREFIX, ''),
          ...parsed,
        });
      }
    }

    return stats;
  }

  /**
   * Clear all warmup caches (for testing or reset scenarios).
   */
  public async clearAllWarmupCaches(): Promise<void> {
    const pattern = `${this.WARMUP_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.info('Cleared all warmup caches', { keysCleared: keys.length });
    }
  }
}
