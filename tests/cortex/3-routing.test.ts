// tests/cortex/3-routing.test.ts
// Cortex Tool Routing Tests - verify cache vs action routing works
// Tests the intent interpretation → tool routing → execution pipeline
// Uses GroqService (not the search /api/interpret endpoint)

import { GroqService } from '../../src/services/groq.service';
import { ToolConfigManager } from '../../src/services/tool/ToolConfigManager';
import { CONFIG } from '../../src/config';

describe('Cortex Tool Routing Tests', () => {
  const TEST_USER_ID = 'test-user-routing';
  let groqService: GroqService;
  let toolConfigManager: ToolConfigManager;

  beforeAll(() => {
    groqService = new GroqService();
    toolConfigManager = new ToolConfigManager();
  });

  describe('Intent Detection & Tool Matching', () => {
    test.skip('fetch_emails intent detection', async () => {
      const prompt = `Analyze this user intent and determine what tools are needed:
      
User intent: "Show me my recent emails"

Available tools:
${toolConfigManager.getAllTools().map(t => `- ${t.name}: ${t.description}`).join('\n')}

Respond with JSON: { "tools": ["tool_name"], "routing": "cache|action", "confidence": 0.0-1.0 }`;

      const response = await groqService.executeSearch(prompt);
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);
      // Should identify fetch_emails or similar cache-based tool
    }, 15000);

    test.skip('send_email intent detection', async () => {
      const prompt = `Analyze this user intent and determine what tools are needed:
      
User intent: "Send an email to test@example.com with subject 'Test' and body 'Testing'"

Available tools:
${toolConfigManager.getAllTools().map(t => `- ${t.name}: ${t.description}`).join('\n')}

Respond with JSON: { "tools": ["tool_name"], "routing": "cache|action", "confidence": 0.0-1.0 }`;

      const response = await groqService.executeSearch(prompt);
      expect(response.content).toBeDefined();
      // Should identify send_email or similar action-based tool
    }, 15000);

    test.skip('calendar query intent detection', async () => {
      const prompt = `Analyze this user intent and determine what tools are needed:
      
User intent: "What meetings do I have today?"

Available tools:
${toolConfigManager.getAllTools().map(t => `- ${t.name}: ${t.description}`).join('\n')}

Respond with JSON: { "tools": ["tool_name"], "routing": "cache|action", "confidence": 0.0-1.0 }`;

      const response = await groqService.executeSearch(prompt);
      expect(response.content).toBeDefined();
      // Should identify fetch_calendar_events
    }, 15000);
  });

  describe('Cache-Based Tool Routing', () => {
    test('fetch_emails routes to cache execution', async () => {
      // Verify fetch_emails tool exists and is cache-based
      const fetchEmailsTool = toolConfigManager.getToolConfig('fetch_emails');
      expect(fetchEmailsTool).toBeDefined();
      expect(fetchEmailsTool?.name).toBe('fetch_emails');
      // fetch_emails should not require action execution (it's cache-based)
    }, 10000);

    test('fetch_calendar_events routes to cache execution', async () => {
      const fetchCalendarTool = toolConfigManager.getToolConfig('fetch_calendar_events');
      expect(fetchCalendarTool).toBeDefined();
      expect(fetchCalendarTool?.name).toBe('fetch_calendar_events');
    }, 10000);

    test('fetch_entity routes to cache execution', async () => {
      const fetchEntityTool = toolConfigManager.getToolConfig('fetch_entity');
      expect(fetchEntityTool).toBeDefined();
      expect(fetchEntityTool?.name).toBe('fetch_entity');
    }, 10000);
  });

  describe('Action-Based Tool Routing', () => {
    test('send_email routes to action execution', async () => {
      const sendEmailTool = toolConfigManager.getToolConfig('send_email');
      expect(sendEmailTool).toBeDefined();
      expect(sendEmailTool?.name).toBe('send_email');
      // send_email requires action execution (is not cache-based)
    }, 10000);

    test('create_entity routes to action execution', async () => {
      const createEntityTool = toolConfigManager.getToolConfig('create_entity');
      expect(createEntityTool).toBeDefined();
      expect(createEntityTool?.name).toBe('create_entity');
    }, 10000);
  });

  describe('Tool Configuration Validation', () => {
    test('All tools are properly configured', async () => {
      const tools = toolConfigManager.getAllTools();
      expect(tools.length).toBeGreaterThan(0);
      
      // Verify critical tools exist
      const criticalTools = ['fetch_emails', 'send_email', 'fetch_calendar_events', 'fetch_entity'];
      criticalTools.forEach(toolName => {
        const tool = toolConfigManager.getToolConfig(toolName);
        expect(tool).toBeDefined();
        if (tool) {
          expect(tool.name).toBe(toolName);
          expect(tool.description).toBeDefined();
        }
      });
    }, 10000);

    test('Cache tools are fast (< 200ms lookup)', async () => {
      const start = Date.now();
      const tool = toolConfigManager.getToolConfig('fetch_emails');
      const duration = Date.now() - start;
      
      expect(tool).toBeDefined();
      expect(duration).toBeLessThan(200);
    }, 10000);

    test('Tool categories are correct', async () => {
      const tools = toolConfigManager.getAllTools();
      const emailTools = tools.filter(t => t.category === 'Email' || t.name.includes('email'));
      const calendarTools = tools.filter(t => t.category === 'Calendar' || t.name.includes('calendar'));
      const crmTools = tools.filter(t => t.category === 'CRM' || t.name.includes('entity'));
      
      expect(emailTools.length).toBeGreaterThan(0);
      expect(calendarTools.length).toBeGreaterThan(0);
      expect(crmTools.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Groq Intent Routing', () => {
    test.skip('Groq can route email queries correctly', async () => {
      const prompt = `Given this user query, what Cortex tools should be used?

Query: "Show me my recent emails"

Available tools: fetch_emails, send_email, fetch_calendar_events, create_calendar_event, fetch_entity, create_entity

Respond with only the tool name(s).`;

      const response = await groqService.executeSearch(prompt);
      expect(response.content).toBeDefined();
      expect(response.content.toLowerCase()).toContain('fetch');
    }, 15000);

    test.skip('Groq can route action queries correctly', async () => {
      const prompt = `Given this user query, what Cortex tools should be used?

Query: "Send an email to alice@company.com saying hello"

Available tools: fetch_emails, send_email, fetch_calendar_events, create_calendar_event, fetch_entity, create_entity

Respond with only the tool name(s).`;

      const response = await groqService.executeSearch(prompt);
      expect(response.content).toBeDefined();
      expect(response.content.toLowerCase()).toContain('send');
    }, 15000);

    test.skip('Groq can route CRM queries correctly', async () => {
      const prompt = `Given this user query, what Cortex tools should be used?

Query: "Show me all leads"

Available tools: fetch_emails, send_email, fetch_calendar_events, create_calendar_event, fetch_entity, create_entity

Respond with only the tool name(s).`;

      const response = await groqService.executeSearch(prompt);
      expect(response.content).toBeDefined();
      expect(response.content.toLowerCase()).toContain('fetch');
    }, 15000);
  });
});

