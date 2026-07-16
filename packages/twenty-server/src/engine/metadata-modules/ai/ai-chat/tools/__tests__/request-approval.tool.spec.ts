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

  it('normalizes a model call that wraps direct approval fields in arguments', () => {
    const result = requestApprovalInputSchema.safeParse({
      arguments: validApprovalInput,
    });

    expect(result).toEqual({
      success: true,
      data: validApprovalInput,
    });
  });

  it('persists a registered Instagram authority and returns only its binding UUID', async () => {
    const draftId = '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea';
    const input = {
      toolName: 'send_instagram_reply',
      actionInput: { draftId },
    };
    const expectedActionBinding = {
      workspaceId: 'workspace-id',
      actionName: 'send_instagram_reply',
      actionVersion: 1,
      draftId,
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      initiatorUserWorkspaceId: 'member-id',
      threadId: 'thread-id',
      evidenceLinks: [],
    };
    const actionDefinition = {
      propose: jest.fn().mockResolvedValue({ expectedActionBinding }),
    };
    const actionApprovalService = {
      createPendingBinding: jest
        .fn()
        .mockResolvedValue({ id: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b' }),
    };
    const factory = createRequestApprovalTool as unknown as (options: unknown) => {
      execute: (value: unknown) => Promise<unknown>;
    };

    expect(requestApprovalInputSchema.parse(input)).toEqual(input);
    await expect(
      factory({
        workspaceId: 'workspace-id',
        userWorkspaceId: 'member-id',
        threadId: 'thread-id',
        actionDefinition,
        actionApprovalService,
      }).execute(input),
    ).resolves.toEqual({
      success: true,
      message: expect.any(String),
      result: {
        status: 'pending',
        actionApprovalBindingId: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b',
      },
    });
    expect(actionDefinition.propose).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      initiatorUserWorkspaceId: 'member-id',
      threadId: 'thread-id',
      input: { draftId },
    });
    expect(actionApprovalService.createPendingBinding).toHaveBeenCalledWith(
      expectedActionBinding,
    );
  });

  it('rejects Instagram reply identifiers on the generic approval tool', () => {
    const result = requestApprovalInputSchema.safeParse({
      ...validApprovalInput,
      instagramReply: {
        draftId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
        connectedAccountId: 'ca_instagram_123',
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
