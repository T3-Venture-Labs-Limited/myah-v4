import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import {
  allowRegisteredActionSenders,
  getGenericApprovedResumeActiveToolNames,
  getLatestApprovedGenericAction,
  getPreApprovalExcludedToolNames,
  hasApprovedRegisteredActionApproval,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/approval-tool-availability.util';
import { ToolCategory } from 'twenty-shared/ai';

const toolEntry = ({
  name,
  operation,
}: {
  name: string;
  operation: string;
}): ToolIndexEntry =>
  ({
    name,
    label: name,
    description: name,
    category: ToolCategory.DATABASE_CRUD,
    executionRef: {
      kind: 'database_crud',
      objectNameSingular: 'company',
      operation,
    },
  }) as ToolIndexEntry;

const logicFunctionToolEntry = (name: string): ToolIndexEntry =>
  ({
    name,
    label: name,
    description: name,
    category: ToolCategory.LOGIC_FUNCTION,
    executionRef: {
      kind: 'logic_function',
      logicFunctionId: name,
    },
  }) as ToolIndexEntry;

describe('approval tool availability', () => {
  it('keeps write execution available but removes approval tools during a generic approved resume', () => {
    expect(
      getGenericApprovedResumeActiveToolNames([
        'execute_tool',
        REQUEST_APPROVAL_TOOL_NAME,
        'ask_questions',
      ]),
    ).toEqual(['execute_tool', 'ask_questions']);
  });

  it('excludes writes and unknown logic functions before approval', () => {
    const excluded = getPreApprovalExcludedToolNames([
      toolEntry({ name: 'find_many_companies', operation: 'find_many' }),
      toolEntry({ name: 'group_by_companies', operation: 'group_by' }),
      toolEntry({ name: 'create_one_task', operation: 'create_one' }),
      toolEntry({ name: 'update_one_company', operation: 'update_one' }),
      {
        name: 'send_email',
        label: 'Send email',
        description: 'Send email',
        category: ToolCategory.ACTION,
        executionRef: { kind: 'static', toolId: 'send_email' },
      } as ToolIndexEntry,
      {
        name: 'prepare_outreach_email_draft',
        label: 'Prepare outreach email draft',
        description: 'Prepare a provider draft without sending it',
        category: ToolCategory.ACTION,
        executionRef: {
          kind: 'static',
          toolId: 'prepare_outreach_email_draft',
        },
      } as ToolIndexEntry,
      {
        name: 'send_outreach_email',
        label: 'Send outreach email',
        description: 'Send only after registered approval',
        category: ToolCategory.ACTION,
        executionRef: {
          kind: 'static',
          toolId: 'send_outreach_email',
        },
      } as ToolIndexEntry,
      {
        name: 'prepare_instagram_reply_draft',
        label: 'Prepare Instagram reply draft',
        description: 'Prepare a local draft without provider I/O',
        category: ToolCategory.ACTION,
        executionRef: {
          kind: 'static',
          toolId: 'prepare_instagram_reply_draft',
        },
      } as ToolIndexEntry,
      logicFunctionToolEntry('app_myah_list_instagram_conversations'),
      logicFunctionToolEntry('app_myah_list_instagram_messages'),
      logicFunctionToolEntry('app_myah_send_instagram_reply'),
    ]);

    expect(excluded.has('find_many_companies')).toBe(false);
    expect(excluded.has('group_by_companies')).toBe(false);
    expect(excluded.has('create_one_task')).toBe(true);
    expect(excluded.has('update_one_company')).toBe(true);
    expect(excluded.has('send_email')).toBe(true);
    expect(excluded.has('prepare_instagram_reply_draft')).toBe(false);
    expect(excluded.has('prepare_outreach_email_draft')).toBe(false);
    expect(excluded.has('send_outreach_email')).toBe(true);
    expect(excluded.has('app_myah_list_instagram_conversations')).toBe(true);
    expect(excluded.has('app_myah_list_instagram_messages')).toBe(true);
    expect(excluded.has('app_myah_send_instagram_reply')).toBe(true);
  });

  it.each([
    'get_campaign_audience',
    'get_campaign_creator_list_addition_candidates',
    'get_campaign_outreach_workflow',
    'get_campaign_outreach_workflow_current_version',
    'compute_campaign_outreach_step_output_schema',
    'validate_campaign_outreach_workflow',
    'list_campaign_outreach_workflow_runs',
    'get_campaign_outreach_workflow_run',
    'list_campaign_outreach_logic_function_tools',
    'search_myah_inbox_threads',
    'get_myah_inbox_thread_context',
    'generate_myah_inbox_reply_proposal',
    'get_myah_inbox_reply_send_readiness',
    'get_myah_inbox_reply_send_status',
  ])('keeps %s available before approval', (toolName) => {
    const excluded = getPreApprovalExcludedToolNames([
      logicFunctionToolEntry(toolName),
    ]);

    expect(excluded.has(toolName)).toBe(false);
  });

  it.each([
    'add_direct_campaign_creators',
    'create_campaign_outreach_workflow',
    'update_myah_inbox_thread',
    'save_myah_inbox_reply_draft',
    'send_myah_inbox_reply',
  ])('excludes %s before approval', (toolName) => {
    const excluded = getPreApprovalExcludedToolNames([
      logicFunctionToolEntry(toolName),
    ]);

    expect(excluded.has(toolName)).toBe(true);
  });

  it('unlocks exactly the registered action senders after registered approval', () => {
    const excluded = new Set([
      'send_instagram_reply',
      'send_outreach_email',
      'send_myah_inbox_reply',
      'send_email',
    ]);

    allowRegisteredActionSenders(excluded);

    expect(excluded).toEqual(new Set(['send_email']));
  });

  it('keeps legacy Instagram app functions excluded after Unipile cutover', () => {
    const excluded = getPreApprovalExcludedToolNames([
      {
        name: 'app_myah_list_instagram_conversations',
        label: 'List Instagram conversations',
        description: 'List Instagram conversations',
        category: ToolCategory.ACTION,
        executionRef: {
          kind: 'static',
          toolId: 'myah-list-instagram-conversations',
        },
      } as ToolIndexEntry,
    ]);

    expect(excluded.has('app_myah_list_instagram_conversations')).toBe(true);
  });

  describe('getLatestApprovedGenericAction', () => {
    const reviewedAction = {
      version: 1,
      toolName: 'update_one_creator',
      toolLabel: 'Update Creator',
      argumentsDigest: 'a'.repeat(64),
      arguments: { id: 'alice-id', creatorStatus: 'QUALIFIED' },
      target: { kind: 'arguments_only' },
    };
    const approvalMessage = (
      result: Record<string, unknown>,
      input: Record<string, unknown> = { toolName: 'update_one_creator' },
    ) => ({
      id: 'approval-message-id',
      role: 'assistant',
      parts: [
        {
          type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
          toolCallId: 'approval-call-id',
          input,
          output: { result },
        },
      ],
    });
    const approved = {
      status: 'resolved',
      decision: 'approved',
      reviewedAction,
    };

    it('returns the reviewed action of the latest approved generic request', () => {
      expect(
        getLatestApprovedGenericAction([approvalMessage(approved)]),
      ).toEqual({
        messageId: 'approval-message-id',
        toolCallId: 'approval-call-id',
        reviewedAction,
      });
    });

    it.each([
      ['consumed', { ...approved, status: 'consumed' }],
      ['invalidated', { ...approved, status: 'invalidated' }],
      ['rejected', { ...approved, decision: 'rejected' }],
      ['changes requested', { ...approved, decision: 'changes_requested' }],
      ['legacy (tool name only)', { status: 'resolved', decision: 'approved' }],
      [
        'registered',
        {
          status: 'resolved',
          decision: 'approved',
          actionApprovalBindingId: 'b24f28a7-64bd-4cb8-ac5f-837536ca11db',
        },
      ],
      [
        'malformed digest',
        {
          ...approved,
          reviewedAction: { ...reviewedAction, argumentsDigest: 'x' },
        },
      ],
      [
        'registered sender tool',
        {
          ...approved,
          reviewedAction: {
            ...reviewedAction,
            toolName: 'send_myah_inbox_reply',
          },
        },
      ],
    ])('returns null for a %s approval', (_label, result) => {
      expect(
        getLatestApprovedGenericAction([approvalMessage(result)]),
      ).toBeNull();
    });

    it('returns null when the reviewed tool differs from the requested tool', () => {
      expect(
        getLatestApprovedGenericAction([
          approvalMessage(approved, { toolName: 'delete_one_creator' }),
        ]),
      ).toBeNull();
    });

    it('returns null once a later message follows the approval', () => {
      expect(
        getLatestApprovedGenericAction([
          approvalMessage(approved),
          { role: 'user', parts: [] },
        ]),
      ).toBeNull();
    });
  });

  it('only exposes the sender for a resolved registered approval result with a binding UUID', () => {
    const messagesFor = (result: Record<string, unknown>) => [
      {
        role: 'assistant',
        parts: [
          {
            type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
            output: { result },
          },
        ],
      },
      { role: 'user', parts: [] },
    ];

    expect(
      hasApprovedRegisteredActionApproval(
        messagesFor({
          status: 'pending',
          actionApprovalBindingId: 'b24f28a7-64bd-4cb8-ac5f-837536ca11db',
        }),
      ),
    ).toBe(false);
    expect(
      hasApprovedRegisteredActionApproval(messagesFor({ status: 'resolved' })),
    ).toBe(false);
    expect(
      hasApprovedRegisteredActionApproval(
        messagesFor({
          status: 'resolved',
          actionApprovalBindingId: 'not-a-uuid',
        }),
      ),
    ).toBe(false);
    expect(
      hasApprovedRegisteredActionApproval(
        messagesFor({
          status: 'resolved',
          actionApprovalBindingId: 'b24f28a7-64bd-4cb8-ac5f-837536ca11db',
        }),
      ),
    ).toBe(true);
  });
});
