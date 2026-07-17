import { MetadataGraphQLApiModule } from 'src/engine/api/graphql/metadata-graphql-api.module';
import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalResolver } from 'src/engine/core-modules/action-approval/action-approval.resolver';
import { AgentChatThreadEntity } from 'src/engine/metadata-modules/ai/ai-chat/entities/agent-chat-thread.entity';

const workspaceId = 'workspace-id';
const userWorkspaceId = 'user-workspace-id';
const bindingId = 'binding-id';

const binding = {
  id: bindingId,
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  threadId: 'thread-id',
  actionName: 'send_instagram_reply',
  actionVersion: 1,
  state: 'CONSUMED',
  createdAt: new Date('2026-07-16T10:00:00.000Z'),
  decidedAt: new Date('2026-07-16T10:01:00.000Z'),
  expiresAt: new Date('2026-07-16T10:30:00.000Z'),
  draftId: 'draft-body-must-not-leak',
  contentDigest: 'digest-must-not-leak',
  recipientFingerprint: 'recipient-must-not-leak',
  sendingAccountFingerprint: 'account-must-not-leak',
  evidenceLinks: [
    {
      objectMetadataId: 'object-metadata-id',
      recordId: 'record-id',
      role: 'recipient',
      rawProviderPayload: 'raw-provider-payload-must-not-leak',
    },
  ],
};

const receipt = {
  id: 'receipt-id',
  workspaceId,
  actionApprovalBindingId: bindingId,
  state: 'PROVIDER_ACCEPTED',
  updatedAt: new Date('2026-07-16T10:02:00.000Z'),
  redactedOutcome: 'accepted',
  providerMessageId: 'provider-message-id-must-not-leak',
  providerCode: 'provider-token-must-not-leak',
  rawFailureReason: 'raw-failure-must-not-leak',
};

const serverDerivedProposal = {
  action: 'send_instagram_reply',
  actionVersion: 1,
  body: 'Server-derived reply body',
  recipientLabel: '@recipient',
  sendingAccountLabel: '@myah_business',
  state: binding.state,
  expiresAt: binding.expiresAt,
  occurredAt: binding.decidedAt,
  evidenceLinks: binding.evidenceLinks.map(
    ({ objectMetadataId, recordId, role }) => ({
      objectMetadataId,
      recordId,
      role,
    }),
  ),
};

const createResolver = ({
  resolvedBinding = binding,
  resolvedThread = {
    id: binding.threadId,
    workspaceId,
    userWorkspaceId,
  },
  resolvedReceipt = receipt,
  resolvedProposal = serverDerivedProposal,
}: {
  resolvedBinding?: typeof binding | null;
  resolvedThread?: { id: string; workspaceId: string; userWorkspaceId: string } | null;
  resolvedReceipt?: typeof receipt | null;
  resolvedProposal?: typeof serverDerivedProposal | Error;
} = {}) => {
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue(resolvedBinding),
  };
  const threadRepository = {
    findOne: jest.fn().mockResolvedValue(resolvedThread),
  };
  const receiptRepository = {
    findOne: jest.fn().mockResolvedValue(resolvedReceipt),
  };
  const dataSource = {
    getRepository: jest.fn((entity) => {
      if (entity === ActionApprovalBindingEntity) {
        return bindingRepository;
      }
      if (entity === AgentChatThreadEntity) {
        return threadRepository;
      }
      if (entity === ActionExecutionReceiptEntity) {
        return receiptRepository;
      }
      throw new Error('Unexpected repository');
    }),
  };
  const actionApprovalService = {
    getBindingForViewer: jest.fn().mockImplementation(async () => {
      if (
        !resolvedBinding ||
        resolvedBinding.initiatorUserWorkspaceId !== userWorkspaceId ||
        !resolvedThread
      ) {
        throw new Error('Action approval evidence was not found');
      }
      return resolvedBinding;
    }),
  };
  const actionDefinition = {
    getProposal: jest.fn().mockImplementation(async () => {
      if (resolvedProposal instanceof Error) {
        throw resolvedProposal;
      }
      return resolvedProposal;
    }),
  };
  const Resolver = ActionApprovalResolver as unknown as new (
    ...args: unknown[]
  ) => ActionApprovalResolver;

  return {
    resolver: new Resolver(
      dataSource,
      actionApprovalService,
      actionDefinition,
    ),
    actionApprovalService,
    actionDefinition,
    bindingRepository,
    threadRepository,
    receiptRepository,
  };
};

describe('ActionApprovalResolver', () => {
  it('registers action approval resolvers in the metadata GraphQL module', () => {
    const imports = Reflect.getMetadata('imports', MetadataGraphQLApiModule);

    expect(imports).toContain(ActionApprovalModule);
  });
  it('rejects a foreign workspace member before loading a proposal graph', async () => {
    const { resolver, actionApprovalService, threadRepository } = createResolver({
      resolvedBinding: {
        ...binding,
        initiatorUserWorkspaceId: 'foreign-user-workspace-id',
      },
    });

    await expect(
      resolver.getActionApprovalProposal(bindingId, { id: workspaceId } as never, userWorkspaceId),
    ).rejects.toThrow('Action approval evidence was not found');
    expect(actionApprovalService.getBindingForViewer).toHaveBeenCalledWith({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });
    expect(threadRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects a non-owner thread before mapping a receipt DTO', async () => {
    const { resolver, receiptRepository } = createResolver({
      resolvedThread: null,
    });

    await expect(
      resolver.getActionExecutionReceipt(bindingId, { id: workspaceId } as never, userWorkspaceId),
    ).rejects.toThrow('Action approval evidence was not found');
    expect(receiptRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns the exact guarded server-derived proposal and preserves redacted evidence', async () => {
    const { resolver, actionDefinition } = createResolver();

    await expect(
      resolver.getActionApprovalProposal(bindingId, { id: workspaceId } as never, userWorkspaceId),
    ).resolves.toEqual(serverDerivedProposal);
    expect(actionDefinition.getProposal).toHaveBeenCalledWith({
      workspaceId,
      binding,
    });
    await expect(
      resolver.getActionExecutionReceipt(bindingId, { id: workspaceId } as never, userWorkspaceId),
    ).resolves.toEqual({
      state: 'PROVIDER_ACCEPTED',
      occurredAt: receipt.updatedAt,
      outcome: 'accepted',
      evidenceLinks: [
        {
          objectMetadataId: 'object-metadata-id',
          recordId: 'record-id',
          role: 'recipient',
        },
      ],
    });

    const serialized = JSON.stringify(
      await resolver.getActionExecutionReceipt(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
    );
    for (const unsafeValue of [
      'draft-body-must-not-leak',
      'digest-must-not-leak',
      'recipient-must-not-leak',
      'account-must-not-leak',
      'raw-provider-payload-must-not-leak',
      'provider-message-id-must-not-leak',
      'provider-token-must-not-leak',
      'raw-failure-must-not-leak',
    ]) {
      expect(serialized).not.toContain(unsafeValue);
    }
  });

  it('rejects a mismatched graph instead of returning an approvable proposal', async () => {
    const { resolver } = createResolver({
      resolvedBinding: { ...binding, state: 'PENDING' },
      resolvedProposal: new Error('Instagram reply source graph is unavailable'),
    });

    await expect(
      resolver.getActionApprovalProposal(bindingId, { id: workspaceId } as never, userWorkspaceId),
    ).rejects.toThrow('Instagram reply source graph is unavailable');
  });

  it('preserves redacted terminal evidence after projection makes the draft non-actionable', async () => {
    const terminalBinding = {
      ...binding,
      state: 'CONSUMED',
    };
    const { resolver } = createResolver({
      resolvedBinding: terminalBinding,
      resolvedProposal: new Error('Instagram reply source graph is unavailable'),
    });

    await expect(
      resolver.getActionApprovalProposal(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
    ).resolves.toEqual({
      action: 'send_instagram_reply',
      actionVersion: 1,
      body: null,
      recipientLabel: null,
      sendingAccountLabel: null,
      state: 'CONSUMED',
      expiresAt: binding.expiresAt,
      occurredAt: binding.decidedAt,
      evidenceLinks: [
        {
          objectMetadataId: 'object-metadata-id',
          recordId: 'record-id',
          role: 'recipient',
        },
      ],
    });
  });
});
