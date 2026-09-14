export const MYAH_CREATOR_OPS_TOOL_NAMES = Object.freeze([
  'add_creators_to_creator_list',
  'remove_creator_from_creator_list',
  'get_campaign_audience',
  'add_direct_campaign_creators',
  'attach_creator_lists_to_campaign',
  'detach_creator_list_from_campaign',
  'get_campaign_creator_list_addition_candidates',
  'approve_campaign_creator_list_additions',
] as const);

export const MYAH_CREATOR_OPS_READ_TOOL_NAMES = Object.freeze([
  'get_campaign_audience',
  'get_campaign_creator_list_addition_candidates',
] as const);

export const MYAH_CAMPAIGN_OUTREACH_READ_TOOL_NAMES = Object.freeze([
  'get_campaign_outreach_workflow',
  'get_campaign_outreach_workflow_current_version',
  'compute_campaign_outreach_step_output_schema',
  'validate_campaign_outreach_workflow',
  'list_campaign_outreach_workflow_runs',
  'get_campaign_outreach_workflow_run',
  'list_campaign_outreach_logic_function_tools',
] as const);

export const MYAH_CAMPAIGN_OUTREACH_TOOL_NAMES = Object.freeze([
  'get_campaign_outreach_workflow',
  'create_campaign_outreach_workflow',
  'get_campaign_outreach_workflow_current_version',
  'create_campaign_outreach_workflow_draft',
  'create_campaign_outreach_workflow_step',
  'update_campaign_outreach_workflow_step',
  'delete_campaign_outreach_workflow_step',
  'create_campaign_outreach_workflow_edge',
  'delete_campaign_outreach_workflow_edge',
  'update_campaign_outreach_workflow_trigger',
  'update_campaign_outreach_workflow_positions',
  'compute_campaign_outreach_step_output_schema',
  'validate_campaign_outreach_workflow',
  'activate_campaign_outreach_workflow',
  'deactivate_campaign_outreach_workflow',
  'list_campaign_outreach_workflow_runs',
  'get_campaign_outreach_workflow_run',
  'list_campaign_outreach_logic_function_tools',
  'update_campaign_outreach_logic_function_source',
  'update_campaign_outreach_agent',
] as const);

export const MYAH_OUTREACH_EMAIL_TOOL_NAMES = Object.freeze([
  'prepare_outreach_email_draft',
  'send_outreach_email',
] as const);

export const MYAH_INBOX_TOOL_NAMES = Object.freeze([
  'search_myah_inbox_threads',
  'get_myah_inbox_thread_context',
  'generate_myah_inbox_reply_proposal',
  'update_myah_inbox_thread',
  'save_myah_inbox_reply_draft',
  'get_myah_inbox_reply_send_readiness',
  'get_myah_inbox_reply_send_status',
] as const);

export const MYAH_INBOX_READ_TOOL_NAMES = Object.freeze([
  'search_myah_inbox_threads',
  'get_myah_inbox_thread_context',
  'generate_myah_inbox_reply_proposal',
] as const);

export const MYAH_INBOX_MUTATION_TOOL_NAMES = Object.freeze([
  'update_myah_inbox_thread',
  'save_myah_inbox_reply_draft',
] as const);

export const MYAH_INBOX_REPLY_SEND_STATUS_TOOL_NAMES = Object.freeze([
  'get_myah_inbox_reply_send_readiness',
  'get_myah_inbox_reply_send_status',
] as const);

export const REGISTERED_ACTION_TOOL_NAMES = Object.freeze([
  'send_instagram_reply',
  'send_outreach_email',
  'send_myah_inbox_reply',
] as const);
export const MYAH_ASSISTANT_SKILL_TOOL_NAMES = Object.freeze([
  ...MYAH_CREATOR_OPS_TOOL_NAMES,
  ...MYAH_OUTREACH_EMAIL_TOOL_NAMES,
  ...MYAH_CAMPAIGN_OUTREACH_TOOL_NAMES,
  ...MYAH_INBOX_TOOL_NAMES,
  ...REGISTERED_ACTION_TOOL_NAMES.filter((toolName) =>
    toolName.startsWith('send_myah_'),
  ),
]);
