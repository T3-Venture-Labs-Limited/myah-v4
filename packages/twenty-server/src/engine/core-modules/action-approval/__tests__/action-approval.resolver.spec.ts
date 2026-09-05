import { MetadataGraphQLApiModule } from 'src/engine/api/graphql/metadata-graphql-api.module';
import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalResolver } from 'src/engine/core-modules/action-approval/action-approval.resolver';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

const workspaceId = '00000000-0000-4000-8000-000000000001';
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

const createResolver = ({
  resolvedBinding = binding,
  resolvedReceipt = receipt,
}: {
  resolvedBinding?: typeof binding | null;
  resolvedReceipt?: typeof receipt | null;
} = {}) => {
  const receiptRepository = {
    findOne: jest.fn().mockResolvedValue(resolvedReceipt),
  };
  const dataSource = {
    getRepository: jest.fn((entity) => {
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
        resolvedBinding.initiatorUserWorkspaceId !== userWorkspaceId
      ) {
        throw new Error('Action approval evidence was not found');
      }
      return resolvedBinding;
    }),
  };
  const Resolver = ActionApprovalResolver as unknown as new (
    ...args: unknown[]
  ) => ActionApprovalResolver;

  return {
    resolver: new Resolver(dataSource, actionApprovalService, {}),
    actionApprovalService,
    receiptRepository,
  };
};

describe('ActionApprovalResolver', () => {
  it('registers action approval resolvers in the metadata GraphQL module', () => {
    const imports = Reflect.getMetadata('imports', MetadataGraphQLApiModule);

    expect(imports).toContain(ActionApprovalModule);
  });

  it('rejects a foreign workspace member before loading approval evidence', async () => {
    const { resolver, actionApprovalService } = createResolver({
      resolvedBinding: {
        ...binding,
        initiatorUserWorkspaceId: 'foreign-user-workspace-id',
      },
    });

    await expect(
      resolver.getActionApprovalProposal(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
    ).rejects.toThrow('Action approval evidence was not found');
    expect(actionApprovalService.getBindingForViewer).toHaveBeenCalledWith({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });
  });

  it('renders a legacy Instagram receipt as redacted historical evidence', async () => {
    const { resolver } = createResolver();

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
    await expect(
      resolver.getActionExecutionReceipt(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
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
  });

  it('renders a pending send_instagram_message v2 reply from the Unipile draft', async () => {
    const body = 'Server-owned Unipile reply';
    const v2Binding = {
      ...binding,
      actionName: 'send_instagram_message',
      actionVersion: 2,
      actionKind: 'REPLY',
      state: 'PENDING',
      contentDigest: computeActionContentDigest(body),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(async (callback) => callback()),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue([
          {
            body,
            recipientUsername: '@creator',
            accountLabel: '@brand',
          },
        ]),
      }),
    };
    const Resolver = ActionApprovalResolver as unknown as new (
      ...args: unknown[]
    ) => ActionApprovalResolver;
    const resolver = new Resolver(
      {} as never,
      {
        getBindingForViewer: jest.fn().mockResolvedValue(v2Binding),
      } as never,
      globalWorkspaceOrmManager as never,
    );

    await expect(
      resolver.getActionApprovalProposal(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
    ).resolves.toMatchObject({
      action: 'send_instagram_message',
      actionVersion: 2,
      body,
      recipientLabel: '@creator',
      sendingAccountLabel: '@brand',
      state: 'PENDING',
    });
  });
});
