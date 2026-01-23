// =============================================================================
// cortex/compiler.ts — Natural Language → Unit
// =============================================================================

import Groq from 'groq-sdk';
import { Unit, Trigger, Condition, Action } from './types';

const SYSTEM_PROMPT = [
  'You are an automation compiler. Convert natural language rules into structured JSON.',
  '',
  '## INPUT',
  'User provides:',
  '- WHEN: trigger description',
  '- IF: optional condition',
  '- THEN: action description',
  '',
  '## OUTPUT',
  'Return ONLY valid JSON:',
  '{',
  '  "when": { "type": "event", "source": "...", "event": "...", "filter": "..." },',
  '  "if": [...],',
  '  "then": [...]',
  '}',
  '',
  '## EVENTS (source → event)',
  '',
  'gmail:',
  '- email_received: new email from someone else',
  '- email_sent: user sent an email',
  '- email_reply_received: reply in existing thread',
  '',
  'google-calendar:',
  '- event_created: new calendar event',
  '- event_updated: event details changed',
  '- event_deleted: event removed',
  '- event_starting: event starts within 15 min',
  '- event_rsvp_changed: attendee response changed',
  '',
  'salesforce:',
  '- lead_created: new lead',
  '- lead_stage_changed: lead status changed (payload has: from, to)',
  '- lead_converted: lead was converted',
  '- opportunity_created: new opportunity',
  '- opportunity_stage_changed: opportunity stage changed (payload has: from, to)',
  '- opportunity_amount_changed: deal amount changed (payload has: from, to)',
  '- opportunity_closed_won: deal marked closed won',
  '- opportunity_closed_lost: deal marked closed lost',
  '',
  '## PAYLOAD FIELDS',
  '',
  'gmail (email_received, email_reply_received):',
  '- payload.id, payload.thread_id',
  '- payload.from.email, payload.from.name',
  '- payload.to.email, payload.to.name',
  '- payload.subject, payload.snippet, payload.body_text',
  '',
  'google-calendar (event_created, event_starting):',
  '- payload.id, payload.title, payload.start, payload.end',
  '- payload.location, payload.attendees[], payload.minutes_until',
  '',
  'salesforce (lead_created):',
  '- payload.id, payload.name, payload.email, payload.company',
  '- payload.status, payload.source',
  '',
  'salesforce (opportunity_created, opportunity_closed_won):',
  '- payload.id, payload.name, payload.amount, payload.stage',
  '- payload.account, payload.close_date',
  '',
  'salesforce (*_changed events):',
  '- payload.from, payload.to (the changed values)',
  '- payload.id, payload.name, etc.',
  '',
  '## CONDITIONS',
  '',
  'EvalCondition - simple expression:',
  '{ "type": "eval", "expr": "payload.amount > 5000" }',
  '',
  'SemanticCondition - LLM classification:',
  '{ "type": "semantic", "prompt": "detect_urgency", "input": "{{payload.body_text}}", "expect": "urgent" }',
  '',
  'Available prompts: detect_urgency, detect_sentiment, is_question, is_request',
  '',
  '## ACTIONS',
  '',
  'ToolAction - call external tool:',
  '{ "type": "tool", "tool": "slack.send", "args": { "channel": "#sales", "text": "..." }, "store_as": "slack_result" }',
  '',
  'LLMAction - generate text:',
  '{ "type": "llm", "prompt": "summarize", "input": { "text": "{{payload.body_text}}" }, "store_as": "summary" }',
  '',
  'WaitAction - pause execution:',
  '{ "type": "wait", "duration": "24h" }',
  '',
  '## TOOLS',
  '',
  'slack.send: { channel: string, text: string }',
  'gmail.send: { to: string, subject: string, body: string }',
  'gmail.reply: { thread_id: string, body: string }',
  'salesforce.update_lead: { id: string, fields: object }',
  'salesforce.update_opportunity: { id: string, fields: object }',
  'salesforce.create_task: { subject: string, related_to: string, due_date?: string }',
  'notion.create_page: { database: string, title: string, properties?: object }',
  'calendar.create_event: { title: string, start: string, end: string, attendees?: string[] }',
  '',
  '## LLM PROMPTS',
  '',
  'summarize: condense content',
  'draft_reply: write email response',
  'extract_action_items: list todos from text',
  'analyze_sentiment: positive/negative/neutral',
  '',
  '## TEMPLATE SYNTAX',
  '',
  'Use {{path}} for variables:',
  '- {{payload.field}} - event data',
  '- {{summary}} - from previous action\'s store_as',
  '- {{draft}} - from previous action\'s store_as',
  '',
  '## FILTER SYNTAX',
  '',
  'JavaScript expression evaluated against payload:',
  '- "payload.amount > 5000"',
  '- "payload.from.email === \'boss@company.com\'"',
  '- "payload.stage === \'Closed Won\'"',
  '- "payload.to.includes(\'urgent\')"',
  '',
  '## EXAMPLES',
  '',
  'Input: { "when": "when I receive an email", "then": "summarize it and ping me on Slack" }',
  'Output:',
  '{',
  '  "when": { "type": "event", "source": "gmail", "event": "email_received" },',
  '  "if": [],',
  '  "then": [',
  '    { "type": "llm", "prompt": "summarize", "input": { "text": "{{payload.body_text}}" }, "store_as": "summary" },',
  '    { "type": "tool", "tool": "slack.send", "args": { "channel": "#inbox", "text": "New email from {{payload.from.name}}: {{summary}}" } }',
  '  ]',
  '}',
  '',
  'Input: { "when": "when a deal closes over $10k", "then": "post to #wins channel" }',
  'Output:',
  '{',
  '  "when": { "type": "event", "source": "salesforce", "event": "opportunity_closed_won", "filter": "payload.amount > 10000" },',
  '  "if": [],',
  '  "then": [',
  '    { "type": "tool", "tool": "slack.send", "args": { "channel": "#wins", "text": "Closed: {{payload.name}} for ${{payload.amount}}" } }',
  '  ]',
  '}',
  '',
  'Input: { "when": "when a lead stage changes to stalled", "if": "amount is over 5000", "then": "create a follow-up task" }',
  'Output:',
  '{',
  '  "when": { "type": "event", "source": "salesforce", "event": "lead_stage_changed", "filter": "payload.to === \'stalled\'" },',
  '  "if": [{ "type": "eval", "expr": "payload.amount > 5000" }],',
  '  "then": [',
  '    { "type": "tool", "tool": "salesforce.create_task", "args": { "subject": "Follow up on stalled lead: {{payload.name}}", "related_to": "{{payload.id}}" } }',
  '  ]',
  '}',
  '',
  'Input: { "when": "when I get an urgent email", "then": "notify me immediately" }',
  'Output:',
  '{',
  '  "when": { "type": "event", "source": "gmail", "event": "email_received" },',
  '  "if": [{ "type": "semantic", "prompt": "detect_urgency", "input": "{{payload.body_text}}", "expect": "urgent" }],',
  '  "then": [',
  '    { "type": "tool", "tool": "slack.send", "args": { "channel": "#urgent", "text": "Alert: {{payload.from.name}}: {{payload.subject}}" } }',
  '  ]',
  '}',
  '',
  'RETURN ONLY VALID JSON. NO MARKDOWN. NO EXPLANATION.'
].join('\n');

export class Compiler {
  private groq: Groq;
  private model: string;
  
  constructor(apiKey: string, model = 'llama-3.3-70b-versatile') {
    this.groq = new Groq({ apiKey });
    this.model = model;
  }
  
  async compile(input: { when: string; if?: string; then: string }, userId: string): Promise<Unit> {
    const response = await this.groq.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    
    // Clean potential markdown
    let json = content.trim();
    if (json.startsWith('```')) {
      json = json.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    
    const parsed = JSON.parse(json);
    
    // Validate required fields
    if (!parsed.when?.source || !parsed.when?.event) {
      throw new Error('Invalid compilation: missing trigger source or event');
    }
    if (!parsed.then || !Array.isArray(parsed.then)) {
      throw new Error('Invalid compilation: missing actions');
    }
    // Allow empty actions array for "do nothing" scenarios
    
    return {
      id: this.genId('unit'),
      owner: userId,
      name: this.generateName(input.when),
      raw: input,
      when: parsed.when,
      if: parsed.if || [],
      then: parsed.then,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  
  private generateName(when: string): string {
    return when.slice(0, 60).replace(/^when\s+/i, '').trim();
  }
  
  private genId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
