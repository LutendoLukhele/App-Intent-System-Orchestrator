/**
 * ToolExecutionDeduplicationService
 * 
 * Prevents redundant tool executions within a conversation session.
 * When a user asks for the same data (e.g., "Show emails from Sarah" twice),
 * this service detects the duplicate and returns cached results instead of refetching.
 * 
 * Works by:
 * 1. Comparing fetch arguments (tool name + filters)
 * 2. Checking if this exact fetch was done in the current session
 * 3. Returning cached entity IDs if found (within 1h window)
 * 4. Otherwise allowing normal execution and recording the result
 */

import winston from 'winston';
import { CRMEntityCacheService } from '../data/CRMEntityCacheService';

export interface ToolExecutionRequest {
  toolName: string;
  provider: string;
  arguments: Record<string, any>;
}

export class ToolExecutionDeduplicationService {
  private logger: winston.Logger;

  constructor(private entityCache: CRMEntityCacheService) {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'ToolExecutionDeduplicationService' },
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Check if this tool execution has been done recently in this session
   * Returns cached entity IDs if duplicate found, null if should proceed normally
   */
  async checkForDuplicate(
    sessionId: string,
    request: ToolExecutionRequest
  ): Promise<string[] | null> {
    // Only deduplicate read-only tools (fetch operations)
    if (!this.isFetchOperation(request.toolName)) {
      return null;
    }

    // Build dedup key from request
    const dedupeKey = {
      toolName: request.toolName,
      provider: request.provider,
      filters: this.extractFilters(request.toolName, request.arguments),
    };

    // Check cache
    const cachedEntityIds = await this.entityCache.checkFetchDeduplication(
      sessionId,
      dedupeKey
    );

    if (cachedEntityIds && cachedEntityIds.length > 0) {
      this.logger.info('Duplicate fetch detected and reused', {
        sessionId,
        toolName: request.toolName,
        cachedCount: cachedEntityIds.length,
      });
      return cachedEntityIds;
    }

    return null;
  }

  /**
   * Record the result of a tool execution for future dedup checks
   * Called after successful fetch to enable reuse if same request comes in again
   */
  async recordExecution(
    sessionId: string,
    request: ToolExecutionRequest,
    resultEntityIds: string[]
  ): Promise<void> {
    if (!this.isFetchOperation(request.toolName)) {
      return;
    }

    const dedupeKey = {
      toolName: request.toolName,
      provider: request.provider,
      filters: this.extractFilters(request.toolName, request.arguments),
    };

    await this.entityCache.recordFetchResult(sessionId, dedupeKey, resultEntityIds);
  }

  /**
   * Determine if this tool is a read-only fetch operation
   * (as opposed to write operations like create/update)
   */
  private isFetchOperation(toolName: string): boolean {
    const fetchTools = [
      'fetch_emails',
      'fetch_entity',
      'fetch_entities',
      'search_entities',
      'fetch_contacts',
      'fetch_deals',
      'fetch_accounts',
    ];
    return fetchTools.includes(toolName);
  }

  /**
   * Extract comparable filters from tool arguments
   * This is what uniquely identifies a fetch request
   * 
   * For emails: from, to, subject, labels, date range
   * For CRM: entity_type, filters (name, status, owner, etc.)
   */
  private extractFilters(toolName: string, args: Record<string, any>): Record<string, any> {
    const input = args.input || args;

    if (toolName === 'fetch_emails') {
      return {
        operation: input.operation,
        from: input.filters?.from,
        to: input.filters?.to,
        subject: input.filters?.subject,
        labels: input.filters?.labels ? input.filters.labels.sort().join(',') : undefined,
        isRead: input.filters?.isRead,
        dateRange: input.filters?.dateRange,
        limit: input.filters?.limit || input.limit || 10,
      };
    }

    if (toolName === 'fetch_entity' || toolName === 'fetch_entities') {
      return {
        operation: input.operation,
        entityType: input.entityType,
        filters: input.filters ? JSON.stringify(input.filters) : undefined,
        limit: input.limit || 20,
      };
    }

    if (toolName === 'search_entities') {
      return {
        operation: input.operation,
        entityType: input.entityType,
        query: input.query,
        limit: input.limit || 20,
      };
    }

    // For unknown tools, compare entire input
    return JSON.parse(JSON.stringify(input));
  }
}
