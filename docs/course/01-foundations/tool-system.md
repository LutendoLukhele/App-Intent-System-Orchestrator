# 1.2 The Tool System

> Tools are capabilities described as data, not code.

---

## The Mental Model

A "tool" in ASO is not a function you call. It's a **description of a capability** that the system can execute.

```typescript
// A tool is DATA
const sendEmailTool = {
  name: 'send_email',
  description: 'Send an email to a recipient',
  category: 'Email',
  providerConfigKey: 'google-mail',
  source: 'action',
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body content' }
        },
        required: ['to', 'subject', 'body']
      }
    }
  }
};
```

This description tells:
- **The LLM** what this tool does and how to call it
- **The planner** what arguments it needs
- **The orchestrator** which provider handles it
- **The UI** how to display it to users

---

## Tools as Configuration

In ASO, tools are defined in JSON:

```json
// config/tool-config.json
{
  "tools": [
    {
      "name": "fetch_emails",
      "description": "Fetch Gmail emails with advanced filtering capabilities",
      "category": "Email",
      "providerConfigKey": "google-mail-ynxw",
      "source": "cache",
      "cache_model": "GmailThread",
      "parameters": {
        "type": "object",
        "properties": {
          "input": {
            "type": "object",
            "properties": {
              "operation": { 
                "type": "string", 
                "enum": ["fetch"] 
              },
              "filters": {
                "type": "object",
                "properties": {
                  "sender": { "type": "string", "optional": true },
                  "subject": { "type": "object", "optional": true },
                  "dateRange": { "type": "object", "optional": true },
                  "hasAttachment": { "type": "boolean", "optional": true }
                }
              }
            },
            "required": ["operation"]
          }
        },
        "required": ["input"]
      }
    },
    {
      "name": "send_email",
      "description": "Send a new email via Gmail",
      "category": "Email",
      "providerConfigKey": "google-mail-ynxw",
      "source": "action",
      "parameters": {
        "type": "object",
        "properties": {
          "input": {
            "type": "object",
            "properties": {
              "to": { "type": "string", "description": "Recipient email" },
              "subject": { "type": "string", "description": "Subject line" },
              "body": { "type": "string", "description": "Email body (HTML)" },
              "cc": { "type": "string", "description": "CC recipients" }
            },
            "required": ["to", "subject", "body"]
          }
        }
      }
    }
  ]
}
```

**Why JSON, not code?**
- Tools can be modified without recompiling
- Non-developers can add/modify tools
- Tools can be stored in database, loaded from API
- Easier to analyze (what tools exist? what providers do they need?)

---

## The ToolConfig Interface

```typescript
interface ToolConfig {
  // Identity
  name: string;                    // Unique identifier: 'fetch_emails'
  description: string;             // For LLM context
  category: string;                // Grouping: 'Email', 'CRM', 'Calendar'
  display_name?: string;           // Human-friendly: 'Fetch Emails'
  
  // Provider binding
  providerConfigKey?: string;      // Which Nango integration: 'google-mail-ynxw'
  
  // Parameters
  parameters?: ToolInputSchema;    // JSON Schema for arguments
  
  // Execution hints
  source?: 'cache' | 'action';     // Read vs write operation
  cache_model?: string;            // For cache reads: 'GmailThread'
}
```

---

## Source Types: Cache vs Action

This is crucial for understanding how tools execute.

### `source: 'cache'` — Read Operations

```json
{
  "name": "fetch_emails",
  "source": "cache",
  "cache_model": "GmailThread"
}
```

- **What it does**: Reads from Nango's synced cache
- **How it works**: Nango runs background syncs that pull data from APIs
- **Speed**: Fast — local database query, not API call
- **Freshness**: Data is as fresh as last sync (usually minutes)

```typescript
// In ToolOrchestrator
if (tool.source === 'cache') {
  const records = await this.nango.listRecords({
    providerConfigKey: tool.providerConfigKey,
    connectionId: userConnectionId,
    model: tool.cache_model  // 'GmailThread'
  });
  return records;
}
```

### `source: 'action'` — Write Operations

```json
{
  "name": "send_email",
  "source": "action"
}
```

- **What it does**: Executes a mutation via Nango action script
- **How it works**: Calls Nango's `triggerAction` which runs your action script
- **Speed**: Real-time API call
- **Confirmation**: Often requires user confirmation before execution

```typescript
// In ToolOrchestrator
if (tool.source === 'action') {
  const result = await this.nango.triggerAction(
    tool.providerConfigKey,   // 'google-mail-ynxw'
    userConnectionId,
    'send-email',             // Action name in Nango
    args.input
  );
  return result;
}
```

---

## ToolConfigManager

The `ToolConfigManager` loads and serves tool definitions:

```typescript
// src/services/ToolConfigManager.ts
export class ToolConfigManager implements IToolProvider {
  private tools: Map<string, ToolConfig> = new Map();
  private byCategory: Map<string, ToolConfig[]> = new Map();
  private byProvider: Map<string, ToolConfig[]> = new Map();
  
  constructor(configPath?: string) {
    const path = configPath || './config/tool-config.json';
    this.loadTools(path);
  }
  
  private loadTools(configPath: string) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    for (const tool of config.tools) {
      // Index by name
      this.tools.set(tool.name, tool);
      
      // Index by category
      const category = tool.category || 'General';
      if (!this.byCategory.has(category)) {
        this.byCategory.set(category, []);
      }
      this.byCategory.get(category)!.push(tool);
      
      // Index by provider
      if (tool.providerConfigKey) {
        if (!this.byProvider.has(tool.providerConfigKey)) {
          this.byProvider.set(tool.providerConfigKey, []);
        }
        this.byProvider.get(tool.providerConfigKey)!.push(tool);
      }
    }
  }
  
  // IToolProvider implementation
  getAllTools(): ToolConfig[] {
    return Array.from(this.tools.values());
  }
  
  getToolByName(name: string): ToolConfig | undefined {
    return this.tools.get(name);
  }
  
  getToolsByCategory(category: string): ToolConfig[] {
    return this.byCategory.get(category) || [];
  }
  
  getToolsByProvider(providerKey: string): ToolConfig[] {
    return this.byProvider.get(providerKey) || [];
  }
  
  // Format for LLM consumption
  formatToolsForLLM(tools: ToolConfig[]): any[] {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} }
      }
    }));
  }
}
```

---

## Tool Categories

Grouping tools by category helps with:
- **Filtering**: Only show Email tools for email-related requests
- **Token optimization**: Don't send 50 tools when user asks about calendar
- **UI organization**: Group tools logically

```typescript
// Categories in ASO
type ToolCategory = 
  | 'Email'        // Gmail, Outlook
  | 'Calendar'     // Google Calendar, Outlook Calendar  
  | 'CRM'          // Salesforce
  | 'Messaging'    // Slack
  | 'Notes'        // Notion
  | 'Meta';        // Utilities like request_missing_parameters
```

---

## The Input Wrapper Pattern

Notice tools wrap arguments in an `input` object:

```json
{
  "parameters": {
    "type": "object",
    "properties": {
      "input": {
        "type": "object",
        "properties": {
          "to": { "type": "string" },
          "subject": { "type": "string" }
        }
      }
    }
  }
}
```

**Why?** 
- Consistent interface for all tools
- Easy to extract and pass to Nango actions
- Allows metadata alongside the input

```typescript
// When executing
const { input } = args;  // Always same shape
await nango.triggerAction(provider, connection, action, input);
```

---

## CRM Entity Tools

For Salesforce, we use a generic pattern:

```json
{
  "name": "fetch_entity",
  "description": "Fetch Salesforce records (Account, Contact, Lead, Deal, Opportunity)",
  "source": "cache",
  "providerConfigKey": "salesforce-ybzg",
  "category": "CRM",
  "parameters": {
    "type": "object",
    "properties": {
      "input": {
        "type": "object",
        "properties": {
          "operation": { "type": "string", "enum": ["fetch"] },
          "entityType": { 
            "type": "string", 
            "enum": ["Account", "Contact", "Lead", "Deal", "Opportunity"] 
          },
          "identifier": { "type": "string", "optional": true },
          "filters": { "type": "object", "optional": true }
        },
        "required": ["operation", "entityType"]
      }
    }
  }
}
```

One tool handles multiple Salesforce object types. The orchestrator routes:

```typescript
if (toolName === 'fetch_entity') {
  const { entityType, filters } = args.input;
  const model = `Salesforce${entityType}`;  // 'SalesforceContact'
  return await this.nango.listRecords({
    model,
    providerConfigKey: 'salesforce-ybzg',
    connectionId,
    filter: filters
  });
}
```

---

## Adding a New Tool

1. **Define in tool-config.json**:
```json
{
  "name": "create_notion_page",
  "description": "Create a new page in Notion",
  "category": "Notes",
  "providerConfigKey": "notion",
  "source": "action",
  "parameters": {
    "type": "object",
    "properties": {
      "input": {
        "type": "object",
        "properties": {
          "title": { "type": "string", "description": "Page title" },
          "content": { "type": "string", "description": "Page content (markdown)" },
          "parentId": { "type": "string", "description": "Parent page ID" }
        },
        "required": ["title"]
      }
    }
  }
}
```

2. **Ensure Nango integration exists**: 
   - OAuth configured in Nango
   - Action script `create-page.ts` in nango-integrations/notion/

3. **The orchestrator picks it up automatically** — tools are data!

---

## Exercise

1. Look at `config/tool-config.json` in the repo
2. Find the pattern: How do cache tools differ from action tools?
3. Add a new tool definition for "search Slack messages"
4. Think: What Nango sync would you need for this?

---

*Next: [1.3 Provider Abstraction](./provider-abstraction.md)*
