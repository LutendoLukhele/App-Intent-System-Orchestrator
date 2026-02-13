// =============================================================================
// cortex/tools.ts — Tool executor bridge
// =============================================================================

import { ToolExecutor } from './runtime';

/**
 * Tool executor bridge that connects Cortex automation
 * to your existing ToolOrchestrator
 */
export class CortexToolExecutor implements ToolExecutor {
  constructor(private toolOrchestrator: any) {}
  
  async execute(tool: string, args: Record<string, any>, userId: string): Promise<any> {
    const [provider, action] = tool.split('.');

    // Comprehensive tool mapping based on tool-config.json
    const mapping: Record<string, { name: string; provider: string }> = {
      // Gmail / Email
      'gmail.send': { name: 'send_email', provider: 'google-mail' },
      'gmail.reply': { name: 'send_email', provider: 'google-mail' },
      'gmail.fetch': { name: 'fetch_emails', provider: 'google-mail' },
      'email.send': { name: 'send_email', provider: 'google-mail' },
      'email.fetch': { name: 'fetch_emails', provider: 'google-mail' },

      // Google Calendar
      'calendar.create': { name: 'create_calendar_event', provider: 'google-calendar' },
      'calendar.create_event': { name: 'create_calendar_event', provider: 'google-calendar' },
      'calendar.update': { name: 'update_calendar_event', provider: 'google-calendar' },
      'calendar.update_event': { name: 'update_calendar_event', provider: 'google-calendar' },
      'calendar.fetch': { name: 'fetch_calendar_events', provider: 'google-calendar' },
      'calendar.fetch_events': { name: 'fetch_calendar_events', provider: 'google-calendar' },

      // Salesforce CRM
      'salesforce.create_lead': { name: 'create_entity', provider: 'salesforce-ybzg' },
      'salesforce.create_contact': { name: 'create_entity', provider: 'salesforce-ybzg' },
      'salesforce.create_account': { name: 'create_entity', provider: 'salesforce-ybzg' },
      'salesforce.create_opportunity': { name: 'create_entity', provider: 'salesforce-ybzg' },
      'salesforce.create_case': { name: 'create_entity', provider: 'salesforce-ybzg' },
      'salesforce.create_task': { name: 'create_entity', provider: 'salesforce-ybzg' },
      'salesforce.update_lead': { name: 'update_entity', provider: 'salesforce-ybzg' },
      'salesforce.update_contact': { name: 'update_entity', provider: 'salesforce-ybzg' },
      'salesforce.update_account': { name: 'update_entity', provider: 'salesforce-ybzg' },
      'salesforce.update_opportunity': { name: 'update_entity', provider: 'salesforce-ybzg' },
      'salesforce.update_case': { name: 'update_entity', provider: 'salesforce-ybzg' },
      'salesforce.fetch_lead': { name: 'fetch_entity', provider: 'salesforce-ybzg' },
      'salesforce.fetch_contact': { name: 'fetch_entity', provider: 'salesforce-ybzg' },
      'salesforce.fetch_account': { name: 'fetch_entity', provider: 'salesforce-ybzg' },
      'salesforce.fetch_opportunity': { name: 'fetch_entity', provider: 'salesforce-ybzg' },
      'salesforce.fetch_case': { name: 'fetch_entity', provider: 'salesforce-ybzg' },

      // Notion
      'notion.create_page': { name: 'create_notion_page', provider: 'notion' },
      'notion.update_page': { name: 'update_notion_page', provider: 'notion' },
      'notion.fetch_page': { name: 'fetch_notion_page', provider: 'notion' },

      // Outlook
      'outlook.send_email': { name: 'create_outlook_entity', provider: 'outlook' },
      'outlook.create_event': { name: 'create_outlook_entity', provider: 'outlook' },
      'outlook.create_contact': { name: 'create_outlook_entity', provider: 'outlook' },
      'outlook.update_email': { name: 'update_outlook_entity', provider: 'outlook' },
      'outlook.update_event': { name: 'update_outlook_entity', provider: 'outlook' },
      'outlook.update_contact': { name: 'update_outlook_entity', provider: 'outlook' },
      'outlook.fetch_email': { name: 'fetch_outlook_entity', provider: 'outlook' },
      'outlook.fetch_event': { name: 'fetch_outlook_entity', provider: 'outlook' },
      'outlook.fetch_contact': { name: 'fetch_outlook_entity', provider: 'outlook' },

      // Generic aliases
      'slack.send': { name: 'send_message', provider: 'slack' },
    };

    const m = mapping[tool];
    if (!m) throw new Error(`Unknown tool: ${tool}`);

    // Transform args to match existing ToolOrchestrator interface
    const toolCall = {
      id: `tool_${Date.now()}`,
      name: m.name,
      arguments: { input: args },
      userId,
      sessionId: 'cortex-session',
    };

    const planId = `cortex_plan_${Date.now()}`;
    const stepId = `cortex_step_${Date.now()}`;

    const result = await this.toolOrchestrator.executeTool(toolCall, planId, stepId);

    if (result.status === 'failed') {
      throw new Error(result.error || 'Tool execution failed');
    }

    return result.data;
  }
}
