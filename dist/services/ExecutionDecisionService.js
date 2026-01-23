"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionDecisionService = void 0;
const winston_1 = __importDefault(require("winston"));
class ExecutionDecisionService {
    constructor() {
        this.READ_ONLY_TOOLS = [
            'fetch_emails',
            'fetch_calendar_events',
            'fetch_entity',
            'fetch_outlook_entity',
            'fetch_outlook_event_body',
            'fetch_notion_page'
        ];
        this.DESTRUCTIVE_KEYWORDS = [
            'delete',
            'remove',
            'drop',
            'destroy',
            'purge',
            'wipe'
        ];
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: { service: 'ExecutionDecisionService' },
            transports: [
                new winston_1.default.transports.Console()
            ]
        });
    }
    shouldAutoExecute(plan) {
        this.logger.info('Analyzing execution decision', {
            actionCount: plan.actionCount,
            hasMissingParams: plan.hasMissingParams,
            isSingleCacheTool: plan.isSingleCacheTool,
            isDestructive: plan.isDestructive,
            toolNames: plan.toolNames
        });
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
        if (plan.hasMissingParams) {
            this.logger.info('Missing parameters - collecting input');
            return {
                shouldAutoExecute: false,
                reason: 'Missing required parameters',
                needsUserInput: true,
                needsConfirmation: false
            };
        }
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
    isReadOnlyTool(toolName) {
        return this.READ_ONLY_TOOLS.includes(toolName);
    }
    isDestructiveTool(toolName) {
        const lowerToolName = toolName.toLowerCase();
        return this.DESTRUCTIVE_KEYWORDS.some(keyword => lowerToolName.includes(keyword));
    }
    analyzePlan(actions) {
        const toolNames = actions.map(a => a.name);
        const analysis = {
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
exports.ExecutionDecisionService = ExecutionDecisionService;
