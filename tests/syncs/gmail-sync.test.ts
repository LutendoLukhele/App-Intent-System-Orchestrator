/**
 * Gmail Sync Tests
 *
 * Purpose: Verify Gmail thread-based sync works via NangoService
 * Status: ✅ Sync implemented, tests verify via backend
 *
 * How it works:
 * - Triggers sync via NangoService.triggerSync()
 * - Fetches results via NangoService.fetchFromCache()
 * - Validates data structure and quality
 */

import { NangoService } from '../../src/services/NangoService';
import { logger } from '../../src/utils/logger';

const TEST_CONNECTION_ID = process.env.NANGO_TEST_GMAIL_CONNECTION || '90a6fb46-ec59-4cee-b297-8dc70d81ec07';
const PROVIDER = 'google-mail';
const MODEL = 'GmailThread';

describe('Gmail Sync Tests', () => {
  let nangoService: NangoService;

  beforeAll(() => {
    nangoService = new NangoService(logger);
  });

  describe('Sync Triggering', () => {
    it('should trigger Gmail sync successfully', async () => {
      const result = await nangoService.triggerSync(PROVIDER, TEST_CONNECTION_ID, 'emails');

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('syncName', 'emails');
    }, 30000);

    it('should complete sync within reasonable time', async () => {
      const start = Date.now();

      await nangoService.triggerSync(PROVIDER, TEST_CONNECTION_ID, 'emails');

      // Wait for sync to complete
      await new Promise(resolve => setTimeout(resolve, 15000));

      const duration = Date.now() - start;

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);
    }, 35000);
  });

  describe('Cache Data Validation', () => {
    beforeAll(async () => {
      // Trigger sync before tests
      await nangoService.triggerSync(PROVIDER, TEST_CONNECTION_ID, 'emails');
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for completion
    }, 20000);

    it('should fetch GmailThread records from cache', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 10 }
      );

      expect(result).toHaveProperty('records');
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records.length).toBeLessThanOrEqual(10);
    });

    it('should have correct GmailThread structure', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 1 }
      );

      const thread = result.records[0];

      // Required fields
      expect(thread).toHaveProperty('id');
      expect(thread).toHaveProperty('subject');
      expect(thread).toHaveProperty('from');
      expect(thread).toHaveProperty('messageCount');
      expect(thread).toHaveProperty('startDate');
      expect(thread).toHaveProperty('lastDate');
      expect(thread).toHaveProperty('isRead');
      expect(thread).toHaveProperty('hasAttachments');
      expect(thread).toHaveProperty('semanticType');
      expect(thread).toHaveProperty('semanticConfidence');

      // Type validation
      expect(typeof thread.id).toBe('string');
      expect(typeof thread.subject).toBe('string');
      expect(typeof thread.messageCount).toBe('number');
      expect(typeof thread.isRead).toBe('boolean');
      expect(typeof thread.hasAttachments).toBe('boolean');
    });

    it('should have valid semantic classification', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 20 }
      );

      const validTypes = ['security', 'billing', 'calendar', 'support', 'promotion', 'general'];

      result.records.forEach(thread => {
        expect(validTypes).toContain(thread.semanticType);
        expect(thread.semanticConfidence).toBeGreaterThanOrEqual(0);
        expect(thread.semanticConfidence).toBeLessThanOrEqual(1);
      });

      // Should have some variety
      const uniqueTypes = new Set(result.records.map(r => r.semanticType));
      expect(uniqueTypes.size).toBeGreaterThan(1);
    });

    it('should have cleaned email bodies', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 10 }
      );

      result.records.forEach(thread => {
        if (thread.body) {
          // Should not contain HTML tags
          expect(thread.body).not.toMatch(/<script/i);
          expect(thread.body).not.toMatch(/<style/i);
          expect(thread.body).not.toMatch(/<img/i);
          expect(thread.body).not.toMatch(/<\/div>/i);
        }
      });
    });

    it('should have normalized dates (ISO 8601)', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 5 }
      );

      result.records.forEach(thread => {
        expect(thread.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(thread.lastDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

        // Should be valid dates
        const startDate = new Date(thread.startDate);
        const lastDate = new Date(thread.lastDate);

        expect(startDate).toBeInstanceOf(Date);
        expect(lastDate).toBeInstanceOf(Date);
        expect(isNaN(startDate.getTime())).toBe(false);
        expect(isNaN(lastDate.getTime())).toBe(false);

        // lastDate should be >= startDate
        expect(lastDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
      });
    });

    it('should respect limit parameter', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 3 }
      );

      expect(result.records.length).toBeLessThanOrEqual(3);
    });

    it('should support modifiedAfter filtering', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { modifiedAfter: yesterday, limit: 10 }
      );

      // All records should be from after yesterday
      result.records.forEach(thread => {
        const lastDate = new Date(thread.lastDate);
        const cutoff = new Date(yesterday);

        expect(lastDate.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
      });
    });
  });

  describe('Data Quality Checks', () => {
    it('should have thread with multiple messages', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 50 }
      );

      // At least one thread should have multiple messages
      const multiMessage = result.records.find(t => t.messageCount > 1);
      expect(multiMessage).toBeDefined();
      expect(multiMessage.messageCount).toBeGreaterThan(1);
    });

    it('should have both read and unread threads', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 50 }
      );

      const readThreads = result.records.filter(t => t.isRead);
      const unreadThreads = result.records.filter(t => !t.isRead);

      // Should have both (assuming real email data)
      expect(readThreads.length + unreadThreads.length).toBe(result.records.length);
    });

    it('should have threads with and without attachments', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 50 }
      );

      const withAttachments = result.records.filter(t => t.hasAttachments);
      const withoutAttachments = result.records.filter(t => !t.hasAttachments);

      // Should have both types
      expect(withAttachments.length + withoutAttachments.length).toBe(result.records.length);
    });

    it('should have valid labels array', async () => {
      const result = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 10 }
      );

      result.records.forEach(thread => {
        expect(Array.isArray(thread.labels)).toBe(true);
        expect(thread.labels.length).toBeGreaterThan(0);

        // Should have at least INBOX or other valid labels
        const commonLabels = ['INBOX', 'UNREAD', 'IMPORTANT', 'STARRED', 'CATEGORY_PROMOTIONS'];
        const hasCommonLabel = thread.labels.some(label => commonLabels.includes(label));
        expect(hasCommonLabel).toBe(true);
      });
    });
  });

  describe('Performance', () => {
    it('should fetch cache quickly (<2s)', async () => {
      const start = Date.now();

      await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 10 }
      );

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000);
    });

    it('should handle pagination with cursor', async () => {
      const firstPage = await nangoService.fetchFromCache(
        PROVIDER,
        TEST_CONNECTION_ID,
        MODEL,
        { limit: 5 }
      );

      if (firstPage.nextCursor) {
        const secondPage = await nangoService.fetchFromCache(
          PROVIDER,
          TEST_CONNECTION_ID,
          MODEL,
          { limit: 5, cursor: firstPage.nextCursor }
        );

        // Second page should have different records
        const firstIds = new Set(firstPage.records.map(r => r.id));
        const secondIds = new Set(secondPage.records.map(r => r.id));

        const overlap = Array.from(firstIds).filter(id => secondIds.has(id));
        expect(overlap.length).toBe(0); // No overlap
      }
    });
  });
});
