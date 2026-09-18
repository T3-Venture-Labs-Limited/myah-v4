import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { DataSource, IsNull } from 'typeorm';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { InstagramMessageLocalAuthorityReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { InstagramMessageProposalReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-proposal-reader.service';
import { FieldMetadataType } from 'twenty-shared/types';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { buildLegacyInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { OutreachEmailActionDefinition } from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';

import { MetadataGraphQLApiModule } from 'src/engine/api/graphql/metadata-graphql-api.module';
import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalResolver } from 'src/engine/core-modules/action-approval/action-approval.resolver';

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
  const instagramMessageProposalReader = { read: jest.fn() };
  const outreachActionDefinition = { getProposal: jest.fn() };
  const inboxActionDefinition = { getProposal: jest.fn() };
  const Resolver = ActionApprovalResolver as unknown as new (
    ...args: unknown[]
  ) => ActionApprovalResolver;

  return {
    resolver: new Resolver(
      dataSource,
      actionApprovalService,
      instagramMessageProposalReader,
      outreachActionDefinition,
      inboxActionDefinition,
    ),
    actionApprovalService,
    instagramMessageProposalReader,
    outreachActionDefinition,
    inboxActionDefinition,
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

  it('dispatches an Inbox reply proposal only to its definition', async () => {
    const { resolver, inboxActionDefinition, outreachActionDefinition } =
      createResolver({
        resolvedBinding: {
          ...binding,
          actionName: 'send_inbox_reply',
          state: 'PENDING',
        },
      });
    inboxActionDefinition.getProposal.mockResolvedValue({
      action: 'send_inbox_reply',
      actionVersion: 1,
      body: 'Reply body',
      recipientLabel: 'creator@example.com',
      sendingAccountLabel: 'hello@myah.test',
      subject: 'Re: Partnership',
      draftRevision: 3,
      state: 'PENDING',
      expiresAt: binding.expiresAt,
      occurredAt: binding.createdAt,
      evidenceLinks: [],
    });

    await expect(
      resolver.getActionApprovalProposal(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
    ).resolves.toMatchObject({ action: 'send_inbox_reply' });
    expect(inboxActionDefinition.getProposal).toHaveBeenCalledWith({
      workspaceId,
      binding: expect.objectContaining({ actionName: 'send_inbox_reply' }),
    });
    expect(outreachActionDefinition.getProposal).not.toHaveBeenCalled();
  });

  it('shows the immutable outreach recipient address in the approval projection', async () => {
    const { resolver, outreachActionDefinition } = createResolver({
      resolvedBinding: {
        ...binding,
        actionName: 'send_outreach_email',
        state: 'PENDING',
      },
    });
    outreachActionDefinition.getProposal.mockResolvedValue({
      action: 'send_outreach_email',
      actionVersion: 1,
      body: 'Email body',
      recipientLabel: 'Creator',
      recipientEmail: 'creator@example.com',
      senderEmail: 'brand@example.com',
      subject: 'Partnership',
      state: 'PENDING',
      expiresAt: binding.expiresAt,
      occurredAt: binding.createdAt,
      evidenceLinks: [],
    });

    await expect(
      resolver.getActionApprovalProposal(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
    ).resolves.toMatchObject({
      recipientLabel: 'Creator <creator@example.com>',
      sendingAccountLabel: 'brand@example.com',
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
      subject: null,
      draftRevision: null,
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

  it('renders a pending send_instagram_message v2 reply from the authorized source', async () => {
    const harness = createPreviewHarness();
    await expect(preview(harness)).resolves.toMatchObject({
      action: 'send_instagram_message',
      actionVersion: 2,
      body: draftRecord.body,
      recipientLabel: 'creator',
      sendingAccountLabel: '@brand',
      state: 'PENDING',
    });
    expect(
      harness.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource,
    ).not.toHaveBeenCalled();
    for (const [name] of Object.entries(harness.records)) {
      expect(
        harness.globalWorkspaceOrmManager.getRepository,
      ).toHaveBeenCalledWith(workspaceId, name, {
        intersectionOf: ['current-role'],
      });
    }
  });
});

const draftRecord = {
  id: 'draft-id',
  body: 'Same approved body',
  revision: 2,
  kind: 'REPLY',
  creatorId: 'creator-id',
  recipientUsername: 'creator',
  recipientProviderId: 'recipient-id',
  conversationId: 'conversation-id',
  sentAt: null,
};
const creatorRecord = {
  id: 'creator-id',
  instagramUsername: '@creator',
  instagramUrl: null,
  instagramLink: { primaryLinkUrl: null },
};
const conversationRecord = {
  id: 'conversation-id',
  creatorId: 'creator-id',
  providerConversationId: 'chat-id',
  recipientIgsid: 'recipient-id',
  provider: 'UNIPILE',
  lifecycle: 'ACTIVE',
  instagramAccountId: 'account-id',
};
const accountRecord = {
  id: 'account-id',
  label: '@brand',
  name: 'Brand',
  status: 'ACTIVE',
  unipileAccountId: 'provider-account',
};
const accountBinding = {
  id: 'account-binding',
  workspaceId,
  workspaceInstagramAccountRecordId: 'account-id',
  unipileAccountId: 'provider-account',
  instagramUserId: 'brand-id',
  status: 'ACTIVE',
  deactivatedAt: null,
};
const metadata = [
  ['INSTAGRAM_ACCOUNT', '2d357469-831a-4629-ad4b-47335900e883', 'account-id'],
  [
    'INSTAGRAM_MESSAGE_DRAFT',
    '85762d24-541b-407f-9d6a-cdf89552c665',
    'draft-id',
  ],
  [
    'SOCIAL_CONVERSATION',
    '36817464-855f-42db-9fbb-f8853643f8d6',
    'conversation-id',
  ],
  ['CREATOR', '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator-id'],
].map(([role, universalIdentifier, recordId]) => ({
  role,
  universalIdentifier,
  recordId,
  id: `${role}-metadata`,
  workspaceId,
}));

// Real Twenty field/object validation at a mocked repository boundary (not SQL/RLS).
const validateSelection = (
  objectName: string,
  record: Record<string, unknown>,
  select: Record<string, boolean>,
  deniedField?: string,
  denyObject = false,
) => {
  const fields = [...new Set([...Object.keys(record), 'unrelated'])].map(
    (name) => ({ id: name, name, type: FieldMetadataType.TEXT }),
  );
  validateOperationIsPermittedOrThrow({
    entityName: objectName,
    operationType: 'select',
    objectsPermissions: {
      object: {
        canReadObjectRecords: !denyObject,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields: deniedField
          ? { [deniedField]: { canRead: false } }
          : {},
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      },
    },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        object: {
          id: 'object',
          universalIdentifier: 'object',
          nameSingular: objectName,
          isSystem: false,
          fieldIds: fields.map(({ id }) => id),
        } as FlatObjectMetadata,
      },
      universalIdentifierById: { object: 'object' },
      universalIdentifiersByApplicationId: {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        fields.map((field) => [field.id, field as FlatFieldMetadata]),
      ),
      universalIdentifierById: Object.fromEntries(
        fields.map(({ id }) => [id, id]),
      ),
      universalIdentifiersByApplicationId: {},
    },
    objectIdByNameSingular: { [objectName]: 'object' },
    selectedColumns: Object.keys(select).filter((key) => select[key]),
    allFieldsSelected: false,
    updatedColumns: [],
  });
};
const createPreviewHarness = (
  input: {
    deniedObject?: string;
    deniedField?: string;
    hiddenObject?: string;
    draft?: Record<string, unknown>;
    conversation?: Record<string, unknown>;
    creator?: Record<string, unknown>;
    accountBinding?: Record<string, unknown>;
  } = {},
) => {
  const records: Record<string, Record<string, unknown>> = {
    myahInstagramReplyDraft: { ...draftRecord, ...input.draft },
    myahSocialConversation: { ...conversationRecord, ...input.conversation },
    creator: { ...creatorRecord, ...input.creator },
    myahInstagramAccount: { ...accountRecord },
  };
  const expected = buildLegacyInstagramMessageActionAuthority({
    workspaceId,
    initiatorUserWorkspaceId: userWorkspaceId,
    threadId: binding.threadId,
    interactionContextType: null,
    interactionContextId: null,
    draft: {
      id: draftRecord.id,
      body: draftRecord.body,
      revision: draftRecord.revision,
      kind: 'REPLY',
      creatorRecordId: draftRecord.creatorId,
      recipientUsername: draftRecord.recipientUsername,
      recipientProviderId: draftRecord.recipientProviderId,
      recipientSourceValues: [
        { field: 'instagramUsername', value: '@creator' },
      ],
      conversationRecordId: draftRecord.conversationId,
      providerConversationId: conversationRecord.providerConversationId,
    },
    account: {
      bindingId: accountBinding.id,
      workspaceInstagramAccountRecordId:
        accountBinding.workspaceInstagramAccountRecordId,
      unipileAccountId: accountBinding.unipileAccountId,
      instagramUserId: accountBinding.instagramUserId,
    },
    evidenceLinks: metadata.map(({ id: objectMetadataId, recordId, role }) => ({
      objectMetadataId,
      recordId,
      role,
    })),
  });
  const storedBinding = {
    ...binding,
    ...expected.expectedActionBinding,
    state: 'PENDING',
    expiresAt: new Date('2099-07-16T10:30:00.000Z'),
  };
  const repositories = Object.fromEntries(
    Object.entries(records).map(([name, record]) => [
      name,
      {
        findOne: jest.fn(async ({ select, where }) => {
          validateSelection(
            name,
            record,
            select,
            input.deniedObject === name ? input.deniedField : 'unrelated',
            input.deniedObject === name && !input.deniedField,
          );
          return input.hiddenObject === name || record.id !== where.id
            ? null
            : Object.fromEntries(
                Object.keys(select).map((key) => [key, record[key]]),
              );
        }),
      },
    ]),
  );
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) =>
      withWorkspaceContext(
        {
          userWorkspaceRoleMap: { [userWorkspaceId]: 'current-role' },
          apiKeyRoleMap: {},
        } as never,
        callback,
      ),
    ),
    getRepository: jest.fn(async (_workspaceId, name) => repositories[name]),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
      query: jest
        .fn()
        .mockResolvedValue([
          { ...records.myahInstagramReplyDraft, accountLabel: '@brand' },
        ]),
    }),
  };
  const actionApprovalService = {
    getBindingForViewer: jest.fn(
      async ({ workspaceId: requestedWorkspace, userWorkspaceId: viewer }) => {
        if (requestedWorkspace !== workspaceId || viewer !== userWorkspaceId)
          throw new Error('Action approval evidence was not found');
        return storedBinding;
      },
    ),
  };
  const Resolver = ActionApprovalResolver as unknown as new (
    ...args: unknown[]
  ) => ActionApprovalResolver;
  const localReader = new InstagramMessageLocalAuthorityReaderService(
    { findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }) } as never,
    globalWorkspaceOrmManager as never,
    {
      find: jest
        .fn()
        .mockResolvedValue([{ ...accountBinding, ...input.accountBinding }]),
    } as never,
    { find: jest.fn().mockResolvedValue(metadata) } as never,
  );
  const proposalReader = new InstagramMessageProposalReaderService(
    globalWorkspaceOrmManager as never,
    localReader,
  );
  const resolver = new Resolver({}, actionApprovalService, proposalReader);
  return {
    resolver,
    storedBinding,
    globalWorkspaceOrmManager,
    repositories,
    actionApprovalService,
    records,
  };
};
const preview = (harness: ReturnType<typeof createPreviewHarness>) =>
  withWorkspaceAuthContext(
    { type: 'user', workspace: { id: workspaceId }, userWorkspaceId } as never,
    () =>
      harness.resolver.getActionApprovalProposal(
        bindingId,
        { id: workspaceId } as never,
        userWorkspaceId,
      ),
  );

describe('ActionApprovalResolver Instagram preview authorization and identity', () => {
  it.each([
    'myahInstagramReplyDraft',
    'myahSocialConversation',
    'myahInstagramAccount',
    'creator',
  ])(
    'denies revoked %s object permission while the viewer still owns the binding',
    async (deniedObject) => {
      await expect(
        preview(createPreviewHarness({ deniedObject })),
      ).rejects.toThrow();
    },
  );
  it.each([
    ['myahInstagramReplyDraft', 'body'],
    ['myahInstagramReplyDraft', 'revision'],
    ['myahInstagramReplyDraft', 'recipientUsername'],
    ['myahSocialConversation', 'instagramAccountId'],
    ['myahSocialConversation', 'creatorId'],
    ['myahSocialConversation', 'providerConversationId'],
    ['myahInstagramAccount', 'label'],
    ['myahInstagramAccount', 'name'],
    ['creator', 'instagramUsername'],
  ])(
    'denies restricted %s.%s without exposing body or labels',
    async (deniedObject, deniedField) => {
      await expect(
        preview(createPreviewHarness({ deniedObject, deniedField })),
      ).rejects.toThrow(`no permission to read field "${deniedField}"`);
    },
  );
  it.each([
    'myahInstagramReplyDraft',
    'myahSocialConversation',
    'myahInstagramAccount',
    'creator',
  ])('denies a deleted/record-hidden %s', async (hiddenObject) => {
    await expect(
      preview(createPreviewHarness({ hiddenObject })),
    ).rejects.toThrow();
  });
  it.each([
    { draft: { revision: 3 } },
    { draft: { body: 'Changed body' } },
    { draft: { kind: 'FIRST_MESSAGE' } },
    { draft: { conversationId: 'other-conversation' } },
    { draft: { recipientUsername: 'other' } },
    { draft: { recipientProviderId: 'other' } },
    { draft: { creatorId: 'other-creator' } },
    { conversation: { providerConversationId: 'other-chat' } },
    { conversation: { instagramAccountId: 'other-account' } },
    { creator: { instagramUsername: '@other' } },
    { creator: { instagramUsername: '@Creator' } },
    {
      draft: { conversationId: 'other-conversation' },
      conversation: { id: 'other-conversation' },
    },
    { draft: { creatorId: 'other-creator' }, creator: { id: 'other-creator' } },
    { accountBinding: { id: 'other-binding' } },
    { accountBinding: { instagramUserId: 'other-owner' } },
    { accountBinding: { unipileAccountId: 'other-provider-account' } },
  ])('rejects same-body source drift %j', async (input) => {
    await expect(preview(createPreviewHarness(input))).rejects.toThrow();
  });
});

describe('ActionApprovalResolver local reader wiring and compatibility', () => {
  it('resolves the registered preview chain without an Instagram execution module or provider client', async () => {
    const providers = Reflect.getMetadata('providers', ActionApprovalModule);
    const scopedToken = getWorkspaceScopedRepositoryToken(
      UnipileInstagramAccountBindingEntity,
    );
    const localProviders = providers.filter(
      (provider: { provide?: unknown }) =>
        [
          ActionApprovalResolver,
          InstagramMessageProposalReaderService,
          InstagramMessageLocalAuthorityReaderService,
        ].includes(provider as never) || provider.provide === scopedToken,
    );
    expect(localProviders).toHaveLength(4);
    const module = await Test.createTestingModule({
      providers: [
        ...localProviders,
        ...[
          DataSource,
          ActionApprovalService,
          GlobalWorkspaceOrmManager,
          PermissionsService,
          getRepositoryToken(WorkspaceEntity),
          getRepositoryToken(ObjectMetadataEntity),
          getRepositoryToken(UnipileInstagramAccountBindingEntity),
          OutreachEmailActionDefinition,
          MyahInboxReplyActionDefinition,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    expect(module.get(ActionApprovalResolver)).toBeInstanceOf(
      ActionApprovalResolver,
    );
    expect(
      module.get(InstagramMessageLocalAuthorityReaderService),
    ).toBeInstanceOf(InstagramMessageLocalAuthorityReaderService);
    expect(
      Reflect.getMetadata('imports', ActionApprovalModule).map(
        (entry: { name?: string }) => entry.name,
      ),
    ).not.toEqual(expect.arrayContaining(['InstagramMessageModule']));
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        InstagramMessageLocalAuthorityReaderService,
      ),
    ).toHaveLength(4);
    await module.close();
  });

  it('keeps unchanged v2 history readable without send flags and uses exact field selections', async () => {
    const harness = createPreviewHarness();
    harness.storedBinding.state = 'CONSUMED';
    await expect(preview(harness)).resolves.toMatchObject({
      state: 'CONSUMED',
      body: draftRecord.body,
    });
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).toHaveBeenCalledWith({
      where: { id: accountRecord.id, deletedAt: IsNull() },
      select: { id: true, label: true, name: true },
    });
    expect(
      harness.repositories.myahInstagramReplyDraft.findOne,
    ).toHaveBeenCalledWith({
      where: { id: draftRecord.id, deletedAt: IsNull() },
      select: {
        id: true,
        body: true,
        revision: true,
        kind: true,
        creatorId: true,
        recipientUsername: true,
        recipientProviderId: true,
        conversationId: true,
      },
    });
  });

  it('does not render stale history under a consumed binding', async () => {
    const harness = createPreviewHarness({ draft: { revision: 3 } });
    harness.storedBinding.state = 'CONSUMED';
    await expect(preview(harness)).rejects.toThrow(
      'source graph is unavailable',
    );
  });

  it('rejects evidence-link drift even with matching fingerprints', async () => {
    const harness = createPreviewHarness();
    harness.storedBinding.evidenceLinks[0].recordId = 'other-account';
    await expect(preview(harness)).rejects.toThrow('proposal is unavailable');
  });

  it.each(['wrong-viewer', 'wrong-workspace'])(
    'rejects %s before source loading',
    async (mismatch) => {
      const harness = createPreviewHarness();
      await expect(
        harness.resolver.getActionApprovalProposal(
          bindingId,
          {
            id:
              mismatch === 'wrong-workspace'
                ? 'foreign-workspace'
                : workspaceId,
          } as never,
          mismatch === 'wrong-viewer' ? 'foreign-viewer' : userWorkspaceId,
        ),
      ).rejects.toThrow('evidence was not found');
      expect(
        harness.globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['user', 'system'])(
    'rejects a mismatched or system %s auth context despite binding ownership',
    async (type) => {
      const harness = createPreviewHarness();
      await expect(
        withWorkspaceAuthContext(
          {
            type,
            workspace: { id: workspaceId },
            userWorkspaceId: 'foreign-viewer',
          } as never,
          () =>
            harness.resolver.getActionApprovalProposal(
              bindingId,
              { id: workspaceId } as never,
              userWorkspaceId,
            ),
        ),
      ).rejects.toThrow('matching authenticated user context');
      expect(
        harness.globalWorkspaceOrmManager.getRepository,
      ).not.toHaveBeenCalled();
    },
  );

  it('fails closed if the current role assignment was removed', async () => {
    const harness = createPreviewHarness();
    harness.globalWorkspaceOrmManager.executeInWorkspaceContext.mockImplementation(
      async (callback) =>
        withWorkspaceContext(
          { userWorkspaceRoleMap: {}, apiKeyRoleMap: {} } as never,
          callback,
        ),
    );
    await expect(preview(harness)).rejects.toThrow(
      'read permissions are required',
    );
    expect(
      harness.globalWorkspaceOrmManager.getRepository,
    ).not.toHaveBeenCalled();
  });

  it.each(['send_outreach_email', 'send_inbox_reply'])(
    'preserves %s redacted behavior without Instagram reads',
    async (actionName) => {
      const { resolver } = createResolver({
        resolvedBinding: { ...binding, actionName },
      });
      await expect(
        resolver.getActionApprovalProposal(
          bindingId,
          { id: workspaceId } as never,
          userWorkspaceId,
        ),
      ).resolves.toMatchObject({
        action: actionName,
        body: null,
        recipientLabel: null,
        sendingAccountLabel: null,
      });
    },
  );
});

describe('ActionApprovalResolver current conversation Creator linkage', () => {
  it.each([null, 'replacement-creator'])(
    'does not relabel a saved reply after Creator link becomes %s',
    async (creatorId) => {
      const harness = createPreviewHarness();
      await expect(preview(harness)).resolves.toMatchObject({
        body: draftRecord.body,
        recipientLabel: 'creator',
      });
      harness.records.myahSocialConversation.creatorId = creatorId;
      await expect(preview(harness)).rejects.toThrow(
        'REPLY draft target is stale',
      );
      expect(harness.records.myahInstagramReplyDraft).toEqual(draftRecord);
      expect(
        harness.repositories.myahSocialConversation.findOne,
      ).toHaveBeenLastCalledWith({
        where: { id: conversationRecord.id, deletedAt: IsNull() },
        select: {
          id: true,
          creatorId: true,
          providerConversationId: true,
          recipientIgsid: true,
          provider: true,
          lifecycle: true,
          instagramAccountId: true,
        },
      });
      harness.records.myahSocialConversation.creatorId = draftRecord.creatorId;
      await expect(preview(harness)).resolves.toMatchObject({
        body: draftRecord.body,
        recipientLabel: 'creator',
      });
      expect(
        harness.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource,
      ).not.toHaveBeenCalled();
    },
  );
});
