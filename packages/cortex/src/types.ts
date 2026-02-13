// =============================================================================
// cortex/types.ts — Simplified, intent-focused type definitions
// =============================================================================

// -----------------------------------------------------------------------------
// EVENTS
// -----------------------------------------------------------------------------

export interface Event<T = any> {
  id: string;
  source: 'gmail' | 'google-calendar' | 'salesforce';
  event: string;
  timestamp: string;
  user_id: string;
  payload: T;
  meta?: {
    dedupe_key?: string;
  };
}

// Event types per provider
export type GmailEventType = 'email_received' | 'email_sent' | 'email_reply_received';
export type CalendarEventType = 'event_created' | 'event_updated' | 'event_deleted' | 'event_starting' | 'event_rsvp_changed';
export type SalesforceEventType = 'lead_created' | 'lead_stage_changed' | 'lead_converted' | 'opportunity_created' | 'opportunity_stage_changed' | 'opportunity_amount_changed' | 'opportunity_closed_won' | 'opportunity_closed_lost';

export type EventType = GmailEventType | CalendarEventType | SalesforceEventType;

// -----------------------------------------------------------------------------
// UNIT — Intent-focused automation
// -----------------------------------------------------------------------------

export interface Unit {
  id: string;
  owner: string;
  name: string;
  description?: string;

  // Original user input (raw natural language)
  raw: {
    when: string;
    if?: string;
    then: string;
  };

  // Compiled intent into executable form
  when: Trigger;
  if: Condition[];
  then: Action[];

  status: 'active' | 'paused' | 'disabled';
  created_at: string;
  updated_at: string;

  // Stats
  run_count?: number;
  last_run_at?: string;
}

// -----------------------------------------------------------------------------
// TRIGGERS
// -----------------------------------------------------------------------------

export interface EventTrigger {
  type: 'event';
  source: string;
  event: string;
  filter?: string;  // JS expression to filter when to trigger
}

export interface ScheduleTrigger {
  type: 'schedule';
  cron: string;
  timezone?: string;
}

export interface CompoundTrigger {
  type: 'compound';
  any?: (EventTrigger | ScheduleTrigger)[];
  all?: (EventTrigger | ScheduleTrigger)[];
}

export type Trigger = EventTrigger | ScheduleTrigger | CompoundTrigger;

// -----------------------------------------------------------------------------
// CONDITIONS
// -----------------------------------------------------------------------------

export type Condition = EvalCondition | SemanticCondition;

export interface EvalCondition {
  type: 'eval';
  expr: string;
}

export interface SemanticCondition {
  type: 'semantic';
  check: 'urgency' | 'sentiment' | 'intent' | 'custom';
  prompt?: string;  // For custom checks
  input?: string;   // Optional input override
  expect: string;
}

// -----------------------------------------------------------------------------
// ACTIONS
// -----------------------------------------------------------------------------

// --- ACTIONS ---

export type Action = 
  | LLMAction
  | ToolAction
  | NotifyAction
  | WaitAction
  | CheckAction
  | FetchAction
  | LookupAction
  | LogAction;

export interface LLMAction {
  type: 'llm';
  prompt: 'summarize' | 'draft_reply' | 'extract_action_items' | 'analyze_sentiment' | string;
  input: Record<string, any>;
  store_as?: string;  // Store result as variable name
}

export interface ToolAction {
  type: 'tool';
  tool: string;  // e.g. 'slack.send', 'gmail.send', 'salesforce.update_lead'
  args: Record<string, any>;
  store_as?: string;
}

export interface NotifyAction {
  type: 'notify';
  message: string;
}

export interface WaitAction {
  type: 'wait';
  duration: string;  // e.g. '24h', '48h', '7d'
}

export interface CheckAction {
  type: 'check';
  that: string;
  then: 'continue' | 'stop';
  else: 'continue' | 'stop';
}

export interface FetchAction {
  type: 'fetch';
  from: string;
  query: string;
  as: string;
}

export interface LookupAction {
  type: 'lookup';
  in: string;
  find: string;
  where: string;
  as: string;
}

export interface LogAction {
  type: 'log';
  message: string;
}

// -----------------------------------------------------------------------------
// RUN
// -----------------------------------------------------------------------------

export type RunStatus = 'pending' | 'running' | 'waiting' | 'success' | 'failed';

export interface Run {
  id: string;
  unit_id: string;
  event_id: string;
  user_id: string;
  status: RunStatus;
  step: number;
  context: Record<string, any>;
  started_at: string;
  completed_at?: string;
  resume_at?: string;
  error?: string;
}
