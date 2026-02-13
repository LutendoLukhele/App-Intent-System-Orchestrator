export interface StreamChunk {
  type:
    | 'conversational_text_segment'
    | 'potential_tool_call'
    | 'dedicated_tool_call'
    | 'markdown_artefact_segment'
    | 'parsed_markdown_segment'
    | 'beat'
    | 'parameter_collection_required'
    | 'PENDING_PARAMETER_COLLECTION'
    | 'parameter_updated'
    | 'action_confirmation_required'
    | 'action_executed'
    | 'plan_generated'
    | 'tool_call'
    | 'tool_result'
    | 'tool_status_update'
    | 'tool_status'
    | 'seed_data_response'
    | 'content'
    | 'error'
    | 'stream_end'
    | 'planner_status'
    | 'interpret_event';
  content?: any;
  messageId?: string;
  isFinal?: boolean;
  toolCallId?: string;
  streamType?:
    | 'conversational'
    | 'tool_call'
    | 'markdown_artefact'
    | 'follow_up'
    | 'system'
    | 'beat_engine'
    | 'action_launcher'
    | 'scratchpad'
    | 'planner_feedback';
  payload?: any;
  data?: any;
  status?: string;
  toolName?: string;
  result?: any;
  event?: string;
  metadata?: any;
}
