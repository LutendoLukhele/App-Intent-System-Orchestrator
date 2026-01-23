/**
 * Salesforce Integration Tests
 *
 * Purpose: Test Salesforce cache reads and action methods across all object types
 * Assumes: Salesforce syncs exist for Leads, Contacts, Accounts, Opportunities
 *
 * Tests:
 * - Cache reads via fetch_entity (4 object types)
 * - Creating entities (Leads, Contacts, Accounts, Opportunities)
 * - Updating entities
 * - Conversation flow with Salesforce
 * - Multi-object queries
 */

import axios from 'axios';
import { NangoService } from '../../src/services/NangoService';
import { logger } from '../../src/utils/logger';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8787';
const TEST_SALESFORCE_CONNECTION = process.env.NANGO_TEST_SALESFORCE_CONNECTION || '2afdea8f-9c5a-4555-9e88-6c440e59c037';

describe('Salesforce Integration', () => {
  let nangoService: NangoService;

  beforeAll(() => {
    nangoService = new NangoService(logger);
  });

  describe('Cache Read - Leads', () => {
    it('should fetch leads from cache', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceLead',
        { limit: 10 }
      );

      expect(result).toHaveProperty('records');
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('should have correct Lead structure', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceLead',
        { limit: 1 }
      );

      if (result.records.length > 0) {
        const lead = result.records[0];

        expect(lead).toHaveProperty('Id');
        expect(lead).toHaveProperty('Name');
        expect(lead).toHaveProperty('Email');
        expect(lead).toHaveProperty('Company');
        expect(lead).toHaveProperty('Status');
      }
    });
  });

  describe('Cache Read - Contacts', () => {
    it('should fetch contacts from cache', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceContact',
        { limit: 10 }
      );

      expect(result).toHaveProperty('records');
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('should have correct Contact structure', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceContact',
        { limit: 1 }
      );

      if (result.records.length > 0) {
        const contact = result.records[0];

        expect(contact).toHaveProperty('Id');
        expect(contact).toHaveProperty('FirstName');
        expect(contact).toHaveProperty('LastName');
        expect(contact).toHaveProperty('Email');
        expect(contact).toHaveProperty('AccountId');
      }
    });
  });

  describe('Cache Read - Accounts', () => {
    it('should fetch accounts from cache', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceAccount',
        { limit: 10 }
      );

      expect(result).toHaveProperty('records');
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('should have correct Account structure', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceAccount',
        { limit: 1 }
      );

      if (result.records.length > 0) {
        const account = result.records[0];

        expect(account).toHaveProperty('Id');
        expect(account).toHaveProperty('Name');
        expect(account).toHaveProperty('Industry');
      }
    });
  });

  describe('Cache Read - Opportunities', () => {
    it('should fetch opportunities from cache', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceOpportunity',
        { limit: 10 }
      );

      expect(result).toHaveProperty('records');
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('should have correct Opportunity structure', async () => {
      const result = await nangoService.fetchFromCache(
        'salesforce-2',
        TEST_SALESFORCE_CONNECTION,
        'SalesforceOpportunity',
        { limit: 1 }
      );

      if (result.records.length > 0) {
        const opp = result.records[0];

        expect(opp).toHaveProperty('Id');
        expect(opp).toHaveProperty('Name');
        expect(opp).toHaveProperty('StageName');
        expect(opp).toHaveProperty('Amount');
        expect(opp).toHaveProperty('CloseDate');
      }
    });
  });

  describe('Conversation Flow - Salesforce Queries', () => {
    it('should fetch leads via conversation', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my recent leads',
        sessionId: 'sf-leads-test'
      });

      expect(response.status).toBe(200);
      expect(response.data.response).toBeDefined();
      // AI should use fetch_entity with entityType: Lead
    }, 10000);

    it('should fetch contacts by account', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me all contacts at Acme Corp',
        sessionId: 'sf-contacts-test'
      });

      expect(response.status).toBe(200);
      // Should filter contacts by account name
    }, 10000);

    it('should fetch opportunities by stage', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me all opportunities in the closing stage',
        sessionId: 'sf-opps-test'
      });

      expect(response.status).toBe(200);
      // Should filter by StageName
    }, 10000);

    it('should handle follow-up questions', async () => {
      // First: Get leads
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my leads',
        sessionId: 'sf-followup'
      });

      expect(first.status).toBe(200);

      // Follow-up: Ask for details
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Tell me more about the first one',
        sessionId: 'sf-followup'
      });

      expect(second.status).toBe(200);
      // Should remember context
    }, 15000);
  });

  describe('Action Methods - create_entity', () => {
    it.skip('should create Lead', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Create a new lead named John Doe at Acme Corp with email john@acme.com',
        sessionId: 'create-lead-test'
      });

      expect(response.status).toBe(200);
      expect(response.data.response).toContain('created');
    }, 10000);

    it.skip('should create Contact with Account link', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Create a contact Jane Smith at Acme Corp',
        sessionId: 'create-contact-test'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it.skip('should create Account', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Create a new account for TechStart Inc in the software industry',
        sessionId: 'create-account-test'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it.skip('should create Opportunity', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Create a deal for Acme Corp worth $50,000 closing next month',
        sessionId: 'create-opp-test'
      });

      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Action Methods - update_entity', () => {
    it.skip('should update Lead status', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Update John Doe lead status to Qualified',
        sessionId: 'update-lead-test'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it.skip('should update Opportunity stage', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Move the Acme deal to the negotiation stage',
        sessionId: 'update-opp-test'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it.skip('should update Contact email', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Update Jane Smith email to jane.new@acme.com',
        sessionId: 'update-contact-test'
      });

      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Multi-Object Workflows', () => {
    it('should query across multiple object types', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me all accounts with open opportunities and their contacts',
        sessionId: 'multi-object-query'
      });

      expect(response.status).toBe(200);
      // Should fetch Accounts, Opportunities, and Contacts
    }, 15000);

    it('should convert lead to opportunity', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Convert the John Doe lead to an opportunity worth $25,000',
        sessionId: 'convert-lead'
      });

      expect(response.status).toBe(200);
      // Should update Lead and create Opportunity
    }, 15000);

    it('should combine Salesforce with email', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Send an email to all my leads thanking them for their interest',
        sessionId: 'sf-email-combo'
      });

      expect(response.status).toBe(200);
      // Should fetch_entity (Leads) then send_email for each
    }, 15000);
  });

  describe('Complex Filtering', () => {
    it('should filter leads by date range', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me leads created in the last 7 days',
        sessionId: 'filter-date'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it('should filter opportunities by amount', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me all opportunities worth more than $10,000',
        sessionId: 'filter-amount'
      });

      expect(response.status).toBe(200);
    }, 10000);

    it('should filter contacts by account and role', async () => {
      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me all decision makers at Acme Corp',
        sessionId: 'filter-role'
      });

      expect(response.status).toBe(200);
    }, 10000);
  });
});
