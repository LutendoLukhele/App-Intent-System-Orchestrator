// src/services/ExecutionDecisionService.ts
/**
 * Centralized service for deciding whether to auto-execute actions or ask for user confirmation
 * Based on user decisions:
 * - Always auto-execute single read-only actions (fetch operations)
 * - Show execute button for ALL multi-step plans (2+ actions)
 */

import winston from 'winston';

export interface ExecutionDecision {
  shouldAutoExecute: boolean;
  reason: string;
  needsUserInput: boolean;
  needsConfirmation: boolean;
}

export interface PlanAnalysis {
  actionCount: number;
  hasMissingParams: boolean;
  isSingleCacheTool: boolean;
  isDestructive: boolean;
  toolNames?: string[];
}

export class ExecutionDecisionService {
  private logger: winston.Logger;

  // Read-only tools that are safe to auto-execute
  private readonly READ_ONLY_TOOLS = [
    'fetch_emails',
    'fetch_calendar_events',
    'fetch_entity',
    'fetch_outlook_entity',
    'fetch_outlook_event_body',
    'fetch_notion_page'
  ];

  // Keywords that indicate destructive actions
  private readonly DESTRUCTIVE_KEYWORDS = [
    'delete',
    'remove',
    'drop',
    'destroy',
    'purge',
    'wipe'
  ];

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'ExecutionDecisionService' },
      transports: [
        new winston.transports.Console()
      ]
    });
  }

  /**
   * Centralized logic for deciding whether to auto-execute or ask for confirmation
   *
   * Decision Rules:
   * 1. Never auto-execute destructive actions
   * 2. Always ask for missing parameters first
   * 3. Single read-only cache tool → auto-execute
   * 4. Multi-step (2+ actions) → require confirmation
   * 5. Default → require confirmation
   *
   * @param plan - Analysis of the plan to execute
   * @returns Decision object with shouldAutoExecute flag and reason
   */
  public shouldAutoExecute(plan: PlanAnalysis): ExecutionDecision {
    this.logger.info('Analyzing execution decision', {
      actionCount: plan.actionCount,
      hasMissingParams: plan.hasMissingParams,
      isSingleCacheTool: plan.isSingleCacheTool,
      isDestructive: plan.isDestructive,
      toolNames: plan.toolNames
    });

    // RULE 1: Never auto-execute destructive actions
    if (plan.isDestructive) {
      this.logger.warn('Destructive action detected - requiring confirmation', {
        toolNames: plan.toolNames
      });

      return {
        shouldAutoExecute: false,
        reason: 'Destructive action requires user confirmation',
        needsUserInput: false,
        needsConfirmation: true
      };
    }

    // RULE 2: Always ask for params first
    if (plan.hasMissingParams) {
      this.logger.info('Missing parameters - collecting input');

      return {
        shouldAutoExecute: false,
        reason: 'Missing required parameters',
        needsUserInput: true,
        needsConfirmation: false
      };
    }

    // RULE 3: Single read-only cache tool → auto-execute
    if (plan.actionCount === 1 && plan.isSingleCacheTool) {
      this.logger.info('Single read-only action - auto-executing', {
        toolName: plan.toolNames?.[0]
      });

      return {
        shouldAutoExecute: true,
        reason: 'Single read-only cache fetch',
        needsUserInput: false,
        needsConfirmation: false
      };
    }

    // RULE 4: Multi-step or write actions → require confirmation
    if (plan.actionCount > 1) {
      this.logger.info('Multi-step plan - requiring confirmation', {
        actionCount: plan.actionCount,
        toolNames: plan.toolNames
      });

      return {
        shouldAutoExecute: false,
        reason: 'Multi-step plan requires confirmation',
        needsUserInput: false,
        needsConfirmation: true
      };
    }

    // RULE 5: Default → require confirmation for single write/non-cache actions
    this.logger.info('Single non-read-only action - requiring confirmation', {
      toolName: plan.toolNames?.[0]
    });

    return {
      shouldAutoExecute: false,
      reason: 'Single action requires confirmation',
      needsUserInput: false,
      needsConfirmation: true
    };
  }

  /**
   * Check if a tool is read-only (safe to auto-execute)
   *
   * @param toolName - Name of the tool to check
   * @returns True if the tool is read-only
   */
  public isReadOnlyTool(toolName: string): boolean {
    return this.READ_ONLY_TOOLS.includes(toolName);
  }

  /**
   * Check if a tool name indicates a destructive action
   *
   * @param toolName - Name of the tool to check
   * @returns True if the tool is destructive
   */
  public isDestructiveTool(toolName: string): boolean {
    const lowerToolName = toolName.toLowerCase();
    return this.DESTRUCTIVE_KEYWORDS.some(keyword => lowerToolName.includes(keyword));
  }

  /**
   * Analyze a list of actions to create a PlanAnalysis
   *
   * @param actions - List of actions with their details
   * @returns PlanAnalysis object
   */
  public analyzePlan(actions: Array<{
    name: string;
    status?: string;
    arguments?: any;
  }>): PlanAnalysis {
    const toolNames = actions.map(a => a.name);

    const analysis: PlanAnalysis = {
      actionCount: actions.length,
      hasMissingParams: actions.some(a => a.status === 'collecting_parameters'),
      isSingleCacheTool: actions.length === 1 && this.isReadOnlyTool(actions[0].name),
      isDestructive: actions.some(a => this.isDestructiveTool(a.name)),
      toolNames
    };

    this.logger.info('Plan analysis complete', analysis);

    return analysis;
  }
}
