// =============================================================================
// cortex/runtime.ts — Execute runs
// =============================================================================

import Groq from 'groq-sdk';
import { Run, Unit, Action } from './types';
import { HybridStore } from './store';

export interface ToolExecutor {
  execute(tool: string, args: Record<string, any>, userId: string): Promise<any>;
}

export interface Logger {
  info(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
}

export class Runtime {
  private store: HybridStore;
  private groq: Groq;
  private tools: ToolExecutor;
  private logger: Logger;
  
  constructor(store: HybridStore, groqApiKey: string, tools: ToolExecutor, logger: Logger) {
    this.store = store;
    this.groq = new Groq({ apiKey: groqApiKey });
    this.tools = tools;
    this.logger = logger;
  }
  
  async execute(run: Run): Promise<void> {
    const unit = await this.store.getUnit(run.unit_id);
    if (!unit) {
      run.status = 'failed';
      run.error = 'Unit not found';
      await this.store.saveRun(run);
      return;
    }
    
    run.status = 'running';
    await this.store.saveRun(run);
    
    this.logger.info('Run started', { run_id: run.id, unit_id: unit.id });
    
    try {
      while (run.step < unit.then.length) {
        const action = unit.then[run.step];
        if (!action) break;
        
        this.logger.info('Executing step', { run_id: run.id, step: run.step, type: action.type });
        
        const result = await this.executeAction(action, run);
        
        // Handle wait
        if (result.wait) {
          run.status = 'waiting';
          run.resume_at = result.resume_at;
          await this.store.saveRun(run);
          this.logger.info('Run waiting', { run_id: run.id, resume_at: run.resume_at });
          return;
        }
        
        // Store result
        if (result.store_as && result.value !== undefined) {
          run.context[result.store_as] = result.value;
        }
        
        // Log step
        await this.store.logRunStep(run.id, run.step, action, 'success', result.value);
        
        run.step++;
        await this.store.saveRun(run);
      }
      
      run.status = 'success';
      run.completed_at = new Date().toISOString();
      this.logger.info('Run completed', { run_id: run.id });
      
    } catch (err: any) {
      run.status = 'failed';
      run.error = err.message;
      run.completed_at = new Date().toISOString();
      
      await this.store.logRunStep(run.id, run.step, unit.then[run.step]!, 'failed', null, err.message);
      this.logger.error('Run failed', { run_id: run.id, error: err.message });
    }
    
    await this.store.saveRun(run);
  }
  
  private async executeAction(action: Action, run: Run): Promise<{ wait?: boolean; resume_at?: string; store_as?: string; value?: any }> {
    switch (action.type) {
      case 'wait':
        return {
          wait: true,
          resume_at: new Date(Date.now() + this.parseDuration(action.duration)).toISOString(),
        };
        
      case 'llm':
        const llmInput = this.resolveArgs(action.input, run.context);
        const llmResult = await this.callLLM(action.prompt, llmInput);
        return { store_as: action.store_as, value: llmResult };
        
      case 'tool':
        const toolArgs = this.resolveArgs(action.args, run.context);
        const toolResult = await this.tools.execute(action.tool, toolArgs, run.user_id);
        return { store_as: action.store_as, value: toolResult };
        
      default:
        return {};
    }
  }
  
  private resolveArgs(args: Record<string, any>, ctx: Record<string, any>): Record<string, any> {
    const resolve = (val: any): any => {
      if (typeof val === 'string') {
        return val.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
          const parts = path.split('.');
          let v: any = ctx;
          for (const p of parts) v = v?.[p];
          return typeof v === 'string' ? v : JSON.stringify(v) || '';
        });
      }
      if (Array.isArray(val)) return val.map(resolve);
      if (typeof val === 'object' && val !== null) {
        const r: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) r[k] = resolve(v);
        return r;
      }
      return val;
    };
    return resolve(args);
  }
  
  private async callLLM(prompt: string, input: Record<string, any>): Promise<string> {
    const prompts: Record<string, string> = {
      summarize: `Summarize this concisely in 2-3 sentences:\n\n${JSON.stringify(input)}`,
      draft_reply: `Draft a professional, friendly reply to this email:\n\n${JSON.stringify(input)}`,
      extract_action_items: `List the action items from this text as bullet points:\n\n${JSON.stringify(input)}`,
      analyze_sentiment: `Analyze the sentiment and key points:\n\n${JSON.stringify(input)}`,
    };
    
    const userPrompt = prompts[prompt] || `${prompt}:\n\n${JSON.stringify(input)}`;
    
    const response = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    return response.choices[0]?.message?.content || '';
  }
  
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(m|h|d|w)$/);
    if (!match) return 0;
    const val = parseInt(match[1], 10);
    switch (match[2]) {
      case 'm': return val * 60 * 1000;
      case 'h': return val * 60 * 60 * 1000;
      case 'd': return val * 24 * 60 * 60 * 1000;
      case 'w': return val * 7 * 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }
  
  // Called by scheduler
  async resumeWaitingRuns(): Promise<void> {
    const runs = await this.store.getWaitingRuns(Date.now());
    for (const run of runs) {
      run.status = 'running';
      run.step++;
      await this.execute(run);
    }
  }
  
  // Rerun a previous run
  async rerun(runId: string): Promise<Run | null> {
    const data = await this.store.getRunForRerun(runId);
    if (!data?.eventPayload) return null;
    
    const newRun: Run = {
      id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      unit_id: data.run.unit_id,
      event_id: `rerun_${data.run.event_id}`,
      user_id: data.run.user_id,
      status: 'pending',
      step: 0,
      context: { payload: data.eventPayload },
      started_at: new Date().toISOString(),
    };
    
    await this.execute(newRun);
    return newRun;
  }
}
