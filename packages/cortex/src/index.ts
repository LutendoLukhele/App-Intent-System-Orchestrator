/**
 * @aso/cortex
 * 
 * Reactive automation: Natural language → Event-driven workflows
 * 
 * @example
 * ```typescript
 * import { Compiler, Matcher, Runtime, HybridStore } from '@aso/cortex';
 * 
 * const compiler = new Compiler(llmClient);
 * const unit = await compiler.compile({
 *   when: "When I receive an email from my boss",
 *   then: "Notify me on Slack"
 * });
 * ```
 */

// Core components
export { Compiler } from './compiler';
export { Matcher } from './matcher';
export { Runtime } from './runtime';
export { HybridStore } from './store';
export { EventShaper } from './event-shaper';
export { CortexToolExecutor } from './tools';

// Types
export * from './types';
