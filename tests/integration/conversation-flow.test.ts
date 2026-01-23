/**
 * Conversation Flow Tests
 *
 * Purpose: Test multi-turn conversations, follow-ups, context retention
 * Focus: Smooth UX, natural interactions, handling ambiguity
 *
 * Tests:
 * - Multi-turn conversations with context
 * - Follow-up questions
 * - Clarification handling
 * - Tool call sequences
 * - Error recovery in conversations
 */

import axios from 'axios';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8787';

describe('Conversation Flow Tests', () => {
  describe('Context Retention', () => {
    it('should remember context from previous message', async () => {
      const sessionId = `context-test-${Date.now()}`;

      // First message: Get emails
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my latest 5 emails',
        sessionId
      });

      expect(first.status).toBe(200);
      expect(first.data.response).toBeDefined();

      // Follow-up: Refer to "them" (should understand = emails)
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Which of them are from John?',
        sessionId
      });

      expect(second.status).toBe(200);
      expect(second.data.response).toBeDefined();
      // Should filter previously fetched emails by sender
    }, 15000);

    it('should maintain context across tool calls', async () => {
      const sessionId = `multi-tool-context-${Date.now()}`;

      // First: Get meetings
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'What meetings do I have today?',
        sessionId
      });

      expect(first.status).toBe(200);

      // Follow-up: Send email about "my next meeting"
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Send an email to the attendees of my next meeting',
        sessionId
      });

      expect(second.status).toBe(200);
      // Should remember meetings from first query
    }, 20000);

    it('should handle pronoun resolution', async () => {
      const sessionId = `pronoun-test-${Date.now()}`;

      // First: Create lead
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Create a lead for John Doe at Acme Corp',
        sessionId
      });

      expect(first.status).toBe(200);

      // Follow-up: Update "him" (= John Doe)
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Update his status to qualified',
        sessionId
      });

      expect(second.status).toBe(200);
      // Should know "his" = John Doe's lead
    }, 15000);
  });

  describe('Follow-Up Questions', () => {
    it('should handle "tell me more" follow-up', async () => {
      const sessionId = `tell-more-${Date.now()}`;

      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my emails',
        sessionId
      });

      expect(first.status).toBe(200);

      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Tell me more about the first one',
        sessionId
      });

      expect(second.status).toBe(200);
      // Should provide details about first email
    }, 15000);

    it('should handle "what else" follow-up', async () => {
      const sessionId = `what-else-${Date.now()}`;

      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my recent leads',
        sessionId
      });

      expect(first.status).toBe(200);

      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'What else can you tell me about them?',
        sessionId
      });

      expect(second.status).toBe(200);
    }, 15000);

    it('should handle "why" follow-up', async () => {
      const sessionId = `why-${Date.now()}`;

      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me security emails',
        sessionId
      });

      expect(first.status).toBe(200);

      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Why did you classify these as security?',
        sessionId
      });

      expect(second.status).toBe(200);
      // Should explain semantic classification
    }, 15000);
  });

  describe('Clarification Handling', () => {
    it('should ask for clarification when ambiguous', async () => {
      const sessionId = `clarify-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Send an email to John',
        sessionId
      });

      expect(response.status).toBe(200);

      // Should either:
      // 1. Ask for clarification (email address, subject, body)
      // 2. Use request_missing_parameters tool
      const responseText = response.data.response.toLowerCase();

      const asksForInfo =
        responseText.includes('email address') ||
        responseText.includes('subject') ||
        responseText.includes('what should') ||
        responseText.includes('need more');

      expect(asksForInfo).toBe(true);
    }, 10000);

    it('should handle clarification response', async () => {
      const sessionId = `clarify-response-${Date.now()}`;

      // Ambiguous request
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Schedule a meeting',
        sessionId
      });

      expect(first.status).toBe(200);

      // Provide missing info
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Tomorrow at 2pm with jane@example.com',
        sessionId
      });

      expect(second.status).toBe(200);
      // Should create meeting with provided info
    }, 15000);
  });

  describe('Tool Call Sequences', () => {
    it('should chain tool calls naturally', async () => {
      const sessionId = `chain-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Find emails from John about the project and create a meeting to discuss them',
        sessionId
      });

      expect(response.status).toBe(200);
      // Should: fetch_emails → create_calendar_event
    }, 15000);

    it('should handle parallel tool calls', async () => {
      const sessionId = `parallel-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my emails and my calendar for today',
        sessionId
      });

      expect(response.status).toBe(200);
      // Should fetch both in parallel
    }, 15000);

    it('should handle conditional tool calls', async () => {
      const sessionId = `conditional-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'If I have any security emails, forward them to security@company.com',
        sessionId
      });

      expect(response.status).toBe(200);
      // Should: fetch_emails (semanticType=security) → if results > 0 → send_email
    }, 15000);
  });

  describe('Error Recovery', () => {
    it('should recover gracefully from tool failure', async () => {
      const sessionId = `error-recovery-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my emails',
        sessionId
      });

      // Even if tool fails, should respond gracefully
      expect(response.status).toBe(200);
      expect(response.data.response).toBeDefined();

      if (response.data.error) {
        // Error message should be user-friendly
        expect(response.data.response).not.toContain('undefined');
        expect(response.data.response).not.toContain('null');
        expect(response.data.response).not.toContain('Error:');
      }
    }, 10000);

    it('should suggest alternatives on failure', async () => {
      const sessionId = `suggest-alt-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me data from unavailable source',
        sessionId
      });

      expect(response.status).toBe(200);
      // Should suggest what IS available
    }, 10000);

    it('should maintain conversation after error', async () => {
      const sessionId = `error-continue-${Date.now()}`;

      // Request that might fail
      const first = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my emails',
        sessionId
      });

      expect(first.status).toBe(200);

      // Continue conversation
      const second = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'How about my calendar instead?',
        sessionId
      });

      expect(second.status).toBe(200);
      // Should work despite previous error
    }, 15000);
  });

  describe('Natural Language Understanding', () => {
    it('should handle casual language', async () => {
      const sessionId = `casual-${Date.now()}`;

      const responses = await Promise.all([
        axios.post(`${BASE_URL}/api/chat`, {
          userId: 'test-user',
          message: 'yo show me my emails',
          sessionId: `${sessionId}-1`
        }),
        axios.post(`${BASE_URL}/api/chat`, {
          userId: 'test-user',
          message: 'can u show me my emails plz',
          sessionId: `${sessionId}-2`
        }),
        axios.post(`${BASE_URL}/api/chat`, {
          userId: 'test-user',
          message: 'emails?',
          sessionId: `${sessionId}-3`
        })
      ]);

      responses.forEach(r => expect(r.status).toBe(200));
    }, 15000);

    it('should handle typos and misspellings', async () => {
      const sessionId = `typos-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'shwo me my emials frm jhon',
        sessionId
      });

      expect(response.status).toBe(200);
      // Should understand despite typos
    }, 10000);

    it('should handle date expressions', async () => {
      const sessionId = `dates-${Date.now()}`;

      const expressions = [
        'Show me emails from yesterday',
        'Show me emails from last week',
        'Show me emails from 3 days ago',
        'Show me emails from this morning'
      ];

      for (const expr of expressions) {
        const response = await axios.post(`${BASE_URL}/api/chat`, {
          userId: 'test-user',
          message: expr,
          sessionId: `${sessionId}-${expressions.indexOf(expr)}`
        });

        expect(response.status).toBe(200);
      }
    }, 30000);
  });

  describe('Response Quality', () => {
    it('should provide concise responses', async () => {
      const sessionId = `concise-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'How many emails do I have?',
        sessionId
      });

      expect(response.status).toBe(200);

      // Response should be short for simple questions
      const wordCount = response.data.response.split(/\s+/).length;
      expect(wordCount).toBeLessThan(100);
    }, 10000);

    it('should provide detailed responses when requested', async () => {
      const sessionId = `detailed-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Give me a detailed summary of my security emails',
        sessionId
      });

      expect(response.status).toBe(200);

      // Response should be longer for detailed requests
      const wordCount = response.data.response.split(/\s+/).length;
      expect(wordCount).toBeGreaterThan(50);
    }, 10000);

    it('should format data clearly', async () => {
      const sessionId = `format-${Date.now()}`;

      const response = await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'List my top 5 leads',
        sessionId
      });

      expect(response.status).toBe(200);

      // Should use structured format (bullets, numbers, etc.)
      const hasStructure =
        response.data.response.includes('\n-') ||
        response.data.response.includes('\n1') ||
        response.data.response.includes('•');

      expect(hasStructure).toBe(true);
    }, 10000);
  });

  describe('Performance & UX', () => {
    it('should respond quickly for simple queries (<3s)', async () => {
      const start = Date.now();

      await axios.post(`${BASE_URL}/api/chat`, {
        userId: 'test-user',
        message: 'Show me my emails',
        sessionId: `perf-${Date.now()}`
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(3000);
    }, 5000);

    it('should handle slow operations gracefully', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/chat`,
        {
          userId: 'test-user',
          message: 'Show me all my data from all sources',
          sessionId: `slow-${Date.now()}`
        },
        { timeout: 30000 }
      );

      expect(response.status).toBe(200);
      // Should either complete or timeout gracefully
    }, 35000);

    it('should stream responses if supported', async () => {
      // If streaming is implemented
      const sessionId = `stream-${Date.now()}`;

      const response = await axios.post(
        `${BASE_URL}/api/chat`,
        {
          userId: 'test-user',
          message: 'Give me a detailed analysis of my emails',
          sessionId
        },
        {
          headers: { 'Accept': 'text/event-stream' },
          responseType: 'stream',
          validateStatus: () => true
        }
      );

      // Should either stream (200) or fallback to regular (200)
      expect([200, 201]).toContain(response.status);
    }, 15000);
  });
});
