import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { FieldMetadataType } from 'twenty-shared/types';

import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { IsNull } from 'typeorm';

import { InstagramMessageDraftService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { InstagramMessageResolver } from 'src/engine/core-modules/instagram-message/resolvers/instagram-message.resolver';

const mockGetWorkspaceAuthContext = jest.fn();
const mockGetWorkspaceContext = jest.fn();
const mockResolveRolePermissionConfig = jest.fn();

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: () => mockGetWorkspaceAuthContext(),
  }),
);

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: () => mockGetWorkspaceContext(),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: (...args: unknown[]) =>
      mockResolveRolePermissionConfig(...args),
  }),
);

describe('InstagramMessageResolver', () => {
  it('keeps permissionless draft reads denied while an authorized missing draft returns null', async () => {
    const workspaceId = '20202020-3b29-4b61-a263-5a0a61b7b395';
    const userWorkspaceId = '20202020-4b29-4b61-a263-5a0a61b7b395';
    const workspaceMemberId = '20202020-5b29-4b61-a263-5a0a61b7b395';
    const workspace = { id: workspaceId } as WorkspaceEntity;
    const authContext = {
      type: 'user',
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      user: { id: '20202020-6b29-4b61-a263-5a0a61b7b395' },
    };
    const rolePermissionConfig = { roleId: 'role-id' };
    let hasWorkspaceContext = false;

    mockGetWorkspaceAuthContext.mockReturnValue(authContext);
    mockGetWorkspaceContext.mockImplementation(() => {
      if (!hasWorkspaceContext) {
        throw new Error(
          'Workspace context not set. Operations must be wrapped with withWorkspaceContext()',
        );
      }

      return {
        userWorkspaceRoleMap: new Map(),
        apiKeyRoleMap: new Map(),
      };
    });
    mockResolveRolePermissionConfig.mockReturnValue(rolePermissionConfig);

    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => Promise<unknown>) => {
          hasWorkspaceContext = true;
          try {
            return await callback();
          } finally {
            hasWorkspaceContext = false;
          }
        },
      ),
    };
    const permissionService = {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
    };
    const assertWorkspaceContext = () => {
      if (!hasWorkspaceContext) {
        throw new Error(
          'Workspace context not set. Operations must be wrapped with withWorkspaceContext()',
        );
      }
    };
    const recordAccessService = {
      assertCanSaveDraft: jest.fn().mockImplementation(assertWorkspaceContext),
      assertCanReadDraft: jest.fn().mockImplementation(assertWorkspaceContext),
    };
    const draftService = {
      getDraftForTarget: jest.fn().mockImplementation(() => {
        assertWorkspaceContext();
        return null;
      }),
    };
    const resolver = Reflect.construct(InstagramMessageResolver, [
      {},
      draftService,
      {},
      recordAccessService,
      {},
      permissionService,
      globalWorkspaceOrmManager,
    ]) as InstagramMessageResolver;

    await expect(
      resolver.instagramMessageDraft(
        {
          kind: 'REPLY',
          creatorRecordId: null,
          conversationRecordId: '20202020-7b29-4b61-a263-5a0a61b7b395',
        },
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).resolves.toBeNull();

    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), authContext);
    expect(permissionService.assertCanSend).toHaveBeenCalled();
    expect(recordAccessService.assertCanSaveDraft).toHaveBeenCalled();

    permissionService.assertCanSend.mockRejectedValueOnce(
      new Error('Instagram message send permission is required'),
    );
    await expect(
      resolver.instagramMessageDraft(
        {
          kind: 'REPLY',
          creatorRecordId: null,
          conversationRecordId: '20202020-7b29-4b61-a263-5a0a61b7b395',
        },
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).rejects.toThrow('Instagram message send permission is required');
    expect(draftService.getDraftForTarget).toHaveBeenCalledTimes(1);
  });
});

// Model the repository's selected-column permission check with Twenty's real validator.
// Persistence and role resolution remain test doubles; this does not exercise SQL/RLS.
const validateDraftSelection = (
  select: Record<string, boolean>,
  deniedField?: string,
  canReadObjectRecords = true,
) => {
  const fields = [
    { id: 'id-field', name: 'id', type: FieldMetadataType.UUID },
    { id: 'body-field', name: 'body', type: FieldMetadataType.TEXT },
    { id: 'revision-field', name: 'revision', type: FieldMetadataType.NUMBER },
    { id: 'title-field', name: 'title', type: FieldMetadataType.TEXT },
  ];

  validateOperationIsPermittedOrThrow({
    entityName: 'myahInstagramReplyDraft',
    operationType: 'select',
    objectsPermissions: {
      'draft-object': {
        canReadObjectRecords,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields: deniedField
          ? { [`${deniedField}-field`]: { canRead: false } }
          : {},
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      },
    },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        'draft-object': {
          id: 'draft-object',
          universalIdentifier: 'draft-object',
          nameSingular: 'myahInstagramReplyDraft',
          isSystem: false,
          fieldIds: fields.map(({ id }) => id),
        } as FlatObjectMetadata,
      },
      universalIdentifierById: { 'draft-object': 'draft-object' },
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
    objectIdByNameSingular: { myahInstagramReplyDraft: 'draft-object' },
    selectedColumns: Object.keys(select).filter((column) => select[column]),
    allFieldsSelected: false,
    updatedColumns: [],
  });
};

const buildFieldPermissionHarness = (deniedField?: string) => {
  const workspaceId = '20202020-3b29-4b61-a263-5a0a61b7b395';
  const workspace = { id: workspaceId } as WorkspaceEntity;
  const userWorkspaceId = 'user-workspace-id';
  const workspaceMemberId = 'workspace-member-id';
  const draft = { id: 'draft-id', revision: 4, body: 'Restricted remote edit' };
  const rolePermissionConfig = { unionOf: ['current-role-id'] };
  const authContext = {
    type: 'user',
    workspace,
    userWorkspaceId,
    workspaceMemberId,
    user: { id: 'user-id' },
  };
  let currentContext = authContext as {
    type: string;
    workspace: WorkspaceEntity;
  };
  const draftRepository = {
    findOne: jest.fn(
      async ({ select }: { select: Record<string, boolean> }) => {
        expect(currentContext).toBe(authContext);
        validateDraftSelection(select, deniedField);

        return draft;
      },
    ),
  };
  const conversationRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'conversation-id',
      instagramAccountId: 'account-id',
    }),
  };
  // The real draft service executes its system/bypass SQL against this in-memory adapter.
  const query = jest.fn(async (sql: string) => {
    expect(currentContext.type).toBe('system');
    if (sql.includes('"_myahSocialConversation"')) {
      return [
        {
          id: 'conversation-id',
          creatorId: 'creator-id',
          recipientIgsid: 'provider-id',
        },
      ];
    }
    if (sql.includes('"creator"')) {
      return [{ instagramUsername: 'creator.name' }];
    }
    if (sql.trimStart().startsWith('UPDATE')) return [[], 0];
    if (sql.trimStart().startsWith('INSERT')) return [];

    return [draft];
  });
  const dataSource = {
    query,
    transaction: jest.fn(async (callback) => callback({ queryRunner: {} })),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback, context) => {
      const previous = currentContext;
      currentContext = context;
      try {
        return await callback();
      } finally {
        currentContext = previous;
      }
    }),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
    getRepository: jest.fn(
      async (requestedWorkspaceId, objectName, requestedRole) => {
        expect(requestedWorkspaceId).toBe(workspaceId);
        expect(requestedRole).toBe(rolePermissionConfig);
        expect(currentContext).toBe(authContext);

        return objectName === 'myahInstagramReplyDraft'
          ? draftRepository
          : conversationRepository;
      },
    ),
  };
  mockGetWorkspaceAuthContext.mockReturnValue(authContext);
  mockGetWorkspaceContext.mockImplementation(() => {
    expect(currentContext).toBe(authContext);

    return { userWorkspaceRoleMap: new Map(), apiKeyRoleMap: new Map() };
  });
  mockResolveRolePermissionConfig.mockReturnValue(rolePermissionConfig);
  const draftService = new InstagramMessageDraftService(
    { findOneBy: jest.fn().mockResolvedValue(workspace) } as never,
    globalWorkspaceOrmManager as never,
    { isDraftExecutionLocked: jest.fn().mockResolvedValue(false) } as never,
    { withLock: jest.fn(async (_input, callback) => callback()) } as never,
  );
  const recordAccessService = new InstagramMessageRecordAccessService(
    globalWorkspaceOrmManager as never,
    {} as never,
  );
  const permissionService = {
    assertCanSend: jest.fn().mockResolvedValue(undefined),
  };
  const resolver = new InstagramMessageResolver(
    {} as never,
    draftService,
    {} as never,
    recordAccessService,
    {} as never,
    permissionService as never,
    globalWorkspaceOrmManager as never,
  );
  const target = {
    kind: 'REPLY' as const,
    creatorRecordId: null,
    conversationRecordId: 'conversation-id',
  };

  return {
    draftRepository,
    query,
    permissionService,
    get: () =>
      resolver.instagramMessageDraft(
        target,
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    save: (expectedRevision: number) =>
      resolver.saveInstagramMessageDraft(
        {
          ...target,
          draftId: draft.id,
          expectedRevision,
          body: 'Stale local edit',
        },
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    expected: {
      status: 'SAVED',
      draftId: draft.id,
      revision: draft.revision,
      body: draft.body,
      executionLocked: false,
    },
  };
};

describe('InstagramMessageResolver returned draft field authorization', () => {
  it.each(['body', 'revision'])(
    'does not return system-read GET data when %s is restricted',
    async (deniedField) => {
      const harness = buildFieldPermissionHarness(deniedField);

      await expect(harness.get()).rejects.toThrow(
        `no permission to read field "${deniedField}"`,
      );
      expect(harness.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT "id", "revision", "body"'),
        ['REPLY', 'conversation-id'],
        undefined,
        { shouldBypassPermissionChecks: true },
      );
      expect(harness.permissionService.assertCanSend).toHaveBeenCalled();
    },
  );

  it.each(['body', 'revision'])(
    'does not return a create-collision conflict when %s is restricted',
    async (deniedField) => {
      const harness = buildFieldPermissionHarness(deniedField);

      await expect(harness.save(0)).rejects.toThrow(
        `no permission to read field "${deniedField}"`,
      );
      expect(harness.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT "id", "revision", "body"'),
        ['draft-id'],
        expect.anything(),
        { shouldBypassPermissionChecks: true },
      );
    },
  );

  it.each(['body', 'revision'])(
    'denies a stale save before persistence when %s is restricted',
    async (deniedField) => {
      const harness = buildFieldPermissionHarness(deniedField);

      await expect(harness.save(3)).rejects.toThrow(
        `no permission to read field "${deniedField}"`,
      );
      expect(harness.query).not.toHaveBeenCalled();
    },
  );

  it('returns authorized GET and stale-save conflict data without requiring unrelated title access', async () => {
    const harness = buildFieldPermissionHarness('title');

    await expect(harness.get()).resolves.toEqual(harness.expected);
    await expect(harness.save(3)).resolves.toEqual({
      status: 'CONFLICT',
      draftId: 'draft-id',
      revision: 4,
      body: 'Restricted remote edit',
    });
    expect(harness.draftRepository.findOne).toHaveBeenCalledTimes(3);
    expect(harness.draftRepository.findOne).toHaveBeenLastCalledWith({
      where: { id: 'draft-id', deletedAt: IsNull() },
      select: { id: true, revision: true, body: true },
    });
  });

  it.each(['absent', 'soft-deleted', 'record-hidden'])(
    'does not return a system-read draft excluded as %s by the caller repository',
    async () => {
      const harness = buildFieldPermissionHarness();
      harness.draftRepository.findOne.mockResolvedValue(null as never);

      await expect(harness.get()).rejects.toThrow(
        'Instagram message draft is unavailable',
      );
      await expect(harness.save(0)).rejects.toThrow(
        'Instagram message draft is unavailable',
      );
    },
  );
});

const buildFirstContactResolverHarness = () => {
  const workspace = { id: 'workspace-id' } as WorkspaceEntity;
  const userWorkspaceId = 'user-workspace-id';
  const workspaceMemberId = 'member-id';
  const rolePermissionConfig = { roleId: 'role-id' };
  const authContext = {
    type: 'user',
    workspace,
    userWorkspaceId,
    workspaceMemberId,
    user: { id: 'user-id' },
  };
  mockGetWorkspaceAuthContext.mockReturnValue(authContext);
  mockGetWorkspaceContext.mockReturnValue({
    userWorkspaceRoleMap: new Map(),
    apiKeyRoleMap: new Map(),
  });
  mockResolveRolePermissionConfig.mockReturnValue(rolePermissionConfig);
  const binding = {
    actionName: 'send_instagram_message',
    actionKind: 'START_CHAT',
    draftId: 'draft-id',
  };
  const authority = {
    expectedActionBinding: binding,
    canonicalGraph: {
      draft: {
        kind: 'START_CHAT',
        recipientProviderId: 'creator.name',
        body: 'Hello creator',
      },
      account: {
        workspaceInstagramAccountRecordId: 'account',
        unipileAccountId: 'provider-account',
      },
    },
  };
  const authorityReader = {
    getDraftActionKind: jest.fn().mockResolvedValue('START_CHAT'),
    createDirectAuthority: jest.fn().mockResolvedValue(authority),
    rebuildExecutionAuthority: jest.fn().mockResolvedValue(authority),
    assertReadyAfterReservation: jest.fn(),
  };
  const storedReceipt = {
    id: 'receipt-id',
    state: 'PROVIDER_ACCEPTED',
    providerCode: 'accepted',
    outcome: null,
  };
  const approval = {
    createApprovedInstagramMessageBinding: jest
      .fn()
      .mockResolvedValue({ id: 'binding-id' }),
    getApprovedBinding: jest.fn().mockResolvedValue(binding),
    findExecutionReceiptForBinding: jest.fn().mockResolvedValue(null),
    reserveExecutionForBinding: jest.fn().mockResolvedValue({
      created: true,
      receipt: { id: 'receipt-id', state: 'PROCESSING' },
    }),
    recordProviderAccepted: jest.fn(),
    recordProviderTerminalState: jest.fn(),
    getDirectInstagramReceiptForViewer: jest
      .fn()
      .mockResolvedValue({ actionKind: 'START_CHAT', receipt: storedReceipt }),
  };
  const permission = { assertCanSend: jest.fn().mockResolvedValue(undefined) };
  const access = {
    assertCanReadDraft: jest.fn(),
    assertCanExecuteDraft: jest
      .fn()
      .mockResolvedValue({ instagramAccountRecordId: 'account' }),
  };
  const budget = {
    reserve: jest
      .fn()
      .mockResolvedValue({ status: 'RESERVED', reservationId: 'reservation' }),
    markProviderAttempted: jest.fn(),
    releaseStartTarget: jest.fn(),
    releasePreDispatch: jest.fn(),
  };
  const client = {
    startChat: jest.fn().mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'ACCEPTED',
        value: { chatId: 'provider-chat', messageId: 'provider-message' },
      };
    }),
    sendMessage: jest.fn(),
  };
  const projector = { projectReceiptWithWriter: jest.fn() };
  const send = new InstagramMessageSendService(
    approval as never,
    authorityReader as never,
    { withLock: jest.fn(async (_input, callback) => callback()) } as never,
    budget as never,
    client as never,
    projector as never,
    { project: jest.fn() } as never,
    permission as never,
    access as never,
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
  };
  const resolver = new InstagramMessageResolver(
    approval as never,
    {} as never,
    send,
    access as never,
    { isMyahTeamMember: jest.fn().mockReturnValue(false) } as never,
    permission as never,
    orm as never,
  );
  return {
    workspace,
    userWorkspaceId,
    workspaceMemberId,
    rolePermissionConfig,
    authContext,
    authorityReader,
    approval,
    permission,
    access,
    budget,
    client,
    projector,
    resolver,
    storedReceipt,
    orm,
  };
};

describe('InstagramMessageResolver first-contact execution and authorized recovery boundary', () => {
  it('rejects authorized FIRST_MESSAGE through the real send service before approval or dispatch', async () => {
    const h = buildFirstContactResolverHarness();
    await expect(
      h.resolver.sendInstagramMessage(
        { draftId: 'draft-id', expectedRevision: 2 },
        h.workspace,
        h.userWorkspaceId,
        h.workspaceMemberId,
      ),
    ).rejects.toThrow('Instagram first-contact sending is unavailable');
    expect(h.access.assertCanReadDraft).toHaveBeenCalledWith({
      workspaceId: h.workspace.id,
      draftId: 'draft-id',
      rolePermissionConfig: h.rolePermissionConfig,
    });
    expect(h.permission.assertCanSend).toHaveBeenCalledWith({
      actionKind: 'START_CHAT',
      workspaceId: h.workspace.id,
      rolePermissionConfig: h.rolePermissionConfig,
    });
    expect(h.authorityReader.createDirectAuthority).not.toHaveBeenCalled();
    expect(
      h.approval.createApprovedInstagramMessageBinding,
    ).not.toHaveBeenCalled();
    expect(h.budget.reserve).not.toHaveBeenCalled();
    expect(h.client.startChat).not.toHaveBeenCalled();
    expect(h.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
  });

  it.each(['workspace', 'caller', 'member'] as const)(
    'rejects mismatching authenticated %s for send and recovery before any access',
    async (mismatch) => {
      const h = buildFirstContactResolverHarness();
      const workspace =
        mismatch === 'workspace'
          ? ({ id: 'other' } as WorkspaceEntity)
          : h.workspace;
      const user = mismatch === 'caller' ? 'other' : h.userWorkspaceId;
      const member = mismatch === 'member' ? 'other' : h.workspaceMemberId;
      await expect(
        h.resolver.sendInstagramMessage(
          { draftId: 'draft-id', expectedRevision: 2 },
          workspace,
          user,
          member,
        ),
      ).rejects.toThrow('matching authenticated user context');
      await expect(
        h.resolver.instagramMessageSendStatus(
          { receiptId: 'receipt-id' },
          workspace,
          user,
          member,
        ),
      ).rejects.toThrow('matching authenticated user context');
      expect(h.orm.executeInWorkspaceContext).not.toHaveBeenCalled();
      expect(h.authorityReader.getDraftActionKind).not.toHaveBeenCalled();
      expect(
        h.approval.getDirectInstagramReceiptForViewer,
      ).not.toHaveBeenCalled();
    },
  );

  it('keeps receipt status as the permission-scoped recovery API without invoking send or projection', async () => {
    const h = buildFirstContactResolverHarness();
    await expect(
      h.resolver.instagramMessageSendStatus(
        { receiptId: 'receipt-id' },
        h.workspace,
        h.userWorkspaceId,
        h.workspaceMemberId,
      ),
    ).resolves.toEqual({
      receiptId: 'receipt-id',
      state: 'PROVIDER_ACCEPTED',
      providerCode: 'accepted',
      outcome: null,
    });
    expect(h.approval.getDirectInstagramReceiptForViewer).toHaveBeenCalledWith({
      receiptId: 'receipt-id',
      workspaceId: h.workspace.id,
      userWorkspaceId: h.userWorkspaceId,
      allowWorkspaceOperator: false,
    });
    expect(h.permission.assertCanSend).toHaveBeenCalledWith({
      actionKind: 'START_CHAT',
      workspaceId: h.workspace.id,
      rolePermissionConfig: h.rolePermissionConfig,
    });
    h.permission.assertCanSend.mockRejectedValue(
      new Error('permission denied'),
    );
    await expect(
      h.resolver.instagramMessageSendStatus(
        { receiptId: 'receipt-id' },
        h.workspace,
        h.userWorkspaceId,
        h.workspaceMemberId,
      ),
    ).rejects.toThrow('permission denied');
    expect(h.authorityReader.getDraftActionKind).not.toHaveBeenCalled();
    expect(h.client.startChat).not.toHaveBeenCalled();
    expect(h.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
    expect(h.storedReceipt.state).toBe('PROVIDER_ACCEPTED');
  });
});
