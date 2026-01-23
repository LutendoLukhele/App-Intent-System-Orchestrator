/**
 * CRMEntityCacheService
 * 
 * Manages session-scoped caching of CRM entity bodies (emails, contacts, records, etc.)
 * across conversation turns without requiring refetches.
 * 
 * Strategy:
 * - Cache entity bodies with 24h TTL (survives entire conversation session)
 * - Deduplicate identical fetch requests within same session
 * - Preserve human-readable text only (strip HTML, excessive whitespace)
 * - Maintain lightweight index in conversation history for LLM reference
 * - Support both Email (Nango Gmail) and CRM (Salesforce) entities
 */

import Redis from 'ioredis';
import winston from 'winston';
import crypto from 'crypto';

export interface CachedEntity {
  id: string;
  type: 'email' | 'contact' | 'record' | 'lead' | 'account' | 'deal';
  provider: 'gmail' | 'salesforce' | 'nango';
  from?: string;
  to?: string;
  subject?: string;
  name?: string;
  accountName?: string;
  cleanBody: string; // Human-readable text only (HTML stripped, truncated)
  bodyHash: string; // Hash of original body for dedup
  metadata: Record<string, any>;
  timestamp: number;
  sessionId: string;
}

export interface FetchDeduplicationKey {
  toolName: string;
  provider: string;
  filters: Record<string, any>;
}

export interface CachedFetchResult {
  entityIds: string[];
  resultHash: string;
  timestamp: number;
  sessionId: string;
}

export class CRMEntityCacheService {
  private redis: Redis;
  private logger: winston.Logger;
  
  private readonly ENTITY_CACHE_TTL = 24 * 60 * 60; // 24 hours
  private readonly FETCH_RESULT_TTL = 60 * 60; // 1 hour (for dedup)
  private readonly MAX_CLEAN_BODY_SIZE = 5 * 1024; // 5KB for preserved body text
  private readonly MAX_EMAILS_IN_HYDRATED_CONTEXT = 5; // Keep 5 recent in conversation

  constructor(redis: Redis) {
    this.redis = redis;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'CRMEntityCacheService' },
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Cache an entity body for the session
   * Used after fetching emails, contacts, etc. to enable reuse in follow-ups
   */
  async cacheEntity(
    sessionId: string,
    entity: Omit<CachedEntity, 'timestamp'>
  ): Promise<void> {
    const key = this.getEntityCacheKey(sessionId, entity.id);
    const cacheEntry: CachedEntity = {
      ...entity,
      timestamp: Date.now(),
    };

    try {
      await this.redis.setex(
        key,
        this.ENTITY_CACHE_TTL,
        JSON.stringify(cacheEntry)
      );
      this.logger.info('Entity cached', {
        sessionId,
        entityId: entity.id,
        type: entity.type,
        bodySize: entity.cleanBody.length,
      });
    } catch (err: any) {
      this.logger.error('Failed to cache entity', {
        sessionId,
        entityId: entity.id,
        error: err.message,
      });
    }
  }

  /**
   * Retrieve a cached entity by ID
   */
  async getEntity(sessionId: string, entityId: string): Promise<CachedEntity | null> {
    const key = this.getEntityCacheKey(sessionId, entityId);
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as CachedEntity;
    } catch (err: any) {
      this.logger.error('Failed to retrieve cached entity', {
        sessionId,
        entityId,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Batch retrieve multiple entities from cache
   */
  async getEntities(sessionId: string, entityIds: string[]): Promise<CachedEntity[]> {
    const keys = entityIds.map((id) => this.getEntityCacheKey(sessionId, id));
    try {
      const results = await this.redis.mget(...keys);
      return results
        .filter((r) => r !== null)
        .map((r) => JSON.parse(r!) as CachedEntity);
    } catch (err: any) {
      this.logger.error('Failed to batch retrieve entities', {
        sessionId,
        count: entityIds.length,
        error: err.message,
      });
      return [];
    }
  }

  /**
   * Check if a fetch request was already executed in this session
   * Used to deduplicate identical fetch_emails/fetch_entity calls
   * 
   * Strategy: Hash the tool name + provider + filters
   * If same hash seen recently, return cached entity IDs instead of refetching
   */
  async checkFetchDeduplication(
    sessionId: string,
    dedupeKey: FetchDeduplicationKey
  ): Promise<string[] | null> {
    const hashKey = this.getFetchDedupeKey(sessionId, dedupeKey);
    try {
      const cached = await this.redis.get(hashKey);
      if (!cached) return null;

      const result = JSON.parse(cached) as CachedFetchResult;
      this.logger.info('Fetch deduplication hit', {
        sessionId,
        toolName: dedupeKey.toolName,
        entityCount: result.entityIds.length,
        ageSeconds: Math.round((Date.now() - result.timestamp) / 1000),
      });
      return result.entityIds;
    } catch (err: any) {
      this.logger.warn('Fetch dedup check failed', {
        sessionId,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Record a fetch result for deduplication
   * Called after successful fetch_emails or fetch_entity to enable future reuse
   */
  async recordFetchResult(
    sessionId: string,
    dedupeKey: FetchDeduplicationKey,
    entityIds: string[]
  ): Promise<void> {
    const hashKey = this.getFetchDedupeKey(sessionId, dedupeKey);
    const result: CachedFetchResult = {
      entityIds,
      resultHash: crypto.createHash('md5').update(entityIds.join(',')).digest('hex'),
      timestamp: Date.now(),
      sessionId,
    };

    try {
      await this.redis.setex(hashKey, this.FETCH_RESULT_TTL, JSON.stringify(result));
      this.logger.info('Fetch result recorded for dedup', {
        sessionId,
        toolName: dedupeKey.toolName,
        entityCount: entityIds.length,
      });
    } catch (err: any) {
      this.logger.error('Failed to record fetch result', {
        sessionId,
        error: err.message,
      });
    }
  }

  /**
   * Extract human-readable body from email/record
   * Strips HTML, removes excessive whitespace, preserves only content
   * Capped at 5KB to avoid bloating conversation history
   */
  extractCleanBody(
    rawBody: string | undefined | null,
    bodyHtml: string | undefined | null,
    type: 'email' | 'contact' | 'record' | 'lead' | 'account' | 'deal'
  ): { cleanBody: string; bodyHash: string } {
    if (!rawBody && !bodyHtml) {
      return { cleanBody: '[No body content available]', bodyHash: '' };
    }

    // Prefer plain text over HTML
    let text = rawBody || bodyHtml || '';

    // Remove common email footers/noise
    text = this.stripEmailFooters(text);

    // Remove excessive whitespace while preserving paragraphs
    text = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    // Strip HTML tags if present
    text = text.replace(/<[^>]*>/g, '');

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Cap to max size
    if (text.length > this.MAX_CLEAN_BODY_SIZE) {
      text =
        text.substring(0, this.MAX_CLEAN_BODY_SIZE) +
        '\n[... Content truncated for conversation context. Use reuse_cached_entity to view full body.]';
    }

    const bodyHash = crypto.createHash('md5').update(text).digest('hex');

    return { cleanBody: text, bodyHash };
  }

  /**
   * Generate lightweight index entry for conversation history
   * Allows LLM to understand what cached entities are available without full bodies
   */
  generateIndexEntry(entity: CachedEntity): Record<string, any> {
    if (entity.type === 'email') {
      return {
        id: entity.id,
        type: 'email',
        from: entity.from,
        subject: entity.subject,
        timestamp: new Date(entity.timestamp).toISOString(),
        _cached: true,
        _bodySize: entity.cleanBody.length,
      };
    } else if (['contact', 'lead', 'account', 'deal', 'record'].includes(entity.type)) {
      return {
        id: entity.id,
        type: entity.type,
        name: entity.name || entity.accountName,
        provider: entity.provider,
        timestamp: new Date(entity.timestamp).toISOString(),
        _cached: true,
        _dataSize: entity.cleanBody.length,
      };
    }

    return {
      id: entity.id,
      type: entity.type,
      _cached: true,
    };
  }

  /**
   * Get recent cached entities for a type
   * Used to create lightweight index of what's available in session cache
   */
  async getRecentCachedEntities(
    sessionId: string,
    entityType: string,
    limit: number = this.MAX_EMAILS_IN_HYDRATED_CONTEXT
  ): Promise<CachedEntity[]> {
    const pattern = `crm-entity:${sessionId}:*`;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return [];

      const entities = await this.getEntities(
        sessionId,
        keys.map((k) => k.split(':')[3])
      );

      return entities
        .filter((e) => e.type === entityType)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (err: any) {
      this.logger.error('Failed to get recent cached entities', {
        sessionId,
        entityType,
        error: err.message,
      });
      return [];
    }
  }

  /**
   * Clear session cache (e.g., when user explicitly requests refresh)
   */
  async clearSessionCache(sessionId: string): Promise<void> {
    const pattern = `crm-entity:${sessionId}:*`;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.info('Session cache cleared', {
          sessionId,
          entriesRemoved: keys.length,
        });
      }
    } catch (err: any) {
      this.logger.error('Failed to clear session cache', {
        sessionId,
        error: err.message,
      });
    }
  }

  // ===== Private Helpers =====

  private getEntityCacheKey(sessionId: string, entityId: string): string {
    return `crm-entity:${sessionId}:${entityId}`;
  }

  private getFetchDedupeKey(sessionId: string, dedupeKey: FetchDeduplicationKey): string {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(dedupeKey))
      .digest('hex');
    return `fetch-dedup:${sessionId}:${hash}`;
  }

  private stripEmailFooters(text: string): string {
    // Remove common email footer patterns
    const footerPatterns = [
      /\n--+.*\n[\s\S]*/i, // Signature separator
      /Sent from.*/i,
      /Best regards.*/i,
      /unsubscribe/i,
      /manage preferences/i,
      /\|.*view.*(email|message).*/i,
      /©.*google/i,
      /you received this email.*/i,
    ];

    let cleaned = text;
    for (const pattern of footerPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned;
  }

  private decodeHtmlEntities(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(htmlEntities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }
    return decoded;
  }
}
