# 5.3 Pattern Lookup

> Intent → Plan mapping without LLMs.

---

## The Concept

For each classified intent, we have a pre-built plan template:

```typescript
const planTemplates: Record<string, PlanTemplate> = {
  "contact_search": {
    steps: [
      { tool: "search_contacts", args: { query: "{{name}}" } },
      { tool: "format_results", args: { fields: ["{{field}}"] } }
    ]
  },
  "send_email": {
    steps: [
      { tool: "lookup_contact", args: { name: "{{recipient}}" } },
      { tool: "draft_email", args: { to: "{{step0.email}}", subject: "{{subject}}" } },
      { tool: "send_email", args: { draft_id: "{{step1.draft_id}}" } }
    ],
    requires_confirmation: true
  }
};
```

---

## Plan Template Structure

```typescript
interface PlanTemplate {
  // The steps to execute
  steps: TemplateStep[];
  
  // Does this need user confirmation?
  requires_confirmation?: boolean;
  
  // Minimum required entities
  required_entities: string[];
  
  // Optional entities with defaults
  optional_entities?: Record<string, any>;
  
  // Provider requirements
  required_providers?: string[];
}

interface TemplateStep {
  tool: string;
  args: Record<string, string>;  // Values can be templates
  
  // Conditional execution
  if?: string;  // JS expression
  
  // Result handling
  store_as?: string;
}
```

---

## Entity Extraction

Before we can fill templates, we need entities:

```typescript
// packages/intent-classifier/src/EntityExtractor.ts

export class EntityExtractor {
  private patterns: Map<string, RegExp[]>;
  
  constructor() {
    this.patterns = new Map([
      ['contact_search', [
        /(?:find|get|search for|look up)\s+(?<name>.+?)(?:'s|s')?\s+(?<field>email|phone|address)/i,
        /(?:what is|what's)\s+(?<name>.+?)(?:'s|s')?\s+(?<field>email|phone|address)/i,
      ]],
      ['send_email', [
        /(?:send|write|compose)\s+(?:an\s+)?email\s+to\s+(?<recipient>.+?)\s+about\s+(?<subject>.+)/i,
        /email\s+(?<recipient>.+?)\s+(?:about|regarding)\s+(?<subject>.+)/i,
      ]],
      ['schedule_meeting', [
        /(?:schedule|set up|book)\s+(?:a\s+)?meeting\s+with\s+(?<attendees>.+?)\s+(?:on|for)\s+(?<date>.+)/i,
        /meet\s+with\s+(?<attendees>.+?)\s+(?<date>.+)/i,
      ]],
    ]);
  }
  
  extract(intent: string, text: string): Record<string, string> {
    const patterns = this.patterns.get(intent) || [];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.groups) {
        return match.groups;
      }
    }
    
    // Fallback: no entities extracted
    return {};
  }
}
```

---

## Template Resolution

Fill in template with extracted entities:

```typescript
// packages/intent-classifier/src/TemplateResolver.ts

export class TemplateResolver {
  resolve(template: PlanTemplate, entities: Record<string, string>): ActionPlan | null {
    // Check required entities
    for (const required of template.required_entities) {
      if (!entities[required]) {
        return null;  // Missing required entity
      }
    }
    
    // Apply defaults for optional entities
    const fullEntities = {
      ...template.optional_entities,
      ...entities
    };
    
    // Resolve each step
    const steps: ActionStep[] = template.steps.map((step, index) => ({
      id: `step${index}`,
      tool: step.tool,
      arguments: this.resolveArgs(step.args, fullEntities),
      status: 'pending',
      requires_confirmation: template.requires_confirmation && this.isMutatingTool(step.tool)
    }));
    
    return {
      steps,
      requires_user_confirmation: template.requires_confirmation ?? false
    };
  }
  
  private resolveArgs(
    args: Record<string, string>,
    entities: Record<string, string>
  ): Record<string, any> {
    const resolved: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(args)) {
      resolved[key] = this.resolveTemplate(value, entities);
    }
    
    return resolved;
  }
  
  private resolveTemplate(template: string, entities: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return entities[key] ?? match;
    });
  }
  
  private isMutatingTool(tool: string): boolean {
    const mutatingTools = ['send_email', 'create_lead', 'update_opportunity', 'delete_contact'];
    return mutatingTools.includes(tool);
  }
}
```

---

## The Plan Registry

Organize all templates:

```typescript
// packages/intent-classifier/src/PlanRegistry.ts

export class PlanRegistry {
  private templates: Map<string, PlanTemplate> = new Map();
  
  constructor() {
    this.registerBuiltinTemplates();
  }
  
  private registerBuiltinTemplates(): void {
    // Contact operations
    this.register('contact_search', {
      required_entities: ['name'],
      optional_entities: { field: 'email' },
      steps: [
        { tool: 'search_contacts', args: { query: '{{name}}' } }
      ]
    });
    
    this.register('contact_create', {
      required_entities: ['name', 'email'],
      optional_entities: { company: '', phone: '' },
      requires_confirmation: true,
      steps: [
        { 
          tool: 'create_contact', 
          args: { 
            name: '{{name}}', 
            email: '{{email}}',
            company: '{{company}}',
            phone: '{{phone}}'
          } 
        }
      ]
    });
    
    // Email operations
    this.register('send_email', {
      required_entities: ['recipient'],
      optional_entities: { subject: 'No subject', body: '' },
      requires_confirmation: true,
      required_providers: ['gmail'],
      steps: [
        { tool: 'lookup_contact', args: { name: '{{recipient}}' }, store_as: 'contact' },
        { 
          tool: 'send_email', 
          args: { 
            to: '{{contact.email}}', 
            subject: '{{subject}}',
            body: '{{body}}'
          } 
        }
      ]
    });
    
    // Calendar operations
    this.register('schedule_meeting', {
      required_entities: ['attendees', 'date'],
      optional_entities: { duration: '30m', title: 'Meeting' },
      requires_confirmation: true,
      required_providers: ['google-calendar'],
      steps: [
        { tool: 'parse_date', args: { date: '{{date}}' }, store_as: 'parsed_date' },
        { tool: 'lookup_contacts', args: { names: '{{attendees}}' }, store_as: 'attendee_list' },
        { 
          tool: 'create_calendar_event', 
          args: { 
            title: '{{title}}',
            start: '{{parsed_date}}',
            duration: '{{duration}}',
            attendees: '{{attendee_list}}'
          } 
        }
      ]
    });
    
    // Lead operations
    this.register('lead_search', {
      required_entities: ['query'],
      required_providers: ['salesforce'],
      steps: [
        { tool: 'search_leads', args: { query: '{{query}}' } }
      ]
    });
    
    this.register('lead_create', {
      required_entities: ['name', 'company'],
      optional_entities: { email: '', source: 'manual' },
      requires_confirmation: true,
      required_providers: ['salesforce'],
      steps: [
        { 
          tool: 'create_lead', 
          args: { 
            name: '{{name}}',
            company: '{{company}}',
            email: '{{email}}',
            source: '{{source}}'
          } 
        }
      ]
    });
  }
  
  register(intent: string, template: PlanTemplate): void {
    this.templates.set(intent, template);
  }
  
  get(intent: string): PlanTemplate | undefined {
    return this.templates.get(intent);
  }
  
  has(intent: string): boolean {
    return this.templates.has(intent);
  }
}
```

---

## Step Dependencies

Templates can reference results from previous steps:

```typescript
// Template with dependencies
{
  steps: [
    { tool: 'search_contacts', args: { query: '{{name}}' }, store_as: 'contact' },
    { tool: 'send_email', args: { to: '{{contact.email}}' } }
  ]
}
```

The resolver handles step references:

```typescript
private resolveArgs(
  args: Record<string, string>,
  entities: Record<string, string>,
  stepResults: Record<string, any>
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(args)) {
    // Check for step reference: {{stepName.field}}
    const stepMatch = value.match(/\{\{(\w+)\.(\w+)\}\}/);
    if (stepMatch) {
      const [, stepName, field] = stepMatch;
      resolved[key] = stepResults[stepName]?.[field];
    } else {
      resolved[key] = this.resolveTemplate(value, entities);
    }
  }
  
  return resolved;
}
```

---

## Conditional Steps

Some steps only execute under certain conditions:

```typescript
{
  steps: [
    { tool: 'search_contacts', args: { query: '{{name}}' }, store_as: 'contact' },
    { 
      tool: 'send_email', 
      args: { to: '{{contact.email}}' },
      if: 'contact && contact.email'  // Only if we found an email
    }
  ]
}
```

---

## Validation

Before using a template, validate it:

```typescript
class PlanValidator {
  validate(template: PlanTemplate): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check tool availability
    for (const step of template.steps) {
      if (!this.toolExists(step.tool)) {
        errors.push(`Unknown tool: ${step.tool}`);
      }
    }
    
    // Check entity references
    const definedEntities = new Set([
      ...template.required_entities,
      ...Object.keys(template.optional_entities || {})
    ]);
    
    for (const step of template.steps) {
      for (const argValue of Object.values(step.args)) {
        const refs = this.extractEntityRefs(argValue);
        for (const ref of refs) {
          if (!definedEntities.has(ref) && !ref.includes('.')) {
            warnings.push(`Unknown entity reference: {{${ref}}}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
```

---

## Coverage Tracking

Track which intents are covered by templates:

```typescript
class CoverageTracker {
  private hits: Map<string, number> = new Map();
  private misses: Map<string, number> = new Map();
  
  recordHit(intent: string): void {
    this.hits.set(intent, (this.hits.get(intent) || 0) + 1);
  }
  
  recordMiss(intent: string): void {
    this.misses.set(intent, (this.misses.get(intent) || 0) + 1);
  }
  
  getStats(): CoverageStats {
    const totalHits = Array.from(this.hits.values()).reduce((a, b) => a + b, 0);
    const totalMisses = Array.from(this.misses.values()).reduce((a, b) => a + b, 0);
    
    return {
      coverage: totalHits / (totalHits + totalMisses),
      byIntent: this.getByIntentStats(),
      uncoveredIntents: Array.from(this.misses.keys()).filter(i => !this.hits.has(i))
    };
  }
}
```

---

## Exercise

1. Design templates for these intents:
   - "Show my calendar for [date]"
   - "Update [lead name]'s status to [status]"
   - "Forward this email to [person]"

2. What entities does each need?

3. What step dependencies exist?

4. How would you handle: "Send email to John about the meeting tomorrow"
   - Multiple entities: recipient, subject, implicit date reference
   - What if "John" matches multiple contacts?

---

*Next: [5.4 Tiered Routing](./routing.md)*
