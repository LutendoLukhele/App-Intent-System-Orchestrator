// =============================================================================
// cortex/matcher.ts — Event → Units → Runs
// =============================================================================

import Groq from 'groq-sdk';
import { Event, Unit, Run, Condition, SemanticCondition } from './types';
import { HybridStore } from './store';

export class Matcher {
  private store: HybridStore;
  private groq: Groq;
  
  constructor(store: HybridStore, groqApiKey: string) {
    this.store = store;
    this.groq = new Groq({ apiKey: groqApiKey });
  }
  
  async match(event: Event): Promise<Run[]> {
    // 1. Find units that trigger on this event
    const units = await this.store.getUnitsByTrigger(event.source, event.event);
    if (units.length === 0) return [];
    
    // 2. Evaluate each unit
    const runs: Run[] = [];
    
    for (const unit of units) {
      if (unit.status !== 'active') continue;
      
      const pass = await this.evaluate(unit, event);
      if (pass) {
        const run = this.createRun(unit, event);
        await this.store.saveRun(run, event.payload);
        runs.push(run);
      }
    }
    
    return runs;
  }
  
  private async evaluate(unit: Unit, event: Event): Promise<boolean> {
    // Check trigger filter
    if (unit.when.type === 'event' && unit.when.filter) {
      if (!this.evalExpr(unit.when.filter, event.payload)) {
        return false;
      }
    }
    
    // Check all conditions
    for (const cond of unit.if) {
      const pass = await this.evalCondition(cond, event);
      if (!pass) return false;
    }
    
    return true;
  }
  
  private evalExpr(expr: string, payload: any): boolean {
    try {
      const fn = new Function('payload', `"use strict"; try { return Boolean(${expr}); } catch { return false; }`);
      return fn(payload);
    } catch {
      return false;
    }
  }
  
  private async evalCondition(cond: Condition, event: Event): Promise<boolean> {
    switch (cond.type) {
      case 'eval':
        return this.evalExpr(cond.expr, event.payload);

      case 'semantic':
        return this.evalSemantic(cond, event);

      default:
        return true;
    }
  }

  private async evalSemantic(cond: SemanticCondition, event: Event): Promise<boolean> {
    const inputTemplate = cond.input || '{{payload.body_text}}';
    const input = this.resolveTemplate(inputTemplate, { payload: event.payload });

    const prompts: Record<string, string> = {
      detect_urgency: 'Is this message urgent? Reply with only "urgent" or "normal".',
      detect_sentiment: 'What is the sentiment? Reply with only "positive", "negative", or "neutral".',
      is_question: 'Is this a question? Reply with only "yes" or "no".',
      is_request: 'Is this a request for action? Reply with only "yes" or "no".',
    };

    const promptKey = cond.prompt || 'custom';
    const systemPrompt = prompts[promptKey] || cond.prompt || 'Classify this. Reply with one word only.';
    
    const response = await this.groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.slice(0, 2000) },
      ],
      temperature: 0,
      max_tokens: 10,
    });
    
    const result = response.choices[0]?.message?.content?.trim().toLowerCase() || '';
    const expected = Array.isArray(cond.expect) ? cond.expect : [cond.expect];
    
    return expected.some(e => result.includes(e.toLowerCase()));
  }
  
  private resolveTemplate(template: string, ctx: Record<string, any>): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
      const parts = path.split('.');
      let val: any = ctx;
      for (const p of parts) val = val?.[p];
      return typeof val === 'string' ? val : JSON.stringify(val) || '';
    });
  }
  
  private createRun(unit: Unit, event: Event): Run {
    return {
      id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      unit_id: unit.id,
      event_id: event.id,
      user_id: event.user_id,
      status: 'pending',
      step: 0,
      context: { payload: event.payload },
      started_at: new Date().toISOString(),
    };
  }
}
