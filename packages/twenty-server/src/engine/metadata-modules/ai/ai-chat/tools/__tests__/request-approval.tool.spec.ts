import { type RequestApprovalToolInput } from 'twenty-shared/ai';

import {
  REQUEST_APPROVAL_TOOL_NAME,
  createRequestApprovalTool,
  requestApprovalInputSchema,
} from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';

const validApprovalInput: RequestApprovalToolInput = {
  title: 'Send creator outreach email',
  summary: 'Send a first-touch email to one creator for the summer launch.',
  actionKind: 'email_send',
  riskLevel: 'medium',
  toolName: 'send_email',
  targetLabel: 'creator@example.test',
  affectedRecords: [
    {
      objectNameSingular: 'person',
      recordId: 'person-1',
      label: 'Creator Example',
    },
  ],
  preview: {
    format: 'markdown',
    content: 'Hi Creator, would you like to try the product?',
  },
  consequences: ['The recipient will receive an outbound email.'],
  options: { allowRequestChanges: true },
};

describe('request_approval tool', () => {
  it('is named request_approval', () => {
    expect(REQUEST_APPROVAL_TOOL_NAME).toBe('request_approval');
  });

  it('execute echoes the approval request with a pending status', async () => {
    const tool = createRequestApprovalTool();

    const output = await tool.execute(validApprovalInput);

    expect(output).toEqual({
      success: true,
      message: expect.any(String),
      result: {
        request: validApprovalInput,
        status: 'pending',
      },
    });
  });

  it('binds an Instagram reply approval to a draft, conversation, and text preview', async () => {
    const tool = createRequestApprovalTool();
    const instagramApproval: RequestApprovalToolInput = {
      ...validApprovalInput,
      actionKind: 'external_write',
      toolName: 'send_instagram_reply',
      preview: { format: 'text', content: 'Thank you for your message.' },
      instagramReply: {
        draftId: '9b05e648-d3f0d-4fd7-8e4e-bc6a31b980ea',
        connectedAccountId: 'ca_instagram_123',
        conversationId: 'd81e9de7-899e-4259-ae1e-e2770b405f4b',
      },
    };

    const output = await tool.execute(instagramApproval);

    expect(output.result).toEqual({
      request: instagramApproval,
      approvalId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
      status: 'pending',
    });
  });

  it('rejects an unbound Instagram reply approval', () => {
    const result = requestApprovalInputSchema.safeParse({
      ...validApprovalInput,
      actionKind: 'external_write',
      toolName: 'send_instagram_reply',
      preview: { format: 'text', content: 'Thank you for your message.' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an Instagram reply approval without a bound account', () => {
    const result = requestApprovalInputSchema.safeParse({
      ...validApprovalInput,
      actionKind: 'external_write',
      toolName: 'send_instagram_reply',
      preview: { format: 'text', content: 'Thank you for your message.' },
      instagramReply: {
        draftId: '9b05e648-d3f0d-4fd7-8e4e-bc6a31b980ea',
        conversationId: 'd81e9de7-899e-4259-ae1e-e2770b405f4b',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid risk level', () => {
    const result = requestApprovalInputSchema.safeParse({
      ...validApprovalInput,
      riskLevel: 'urgent',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid action kind', () => {
    const result = requestApprovalInputSchema.safeParse({
      ...validApprovalInput,
      actionKind: 'read_only_lookup',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing title and summary', () => {
    const {
      title: _title,
      summary: _summary,
      ...missingRequiredText
    } = validApprovalInput;

    const result = requestApprovalInputSchema.safeParse(missingRequiredText);

    expect(result.success).toBe(false);
  });

  it.each(['text', 'json', 'diff', 'markdown'] as const)(
    'accepts %s preview format',
    (format) => {
      const result = requestApprovalInputSchema.safeParse({
        ...validApprovalInput,
        preview: { format, content: 'preview' },
      });

      expect(result.success).toBe(true);
    },
  );

  it('rejects an empty consequences list', () => {
    const result = requestApprovalInputSchema.safeParse({
      ...validApprovalInput,
      consequences: [],
    });

    expect(result.success).toBe(false);
  });
});
