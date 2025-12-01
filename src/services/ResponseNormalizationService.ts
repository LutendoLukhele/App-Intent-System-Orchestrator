// src/services/ResponseNormalizationService.ts

import winston from 'winston';

/**
 * Normalizes API responses from Nango for safe LLM consumption.
 * Keeps full data for client/storage, but cleans and caps verbose fields for LLM context.
 * 
 * Strategy: Smart cleaning of email bodies (remove HTML, cap text, strip footers),
 * while preserving metadata and cleaned body text so LLM can selectively use it.
 */

export interface TruncationMetadata {
  was_truncated: boolean;
  original_size_bytes: number;
  normalized_size_bytes: number;
  fields_removed: string[];
  reason: string;
}

export class ResponseNormalizationService {
  private logger: winston.Logger;
  private readonly MAX_LLM_CONTEXT_SIZE = 50 * 1024; // 50KB for LLM context
  private readonly EMAIL_BODY_REMOVAL_THRESHOLD = 1024; // Remove body_text/body_html if > 1KB

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'ResponseNormalizationService' },
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Normalizes response for LLM consumption based on tool type.
   * Original response is preserved for client; normalized version used for LLM context.
   * 
   * For emails specifically:
   * - Keeps body_text but cleans it (removes HTML tags, excessive whitespace, footer noise)
   * - Caps body_text to 3KB (preserves main content, flags if truncated)
   * - Removes body_html entirely (too verbose and not needed when body_text is cleaned)
   * - Keeps all metadata (from, to, subject, timestamps, etc.)
   * - LLM can selectively use body_text to understand email intent
   * - If LLM needs full body, app can implement fetch_full_email_body action
   * 
   * @param toolName - Name of the tool (e.g., 'fetch_emails', 'fetch_entity')
   * @param response - Full API response from Nango
   * @returns { originalResponse, llmResponse, truncationMetadata }
   */
  public normalizeForLLM(
    toolName: string,
    response: any
  ): {
    originalResponse: any;
    llmResponse: any;
    truncationMetadata: TruncationMetadata;
  } {
    const originalSize = JSON.stringify(response).length;
    let normalizedResponse = JSON.parse(JSON.stringify(response)); // Deep clone
    const fieldsRemoved: string[] = [];

    // Route to appropriate normalization logic
    if (toolName === 'fetch_emails') {
      normalizedResponse = this.normalizeEmailResponse(normalizedResponse, fieldsRemoved);
    } else if (
      toolName === 'fetch_entity' ||
      toolName === 'fetch_entities' ||
      toolName === 'search_entities'
    ) {
      normalizedResponse = this.normalizeCRMResponse(normalizedResponse, fieldsRemoved);
    } else if (toolName.includes('calendar') || toolName.includes('event')) {
      normalizedResponse = this.normalizeCalendarResponse(normalizedResponse, fieldsRemoved);
    }

    const normalizedSize = JSON.stringify(normalizedResponse).length;
    const wasChanged = fieldsRemoved.length > 0;

    const truncationMetadata: TruncationMetadata = {
      was_truncated: wasChanged,
      original_size_bytes: originalSize,
      normalized_size_bytes: normalizedSize,
      fields_removed: fieldsRemoved,
      reason: wasChanged
        ? `LLM optimization: cleaned and capped body text, removed HTML and footers`
        : 'No normalization needed',
    };

    if (wasChanged) {
      const reductionPercent = (
        ((originalSize - normalizedSize) / originalSize) *
        100
      ).toFixed(2);
      this.logger.info('Response normalized for LLM', {
        toolName,
        originalSize,
        normalizedSize,
        reductionPercent: `${reductionPercent}%`,
        fieldsRemoved,
      });
    }

    return {
      originalResponse: response,
      llmResponse: normalizedResponse,
      truncationMetadata,
    };
  }

  /**
   * Email-specific normalization: keeps body_text but cleaned and capped,
   * removes body_html entirely, keeps metadata and preview.
   */
  private normalizeEmailResponse(response: any, fieldsRemoved: string[]): any {
    if (!response) return response;

    // Handle array of emails
    if (Array.isArray(response)) {
      return response.map((email) => this.normalizeEmailObject(email, fieldsRemoved));
    }

    // Handle single email or paginated response
    if (response.data && Array.isArray(response.data)) {
      response.data = response.data.map((email: any) =>
        this.normalizeEmailObject(email, fieldsRemoved)
      );
      return response;
    }

    // Single email object
    return this.normalizeEmailObject(response, fieldsRemoved);
  }

  /**
   * Cleans email object: keeps body_text but capped and cleaned of excessive formatting,
   * removes body_html, keeps metadata.
   */
  private normalizeEmailObject(email: any, fieldsRemoved: string[]): any {
    if (!email || typeof email !== 'object') return email;

    const normalized = { ...email };
    const MAX_BODY_LENGTH = 3000; // Keep up to 3KB of cleaned body text for LLM context

    // Remove HTML body entirely (too verbose for LLM)
    if (normalized.body_html) {
      if (!fieldsRemoved.includes('body_html')) fieldsRemoved.push('body_html');
      delete normalized.body_html;
    }

    // Keep body_text but clean and cap it
    if (normalized.body_text && typeof normalized.body_text === 'string') {
      // Clean excessive whitespace and escape sequences
      let cleanedBody = normalized.body_text
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\n\n\n+/g, '\n\n') // Remove excessive blank lines
        .replace(/[ \t]+/g, ' ') // Collapse tabs and multiple spaces
        .trim();

      // Remove common email footers and unsubscribe links (noise for LLM)
      cleanedBody = this.stripEmailFooters(cleanedBody);

      // Cap to MAX_BODY_LENGTH
      if (cleanedBody.length > MAX_BODY_LENGTH) {
        const truncated = cleanedBody.substring(0, MAX_BODY_LENGTH);
        normalized.body_text = truncated + '\n\n[... Email body truncated for LLM context. Use fetch_full_email_body to retrieve full content.]';
        normalized._body_truncated = true;
        normalized._original_body_length = email.body_text.length;
        if (!fieldsRemoved.includes('body_text (truncated)')) 
          fieldsRemoved.push('body_text (truncated)');
      } else {
        normalized.body_text = cleanedBody;
      }
    }

    // Keep preview (usually short summary), but truncate if massive
    if (normalized.preview && typeof normalized.preview === 'string') {
      if (normalized.preview.length > 500) {
        normalized.preview = normalized.preview.substring(0, 500) + '...[truncated]';
      }
    }

    // Keep custom headers but remove overly verbose ones
    if (normalized.headers && typeof normalized.headers === 'object') {
      const headersSize = JSON.stringify(normalized.headers).length;
      if (headersSize > 5 * 1024) {
        // If headers > 5KB, just keep the keys as an array
        if (!fieldsRemoved.includes('headers (summarized)'))
          fieldsRemoved.push('headers (summarized)');
        normalized.headers = Object.keys(normalized.headers);
      }
    }

    return normalized;
  }

  /**
   * Strips common email footers, unsubscribe links, and signature blocks
   * to reduce noise for LLM while keeping main content.
   */
  private stripEmailFooters(body: string): string {
    // Patterns to remove
    const patterns = [
      /unsubscribe[^\n]*/gi, // Unsubscribe links
      /manage preferences[^\n]*/gi, // Preference management
      /^--\s*\n.+/gm, // Signature separator and signature
      /^\d{4}-\d{2}-\d{2}.+sent from.+/gim, // "Sent from" metadata
      /this is a \[?automated\]? email.+/gi, // Automated email disclaimers
    ];

    let cleaned = body;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * CRM-specific normalization: strips very long description/notes fields.
   */
  private normalizeCRMResponse(response: any, fieldsRemoved: string[]): any {
    if (!response) return response;

    // Handle array of entities
    if (Array.isArray(response)) {
      return response.map((entity) => this.normalizeCRMEntity(entity, fieldsRemoved));
    }

    // Handle paginated response
    if (response.data && Array.isArray(response.data)) {
      response.data = response.data.map((entity: any) =>
        this.normalizeCRMEntity(entity, fieldsRemoved)
      );
      return response;
    }

    // Single entity
    return this.normalizeCRMEntity(response, fieldsRemoved);
  }

  /**
   * Truncates very long description/notes fields in CRM entities.
   */
  private normalizeCRMEntity(entity: any, fieldsRemoved: string[]): any {
    if (!entity || typeof entity !== 'object') return entity;

    const normalized = { ...entity };
    const verboseFields = [
      'description',
      'notes',
      'long_description',
      'body',
      'content',
    ];

    for (const field of verboseFields) {
      if (
        normalized[field] &&
        typeof normalized[field] === 'string' &&
        normalized[field].length > 2 * 1024
      ) {
        // Keep first 500 chars, then summarize
        if (!fieldsRemoved.includes(`${field} (truncated)`))
          fieldsRemoved.push(`${field} (truncated)`);
        normalized[field] =
          normalized[field].substring(0, 500) +
          `\n...[${normalized[field].length - 500} more characters truncated for LLM context]`;
      }
    }

    return normalized;
  }

  /**
   * Calendar-specific normalization: keeps most fields as they're usually compact.
   */
  private normalizeCalendarResponse(response: any, fieldsRemoved: string[]): any {
    if (!response) return response;

    // Calendar events are usually small, minimal normalization needed
    // Just remove any embedded raw HTML if present
    if (Array.isArray(response)) {
      return response.map((event) => {
        if (event.description && event.description.length > 1024) {
          if (!fieldsRemoved.includes('event_description (truncated)'))
            fieldsRemoved.push('event_description (truncated)');
          event.description = event.description.substring(0, 500) + '...[truncated]';
        }
        return event;
      });
    }

    return response;
  }

  /**
   * Utility: Get size estimate for logging without full stringification.
   */
  public estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }
}
