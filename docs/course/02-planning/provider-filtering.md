# 2.4 Provider-Aware Filtering

> Only plan what the user can actually execute.

---

## The Problem

You have 50 tools defined. A user asks: "Send an email to John."

But this user has only connected Gmail, not Salesforce. If you send all 50 tools to the LLM:
1. **Wasted tokens**: Most tools are irrelevant
2. **Confusion**: LLM might pick a Salesforce tool user can't use
3. **Poor UX**: Plan fails because provider isn't connected

---

## The Solution: Filter Early

Before planning, filter tools to only those the user can actually execute:

```typescript
async generatePlan(userInput: string, userId: string): Promise<ActionPlan> {
  // Get ONLY tools user has providers for
  const availableTools = await this.toolFilter.getAvailableToolsForUser(userId);
  
  if (availableTools.length === 0) {
    throw new Error('Please connect an integration first');
  }
  
  // Build prompt with ONLY available tools
  const prompt = this.buildPrompt(userInput, availableTools);
  
  // ... rest of planning
}
```

---

## ProviderAwareToolFilter

```typescript
// packages/intent-engine/src/ProviderAwareToolFilter.ts

export class ProviderAwareToolFilter implements IToolFilter {
  constructor(
    private toolConfigManager: ToolConfigManager,
    private sql: DatabaseQuery,
    private cacheService?: UserToolCacheService
  ) {}
  
  async getAvailableToolsForUser(userId: string): Promise<ToolConfig[]> {
    // Check cache first
    if (this.cacheService) {
      const cached = await this.cacheService.getCachedTools(userId);
      if (cached) return cached;
    }
    
    // Get user's connected providers
    const connectedProviders = await this.getConnectedProviders(userId);
    
    if (connectedProviders.size === 0) {
      return [];
    }
    
    // Filter tools
    const allTools = this.toolConfigManager.getAllTools();
    const available = allTools.filter(tool => 
      this.isToolAvailableForProviders(tool, connectedProviders)
    );
    
    // Cache result
    if (this.cacheService) {
      await this.cacheService.cacheTools(userId, available, 300); // 5 min
    }
    
    return available;
  }
  
  private isToolAvailableForProviders(
    tool: ToolConfig,
    connectedProviders: Set<string>
  ): boolean {
    // Tools without provider requirement are always available
    if (!tool.providerConfigKey) {
      return true;
    }
    
    // Check if user has this provider (considering aliases)
    const providerChain = getCanonicalProviderChain(tool.providerConfigKey);
    return providerChain.some(p => connectedProviders.has(p));
  }
}
```

---

## Getting Connected Providers

```typescript
async getConnectedProviders(userId: string): Promise<Set<string>> {
  const connections = await this.sql`
    SELECT DISTINCT provider 
    FROM connections 
    WHERE user_id = ${userId}
  `;
  
  const providers = new Set<string>();
  
  for (const conn of connections) {
    // Add the provider itself
    providers.add(conn.provider.toLowerCase());
    
    // Add all its aliases
    const aliases = getCanonicalProviderChain(conn.provider);
    aliases.forEach(a => providers.add(a.toLowerCase()));
  }
  
  return providers;
}
```

---

## Provider Aliases

Some providers have multiple identifiers:

```typescript
// packages/intent-engine/src/providerAliases.ts

const PROVIDER_EQUIVALENCE_GROUPS: string[][] = [
  ['google-mail-ynxw', 'google-mail', 'gmail'],
  ['salesforce-ybzg', 'salesforce-2', 'salesforce'],
  ['google-calendar', 'gcal'],
  ['notion', 'notion-ybzg'],
];

export function getCanonicalProviderChain(provider: string): string[] {
  const normalized = provider.toLowerCase();
  
  for (const group of PROVIDER_EQUIVALENCE_GROUPS) {
    if (group.includes(normalized)) {
      return group;
    }
  }
  
  return [normalized];
}

// Usage:
// getCanonicalProviderChain('google-mail-ynxw')
// → ['google-mail-ynxw', 'google-mail', 'gmail']
```

This handles:
- Different Nango integration names across environments
- Legacy provider names
- Shorthand aliases

---

## Token Optimization

With filtering, you send fewer tools to the LLM:

| Scenario | Tools Sent | Tokens |
|----------|-----------|--------|
| No filtering | 50 tools | ~10,000 |
| Gmail only | 8 tools | ~1,600 |
| Gmail + Salesforce | 20 tools | ~4,000 |

**80% fewer tokens** = faster + cheaper.

---

## Provider Context for LLM

Tell the LLM what the user has connected:

```typescript
async getProviderContextForPrompt(userId: string): Promise<string> {
  const providers = await this.getConnectedProviders(userId);
  
  const lines: string[] = [];
  
  if (this.hasProvider(providers, 'google-mail')) {
    lines.push('✓ Gmail - Email operations (fetch, send, reply)');
  }
  if (this.hasProvider(providers, 'salesforce')) {
    lines.push('✓ Salesforce - CRM (leads, contacts, opportunities)');
  }
  if (this.hasProvider(providers, 'google-calendar')) {
    lines.push('✓ Google Calendar - Calendar events');
  }
  if (this.hasProvider(providers, 'notion')) {
    lines.push('✓ Notion - Pages and databases');
  }
  
  if (lines.length === 0) {
    return 'No integrations connected. User needs to connect an integration.';
  }
  
  return `User has these integrations:\n${lines.join('\n')}\n\nONLY use tools that match these providers.`;
}

private hasProvider(providers: Set<string>, key: string): boolean {
  return getCanonicalProviderChain(key).some(p => providers.has(p));
}
```

---

## Cache Invalidation

When a user connects/disconnects a provider:

```typescript
// User just connected Gmail
await db.connections.insert({
  userId,
  provider: 'google-mail-ynxw',
  connectionId: nangoConnectionId
});

// Invalidate their tool cache
await toolFilter.invalidateCache(userId);

// Next request will recompute available tools
```

```typescript
// In ProviderAwareToolFilter
async invalidateCache(userId: string): Promise<void> {
  if (this.cacheService) {
    await this.cacheService.invalidate(userId);
  }
}
```

---

## Checking Tool Availability

For UI display (show which tools are locked):

```typescript
async getAllToolsWithAvailability(userId: string): Promise<ToolAvailability[]> {
  const allTools = this.toolConfigManager.getAllTools();
  const connectedProviders = await this.getConnectedProviders(userId);
  
  return allTools.map(tool => {
    const available = this.isToolAvailableForProviders(tool, connectedProviders);
    
    return {
      tool,
      available,
      reason: available 
        ? undefined 
        : `Requires ${tool.providerConfigKey} connection`
    };
  });
}
```

UI shows:
```
✅ Fetch Emails (Gmail connected)
✅ Send Email (Gmail connected)
🔒 Create Lead (Connect Salesforce)
🔒 Fetch Opportunities (Connect Salesforce)
```

---

## Category + Provider Filtering

Filter by both category AND provider:

```typescript
async getToolsByCategoriesForUser(
  userId: string,
  categories: string[]
): Promise<ToolConfig[]> {
  const available = await this.getAvailableToolsForUser(userId);
  return available.filter(tool => categories.includes(tool.category));
}

// Usage: Only email tools user can actually use
const emailTools = await filter.getToolsByCategoriesForUser(userId, ['Email']);
```

---

## The Full Filter Flow

```typescript
// In PlannerService.generatePlan()

async generatePlan(input: string, sessionId: string, userId: string) {
  // 1. Get filtered tools
  const tools = await this.getToolsForUser(userId);
  
  if (tools.length === 0) {
    this.emit('error', sessionId, {
      message: 'Please connect an integration to get started',
      code: 'NO_PROVIDERS'
    });
    return [];
  }
  
  // 2. Get provider context
  const context = await this.toolFilter?.getProviderContextForPrompt(userId) || '';
  
  // 3. Build prompt with only available tools
  const prompt = this.buildPlannerPrompt(input, tools, context);
  
  // 4. Call LLM
  const response = await this.llmClient.chat({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    responseFormat: { type: 'json_object' }
  });
  
  // 5. Parse and validate against available tools
  const plan = this.parsePlan(response.content);
  
  const toolNames = new Set(tools.map(t => t.name));
  for (const step of plan) {
    if (!toolNames.has(step.tool)) {
      // LLM hallucinated a tool - this shouldn't happen with good prompts
      throw new Error(`Tool ${step.tool} not available for this user`);
    }
  }
  
  return plan;
}
```

---

## Graceful Handling

User asks for something they can't do:

```typescript
// User asks: "Create a Salesforce lead for John"
// But user only has Gmail connected

// The planner prompt only shows Gmail tools
// LLM responds: "I cannot create Salesforce leads. You have Gmail connected.
//               Would you like me to help with email instead?"

// Or returns empty plan with explanation
{
  "plan": [],
  "message": "Salesforce is not connected. Please connect Salesforce to create leads."
}
```

---

## Exercise

1. User has connected: Gmail, Google Calendar
2. Your tool config has: Gmail tools, Salesforce tools, Calendar tools
3. Write the filter logic:
   - Which tools should be available?
   - What provider context would you send to LLM?

4. User asks: "Create a Salesforce lead for John"
   - What should happen?
   - How do you handle this gracefully?

---

*Next: [Part 3 - Reactive Automation (Cortex)](../03-cortex/README.md)*
