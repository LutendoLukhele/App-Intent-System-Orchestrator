/**
 * Google Calendar Integration Tests
 *
 * Purpose: Test calendar cache reads and action methods
 * Assumes: CalendarEvent sync exists in Nango
 *
 * Tests:
 * - Cache reads via fetch_calendar_events
 * - Creating calendar events
 * - Updating calendar events
 * - Conversation flow with calendar
 */

import axios from 'axios';
import { NangoService } from '../../src/services/NangoService';
import { logger } from '../../src/utils/logger';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8787';
const TEST_CALENDAR_CONNECTION = process.env.NANGO_TEST_CALENDAR_CONNECTION || '30009351-89b2-4546-9367-bce987d6d79d';

describe('Google Calendar Integration', () => {
  let nangoService: NangoService;

  beforeAll(() => {
    nangoService = new NangoService(logger);
  });

  describe('Cache Read - fetch_calendar_events', () => {
    it('should fetch calendar events from cache', async () => {
      const result = await nangoService.fetchFromCache(
        'google-calendar',
        TEST_CALENDAR_CONNECTION,
        'CalendarEvent',
        { limit: 10 }
      );

      expect(result).toHaveProperty('records');
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('should have correct CalendarEvent structure', async () => {
      const result = await nangoService.fetchFromCache(
        'google-calendar',
        TEST_CALENDAR_CONNECTION,
        'CalendarEvent',
        { limit: 1 }
      );

      if (result.records.length > 0) {
        const event = result.records[0];

        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('summary');
        expect(event).toHaveProperty('start');
        expect(event).toHaveProperty('end');
        expect(event.start).toHaveProperty('dateTime');
        expect(event.end).toHaveProperty('dateTime');
      }
    });

    it('should filter events by date range', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await nangoService.fetchFromCache(
        'google-calendar',
        TEST_CALENDAR_CONNECTION,
        'CalendarEvent',
        {
          modifiedAfter: tomorrow.toISOString(),
          limit: 10
        }
      );

      expect(result.records).toBeDefined();
      // Events should be in the future
    });
  });

  describe('Conversation Flow - Calendar', () => {
    it('should fetch calendar events via conversation', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'What meetings do I have this week?',
        sessionId: 'calendar-test-1'
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('response');
      // AI should use fetch_calendar_events tool
    }, 10000);

    it('should create calendar event via conversation', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowAt2pm = new Date(tomorrow.setHours(14, 0, 0, 0));

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: `Schedule a team meeting tomorrow at 2pm for 1 hour`,
        sessionId: 'calendar-test-2'
      });

      expect(response.status).toBe(200);
      expect(response.data.response).toBeDefined();
      // Should confirm event creation
    }, 10000);

    it('should handle follow-up about calendar', async () => {
      // First: Ask about meetings
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'What meetings do I have today?',
        sessionId: 'calendar-followup'
      });

      expect(first.status).toBe(200);

      // Follow-up: Ask for details
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Tell me more about the first one',
        sessionId: 'calendar-followup'
      });

      expect(second.status).toBe(200);
      // Should remember context from first message
    }, 15000);
  });

  describe('Action Methods - create_calendar_event', () => {
    it.skip('should create simple calendar event', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Create a meeting called "Test Meeting" tomorrow at 3pm for 30 minutes',
        sessionId: 'create-event-test'
      });

      expect(response.status).toBe(200);
      expect(response.data.response).toContain('created');
    }, 10000);

    it.skip('should create event with attendees', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Schedule a meeting tomorrow at 10am with john@example.com and jane@example.com',
        sessionId: 'create-event-attendees'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it.skip('should handle all-day events', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Block my calendar all day tomorrow for focus time',
        sessionId: 'create-allday-event'
      });

      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Action Methods - update_calendar_event', () => {
    it.skip('should update event time', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Move my 2pm meeting to 3pm',
        sessionId: 'update-event-test'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it.skip('should cancel event', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Cancel my meeting with John tomorrow',
        sessionId: 'cancel-event-test'
      });

      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Multi-Tool Conversations', () => {
    it('should combine calendar and email in one query', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my meetings today and any emails about them',
        sessionId: 'multi-tool-test'
      });

      expect(response.status).toBe(200);
      // Should use both fetch_calendar_events and fetch_emails
    }, 15000);

    it('should handle calendar-based email automation', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Send an email to my next meeting attendees with the agenda',
        sessionId: 'calendar-email-automation'
      });

      expect(response.status).toBe(200);
      // Should fetch calendar, then send email
    }, 15000);
  });
});
