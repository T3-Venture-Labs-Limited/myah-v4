import {
  type RequestApprovalToolInput,
  type ReviewedGenericAction,
} from 'twenty-shared/ai';

import {
  REQUEST_APPROVAL_TOOL_NAME,
  createRequestApprovalTool,
  requestApprovalInputSchema,
} from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';

const ALICE_ID = '7f1c1c1e-0d8a-4b37-9f6a-8e9d2f1b0a11';

const validApprovalInput: RequestApprovalToolInput = {
  title: 'Qualify Alice',
  summary: "Set Creator Alice's status to Qualified.",
  actionKind: 'internal_record_write',
  riskLevel: 'low',
  toolName: 'update_one_creator',
  proposedArguments: { id: ALICE_ID, creatorStatus: 'QUALIFIED' },
  targetLabel: 'Alice',
  affectedRecords: [
    {
      objectNameSingular: 'creator',
      recordId: ALICE_ID,
      label: 'Alice',
    },
  ],
  preview: {
    format: 'markdown',
    content: 'Status: New -> Qualified',
  },
  consequences: ["Alice's status becomes Qualified."],
  options: { allowRequestChanges: true },
};

const reviewedAction: ReviewedGenericAction = {
  version: 1,
  toolName: 'update_one_creator',
  toolLabel: 'Update Creator',
  argumentsDigest: 'a'.repeat(64),
  arguments: { id: ALICE_ID, creatorStatus: 'QUALIFIED' },
  target: {
    kind: 'record_write',
    operation: 'update',
    objectNameSingular: 'creator',
    records: [
      {
        recordId: ALICE_ID,
        label: 'Alice',
        changes: [
          { field: 'creatorStatus', current: 'NEW', proposed: 'QUALIFIED' },
        ],
        linkedRecords: [],
      },
    ],
    totalCount: 1,
    targetFingerprint: 'b'.repeat(64),
  },
};

describe('request_approval tool', () => {
  it('is named request_approval', () => {
    expect(REQUEST_APPROVAL_TOOL_NAME).toBe('request_approval');
  });

  it('requires approval for generic writes except pre-approval-safe tools', () => {
    const tool = createRequestApprovalTool();

    expect(tool.description).toContain(
      'CRM records, workflows, or metadata require this approval',
    );
    expect(tool.description).toContain(
      '\`prepare_instagram_reply_draft\` and \`prepare_outreach_email_draft\` are pre-approval safe',
    );
    expect(tool.description).toContain('persists only local review state');
    expect(tool.description).toContain(
      'both send tools still require registered approval',
    );
    expect(tool.description).not.toContain('trivial actions');
  });

  it('returns the server-derived reviewed action with a pending status', async () => {
    const buildReviewedAction = jest.fn().mockResolvedValue(reviewedAction);
    const tool = createRequestApprovalTool(undefined, { buildReviewedAction });

    const output = await tool.execute(validApprovalInput);

    expect(buildReviewedAction).toHaveBeenCalledWith({
      toolName: 'update_one_creator',
      proposedArguments: { id: ALICE_ID, creatorStatus: 'QUALIFIED' },
    });
    expect(output).toEqual({
      success: true,
      message: expect.any(String),
      result: {
        request: validApprovalInput,
        reviewedAction,
        status: 'pending',
      },
    });
  });

  it('creates no pending approval when the action is not reviewable', async () => {
    const tool = createRequestApprovalTool(undefined, {
      buildReviewedAction: jest
        .fn()
        .mockRejectedValue(new Error('The creator record does not exist.')),
    });

    await expect(tool.execute(validApprovalInput)).rejects.toThrow(
      'The creator record does not exist.',
    );
  });

  it('refuses a generic approval when no reviewer is configured', async () => {
    await expect(
      createRequestApprovalTool().execute(validApprovalInput),
    ).rejects.toThrow('Generic approval review is unavailable.');
  });

  it('requires the exact proposed arguments for generic approval', () => {
    const { proposedArguments: _proposedArguments, ...withoutArguments } =
      validApprovalInput;

    expect(requestApprovalInputSchema.safeParse(withoutArguments).success).toBe(
      false,
    );
  });

  it('tells the model to learn the schema and reuse identical arguments', () => {
    const { description } = createRequestApprovalTool();

    expect(description).toContain('call learn_tools for that write tool first');
    expect(description).toContain('identical toolName and arguments');
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

  it('requires the exact tool name for generic approval', () => {
    const { toolName: _toolName, ...approvalWithoutToolName } =
      validApprovalInput;

    expect(
      requestApprovalInputSchema.safeParse(approvalWithoutToolName).success,
    ).toBe(false);
  });

  it('dispatches Instagram only to its definition and returns only the binding UUID', async () => {
    const draftId = '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea';
    const input = {
      toolName: 'send_instagram_reply',
      actionInput: { draftId },
    };
    const expectedActionBinding = {
      workspaceId: 'workspace-id',
      actionName: 'send_instagram_message',
      actionVersion: 2,
      actionKind: 'REPLY',
      draftId,
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      actionContextFingerprint: 'd'.repeat(64),
      initiatorUserWorkspaceId: 'member-id',
      threadId: 'thread-id',
      interactionContextType: null,
      interactionContextId: null,
      evidenceLinks: [],
    };
    const instagramDefinition = {
      createThreadReplyAuthority: jest
        .fn()
        .mockResolvedValue({ expectedActionBinding }),
    };
    const outreachDefinition = { propose: jest.fn() };
    const instagramMessagePermissionService = {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
    };
    const instagramMessageRecordAccessService = {
      assertCanReadDraft: jest.fn().mockResolvedValue(undefined),
    };
    const actionApprovalService = {
      createPendingBinding: jest
        .fn()
        .mockResolvedValue({ id: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b' }),
    };
    const factory = createRequestApprovalTool as unknown as (
      options: unknown,
    ) => {
      execute: (value: unknown) => Promise<unknown>;
    };

    expect(requestApprovalInputSchema.parse(input)).toEqual(input);
    await expect(
      factory({
        workspaceId: 'workspace-id',
        userWorkspaceId: 'member-id',
        threadId: 'thread-id',
        actionDefinitions: {
          send_instagram_reply: instagramDefinition,
          send_outreach_email: outreachDefinition,
        },
        actionApprovalService,
        instagramMessagePermissionService,
        instagramMessageRecordAccessService,
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
      }).execute(input),
    ).resolves.toEqual({
      success: true,
      message: expect.any(String),
      result: {
        status: 'pending',
        actionApprovalBindingId: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b',
      },
    });
    expect(
      instagramMessagePermissionService.assertCanSend.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      instagramMessageRecordAccessService.assertCanReadDraft.mock
        .invocationCallOrder[0],
    );
    expect(
      instagramMessageRecordAccessService.assertCanReadDraft.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      instagramDefinition.createThreadReplyAuthority.mock
        .invocationCallOrder[0],
    );
    expect(instagramDefinition.createThreadReplyAuthority).toHaveBeenCalledWith(
      {
        workspaceId: 'workspace-id',
        initiatorUserWorkspaceId: 'member-id',
        threadId: 'thread-id',
        draftId,
      },
    );
    expect(outreachDefinition.propose).not.toHaveBeenCalled();
    expect(actionApprovalService.createPendingBinding).toHaveBeenCalledWith(
      expectedActionBinding,
    );
  });

  it('dispatches outreach only to its definition and returns only the binding UUID', async () => {
    const outreachActionId = '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea';
    const input = {
      toolName: 'send_outreach_email',
      actionInput: { outreachActionId },
    };
    const expectedActionBinding = {
      workspaceId: 'workspace-id',
      actionName: 'send_outreach_email',
      actionVersion: 1,
      draftId: outreachActionId,
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      actionContextFingerprint: 'd'.repeat(64),
      initiatorUserWorkspaceId: 'member-id',
      threadId: 'thread-id',
      evidenceLinks: [],
    };
    const instagramDefinition = { propose: jest.fn() };
    const outreachDefinition = {
      propose: jest.fn().mockResolvedValue({ expectedActionBinding }),
      recordApprovalBinding: jest.fn().mockResolvedValue(undefined),
    };
    const actionApprovalService = {
      createPendingBinding: jest
        .fn()
        .mockResolvedValue({ id: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b' }),
    };
    const factory = createRequestApprovalTool as unknown as (
      options: unknown,
    ) => {
      execute: (value: unknown) => Promise<unknown>;
    };

    expect(requestApprovalInputSchema.parse(input)).toEqual(input);
    await expect(
      factory({
        workspaceId: 'workspace-id',
        userWorkspaceId: 'member-id',
        threadId: 'thread-id',
        actionDefinitions: {
          send_instagram_reply: instagramDefinition,
          send_outreach_email: outreachDefinition,
        },
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
    expect(outreachDefinition.propose).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      initiatorUserWorkspaceId: 'member-id',
      threadId: 'thread-id',
      input: { outreachActionId },
    });
    expect(instagramDefinition.propose).not.toHaveBeenCalled();
    expect(actionApprovalService.createPendingBinding).toHaveBeenCalledWith(
      expectedActionBinding,
    );
    expect(outreachDefinition.recordApprovalBinding).toHaveBeenCalledWith({
      expectedActionBinding,
      approvalBindingId: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b',
    });
  });

  it('dispatches an Inbox reply only to its definition and returns only the binding UUID', async () => {
    const messageThreadId = '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea';
    const input = {
      toolName: 'send_myah_inbox_reply',
      actionInput: { messageThreadId, expectedDraftRevision: 3 },
    };
    const expectedActionBinding = {
      workspaceId: 'workspace-id',
      actionName: 'send_inbox_reply',
      actionVersion: 1,
      draftId: messageThreadId,
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      actionContextFingerprint: 'd'.repeat(64),
      initiatorUserWorkspaceId: 'member-id',
      threadId: 'thread-id',
      evidenceLinks: [],
    };
    const instagramDefinition = { propose: jest.fn() };
    const outreachDefinition = { propose: jest.fn() };
    const inboxDefinition = {
      propose: jest.fn().mockResolvedValue({ expectedActionBinding }),
    };
    const actionApprovalService = {
      createPendingBinding: jest
        .fn()
        .mockResolvedValue({ id: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b' }),
    };
    const factory = createRequestApprovalTool as unknown as (
      options: unknown,
    ) => {
      execute: (value: unknown) => Promise<unknown>;
    };

    expect(requestApprovalInputSchema.parse(input)).toEqual(input);
    await expect(
      factory({
        workspaceId: 'workspace-id',
        userWorkspaceId: 'member-id',
        threadId: 'thread-id',
        actionDefinitions: {
          send_instagram_reply: instagramDefinition,
          send_outreach_email: outreachDefinition,
          send_myah_inbox_reply: inboxDefinition,
        },
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
    expect(inboxDefinition.propose).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      initiatorUserWorkspaceId: 'member-id',
      agentChatThreadId: 'thread-id',
      input: { messageThreadId, expectedDraftRevision: 3 },
    });
    expect(instagramDefinition.propose).not.toHaveBeenCalled();
    expect(outreachDefinition.propose).not.toHaveBeenCalled();
    expect(actionApprovalService.createPendingBinding).toHaveBeenCalledWith(
      expectedActionBinding,
    );
  });

  it.each([
    {
      toolName: 'unknown_tool',
      actionInput: { outreachActionId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea' },
    },
    {
      toolName: 'send_outreach_email',
      actionInput: {
        outreachActionId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
        draftId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
      },
    },
    {
      toolName: 'send_outreach_email',
      actionInput: {
        outreachActionId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
        subject: 'caller supplied',
      },
    },
    {
      ...validApprovalInput,
      toolName: 'send_outreach_email',
    },
    {
      toolName: 'send_myah_inbox_reply',
      actionInput: {
        messageThreadId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
        expectedDraftRevision: 3,
        body: 'caller supplied',
      },
    },
  ])('rejects untrusted or mixed registered approval input', (input) => {
    expect(requestApprovalInputSchema.safeParse(input).success).toBe(false);
  });

  it('requires authenticated registered approval context', async () => {
    const factory = createRequestApprovalTool as unknown as (
      options: unknown,
    ) => {
      execute: (value: unknown) => Promise<unknown>;
    };

    await expect(
      factory({
        workspaceId: 'workspace-id',
        userWorkspaceId: undefined,
        threadId: 'thread-id',
        actionDefinitions: {
          send_instagram_reply: { propose: jest.fn() },
          send_outreach_email: { propose: jest.fn() },
        },
        actionApprovalService: { createPendingBinding: jest.fn() },
      }).execute({
        toolName: 'send_outreach_email',
        actionInput: {
          outreachActionId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
        },
      }),
    ).rejects.toThrow(
      'An authenticated chat thread is required to request registered action approval.',
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

  describe('published JSON Schema', () => {
    type JsonSchemaNode = {
      anyOf?: JsonSchemaNode[];
      oneOf?: JsonSchemaNode[];
      properties?: Record<string, JsonSchemaNode>;
      additionalProperties?: unknown;
    };
    const publishedSchema = async (): Promise<JsonSchemaNode> =>
      (await (
        createRequestApprovalTool().inputSchema as unknown as {
          jsonSchema: unknown;
        }
      ).jsonSchema) as JsonSchemaNode;
    const branches = (node: JsonSchemaNode): JsonSchemaNode[] =>
      node.anyOf || node.oneOf
        ? [...(node.anyOf ?? []), ...(node.oneOf ?? [])].flatMap(branches)
        : [node];

    // Providers enforce this schema strictly, so proposedArguments must accept
    // any exact tool input (MYAH-315 live UAT regression).
    it('lets proposedArguments carry any tool arguments', async () => {
      const generic = branches(await publishedSchema()).find(
        (branch) => branch.properties?.proposedArguments,
      );

      expect(generic?.properties?.proposedArguments).toMatchObject({
        type: 'object',
      });
      expect(
        generic?.properties?.proposedArguments.additionalProperties,
      ).not.toBe(false);
      // Providers reject the whole call on any stray key; the generic branch is
      // published open so Zod's strict check returns a correctable tool error.
      expect(generic?.additionalProperties).toBeUndefined();
    });

    it('rejects stray generic keys on the server with Zod', () => {
      expect(
        requestApprovalInputSchema.safeParse({
          ...validApprovalInput,
          strayKey: true,
        }).success,
      ).toBe(false);
    });

    it('publishes registered send branches as strict objects', async () => {
      const registered = branches(await publishedSchema()).filter(
        (branch) => branch.properties?.actionInput,
      );

      expect(registered).toHaveLength(3);
      for (const branch of registered) {
        expect(branch.additionalProperties).toBe(false);
      }
    });

    it('still validates model input with the approval schema', async () => {
      const validate = (
        createRequestApprovalTool().inputSchema as unknown as {
          validate: (value: unknown) => Promise<{ success: boolean }>;
        }
      ).validate;

      await expect(validate(validApprovalInput)).resolves.toMatchObject({
        success: true,
      });
      await expect(
        validate({ ...validApprovalInput, proposedArguments: undefined }),
      ).resolves.toMatchObject({ success: false });
    });
  });
});
