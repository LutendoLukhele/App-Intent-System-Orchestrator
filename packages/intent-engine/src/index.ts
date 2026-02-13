/**
 * @aso/intent-engine
 * 
 * Intent resolution and plan compilation engine
 * 
 * @example
 * ```typescript
 * import { PlannerService, ToolConfigManager } from '@aso/intent-engine';
 * 
 * const planner = new PlannerService({
 *   llmClient: myLLMClient,
 *   toolProvider: new ToolConfigManager('./tools.json'),
 *   maxTokens: 4096
 * });
 * 
 * const plan = await planner.generatePlan("Send email to John");
 * ```
 */

// Core services
export { PlannerService } from './PlannerService';
export { ToolConfigManager } from './ToolConfigManager';
export { ProviderAwareToolFilter } from './ProviderAwareToolFilter';

// Types
export interface ActionStep {
  id: string;
  intent: string;
  tool: string;
  arguments: any;
  status: 'ready' | 'executing' | 'completed' | 'failed';
  stepNumber?: number;
  totalSteps?: number;
}

export interface ActionPlan {
  steps: ActionStep[];
  analysis?: string;
}

export interface PlannerConfig {
  llmClient: import('@aso/interfaces').ILLMClient;
  toolProvider: import('@aso/interfaces').IToolProvider;
  toolFilter?: import('@aso/interfaces').IToolFilter;
  maxTokens: number;
  model?: string;
}

// Re-export interfaces for convenience
export type { 
  ILLMClient, 
  IToolProvider, 
  IToolFilter,
  ToolConfig,
  ChatOptions,
  ChatResponse 
} from '@aso/interfaces';
