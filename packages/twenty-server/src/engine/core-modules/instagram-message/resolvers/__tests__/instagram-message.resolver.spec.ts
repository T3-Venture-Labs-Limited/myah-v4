import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { createV3RecoveryFixture } from '../../services/__tests__/instagram-message-v3-recovery.fixture';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
// Installed metadata/storage readiness is exercised with real workspace context in
// instagram-message-composer-readiness.util.spec.ts; these retain their existing
// recovery/permission/persistence fixtures.
jest.mock(
  'src/engine/core-modules/instagram-message/services/instagram-message-composer-readiness.util',
  () => ({
    isInstagramComposerReady: jest.fn().mockResolvedValue(true),
    assertInstagramComposerReady: jest.fn().mockResolvedValue(undefined),
  }),
);

import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
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
  it('registers composer preparation as a mutation', () => {
    expect(
      Reflect.getMetadata(
        'graphql:resolver_type',
        InstagramMessageResolver.prototype.prepareInstagramMessageComposer,
      ),
    ).toBe('Mutation');
  });

  it('maps inaccessible composer account readiness to a generic query result', async () => {
    const permissionService = {
      canQueryComposerAccount: jest.fn().mockResolvedValue(true),
    };
    const recordAccessService = {
      getComposerAccount: jest.fn().mockResolvedValue(null),
    };
    const resolver = Reflect.construct(InstagramMessageResolver, [
      {},
      {},
      {},
      recordAccessService,
      {},
      permissionService,
      {},
    ]) as InstagramMessageResolver;
    const resolverWithContext = resolver as unknown as {
      executeInAuthenticatedWorkspaceContext: jest.Mock;
    };
    resolverWithContext.executeInAuthenticatedWorkspaceContext = jest.fn(
      async (
        _workspace: WorkspaceEntity,
        _userWorkspaceId: string,
        _workspaceMemberId: string,
        callback: (rolePermissionConfig: {
          unionOf: string[];
        }) => Promise<unknown>,
      ) => callback({ unionOf: ['role-id'] }),
    );

    await expect(
      resolver.instagramMessageComposerAccount(
        { id: 'workspace-id' } as WorkspaceEntity,
        'user-workspace-id',
        'workspace-member-id',
      ),
    ).resolves.toEqual({
      status: 'BLOCKED',
      code: 'ACCOUNT_UNAVAILABLE',
      sender: null,
    });
  });

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

describe('InstagramMessageResolver manual human access', () => {
  const workspace = { id: 'workspace-id' } as WorkspaceEntity;
  const userWorkspaceId = 'user-workspace-id';
  const workspaceMemberId = 'workspace-member-id';
  const account = {
    bindingId: 'binding-id',
    instagramAccountRecordId: 'account-id',
    label: 'Sender',
  };

  const setup = (role: 'ordinary' | 'myah-team', connected = true) => {
    mockGetWorkspaceAuthContext.mockReturnValue({
      type: 'user',
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      user: { id: 'user-id' },
      isInteractiveUserRequest: true,
    });
    mockGetWorkspaceContext.mockReturnValue({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    });
    mockResolveRolePermissionConfig.mockReturnValue({
      intersectionOf: [`${role}-role`],
    });
    const permission = {
      canQueryComposerAccount: jest.fn(
        ({ manualHumanAccess }: { manualHumanAccess?: unknown }) =>
          Promise.resolve(Boolean(manualHumanAccess)),
      ),
      assertCanSend: jest.fn(
        async ({ manualHumanAccess }: { manualHumanAccess?: unknown }) => {
          if (!manualHumanAccess)
            throw new Error('Instagram message send permission is required');
        },
      ),
    };
    const recordAccess = {
      getComposerAccount: jest
        .fn()
        .mockResolvedValue(connected ? account : null),
      assertCanSaveDraft: jest.fn(),
      assertCanReadDraft: jest.fn(),
      getConfirmedDestination: jest.fn().mockResolvedValue(null),
    };
    const draft = {
      saveDraft: jest.fn().mockResolvedValue({
        status: 'SAVED',
        draftId: 'draft-id',
        revision: 1,
        body: 'Hello',
      }),
      getDraftForTarget: jest.fn().mockResolvedValue({
        status: 'SAVED',
        draftId: 'draft-id',
        revision: 1,
        body: 'Hello',
      }),
    };
    const send = {
      sendDirect: jest
        .fn()
        .mockResolvedValue({ status: 'SENT', receiptId: 'receipt-id' }),
    };
    const approval = {
      getDirectInstagramReceiptForViewer: jest.fn().mockResolvedValue({
        actionKind: 'REPLY',
        confirmedDestinationSource: null,
        receipt: {
          id: 'receipt-id',
          state: 'SENT',
          providerCode: null,
          outcome: null,
        },
      }),
    };
    const recipient = {
      prepare: jest.fn(
        (
          input: { recipient: { rawHandle?: string } },
          context: { manualHumanAccess?: unknown },
        ) =>
          Promise.resolve(
            context.manualHumanAccess
              ? {
                  status: 'READY',
                  normalizedHandle: input.recipient.rawHandle,
                  creatorRecordId: null,
                  sender: { accountRecordId: 'account-id', label: 'Sender' },
                  actionKind:
                    input.recipient.rawHandle === 'existing'
                      ? 'REPLY'
                      : 'START_CHAT',
                  preparationFingerprint: 'fingerprint',
                }
              : { status: 'BLOCKED', code: 'MISSING_ROUTE_PERMISSION' },
          ),
      ),
    };
    const composer = {
      send: jest.fn(
        (_input: unknown, context: { manualHumanAccess?: unknown }) =>
          Promise.resolve(
            context.manualHumanAccess
              ? { status: 'SENT', receiptId: 'receipt-id' }
              : { status: 'BLOCKED', code: 'MISSING_ROUTE_PERMISSION' },
          ),
      ),
    };
    const resolver = new InstagramMessageResolver(
      approval as never,
      draft as never,
      send as never,
      recordAccess as never,
      { isMyahTeamMember: () => role === 'myah-team' } as never,
      permission as never,
      {
        executeInWorkspaceContext: (callback: () => unknown) => callback(),
      } as never,
      recipient as never,
      composer as never,
    );
    return {
      resolver,
      permission,
      recordAccess,
      recipient,
      composer,
      approval,
      draft,
      send,
    };
  };

  it.each(['ordinary', 'myah-team'] as const)(
    'allows %s human member account query, preparation and reviewed first send without route grants',
    async (role) => {
      const h = setup(role);
      await expect(
        h.resolver.instagramMessageComposerAccount(
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ status: 'READY' });
      await expect(
        h.resolver.prepareInstagramMessageComposer(
          { rawHandle: 'creator', creatorRecordId: null },
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ status: 'READY', actionKind: 'START_CHAT' });
      await expect(
        h.resolver.sendInstagramMessageComposer(
          {
            rawHandle: 'creator',
            creatorRecordId: null,
            draftId: 'draft-id',
            expectedAccountRecordId: 'account-id',
            expectedPreparationFingerprint: 'fingerprint',
            body: 'Hello',
          },
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ status: 'SENT' });
    },
  );

  it('prepares and sends an existing-chat reply for an ordinary member without a route grant', async () => {
    const h = setup('ordinary');
    await expect(
      h.resolver.prepareInstagramMessageComposer(
        { rawHandle: 'existing', creatorRecordId: null },
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).resolves.toMatchObject({ status: 'READY', actionKind: 'REPLY' });
    await expect(
      h.resolver.sendInstagramMessageComposer(
        {
          rawHandle: 'existing',
          creatorRecordId: null,
          draftId: 'draft-id',
          expectedAccountRecordId: 'account-id',
          expectedPreparationFingerprint: 'fingerprint',
          body: 'Hello again',
        },
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).resolves.toMatchObject({ status: 'SENT' });
  });

  it('rejects a mismatched authenticated workspace before any human account access', async () => {
    const h = setup('ordinary');
    await expect(
      h.resolver.instagramMessageComposerAccount(
        { id: 'other-workspace' } as WorkspaceEntity,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).rejects.toThrow('matching authenticated user context');
    expect(h.recordAccess.getComposerAccount).not.toHaveBeenCalled();
  });

  it.each(['ordinary', 'myah-team'] as const)(
    'allows %s manual Inbox reply draft save/read/send and receipt status without reply tool grant',
    async (role) => {
      const h = setup(role);
      const target = {
        kind: 'REPLY' as const,
        creatorRecordId: null,
        conversationRecordId: 'conversation-id',
      };
      await expect(
        h.resolver.saveInstagramMessageDraft(
          {
            ...target,
            draftId: 'draft-id',
            expectedRevision: 0,
            body: 'Hello',
          },
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ status: 'SAVED' });
      await expect(
        h.resolver.instagramMessageDraft(
          target,
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ draftId: 'draft-id' });
      await expect(
        h.resolver.sendInstagramMessage(
          { draftId: 'draft-id', expectedRevision: 1 },
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ status: 'SENT' });
      expect(h.send.sendDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          manualHumanAccess: { userWorkspaceId, workspaceMemberId },
          expectedRevision: 1,
        }),
      );
      await expect(
        h.resolver.instagramMessageSendStatus(
          { receiptId: 'receipt-id' },
          workspace,
          userWorkspaceId,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ receiptId: 'receipt-id', state: 'SENT' });
      expect(h.permission.assertCanSend).toHaveBeenCalledTimes(3);
      expect(h.permission.assertCanSend).toHaveBeenCalledWith(
        expect.objectContaining({
          actionKind: 'REPLY',
          manualHumanAccess: { userWorkspaceId, workspaceMemberId },
        }),
      );
    },
  );

  it('does not bypass first-message permission for the legacy draft path', async () => {
    const h = setup('ordinary');
    await expect(
      h.resolver.saveInstagramMessageDraft(
        {
          kind: 'FIRST_MESSAGE',
          creatorRecordId: 'creator-id',
          conversationRecordId: null,
          draftId: 'draft-id',
          expectedRevision: 0,
          body: 'Hello',
        },
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).rejects.toThrow('Instagram message send permission is required');
    expect(h.draft.saveDraft).not.toHaveBeenCalled();
  });

  it('returns account setup guidance without an active binding, even for a human member', async () => {
    const h = setup('ordinary', false);
    await expect(
      h.resolver.instagramMessageComposerAccount(
        workspace,
        userWorkspaceId,
        workspaceMemberId,
      ),
    ).resolves.toMatchObject({
      status: 'BLOCKED',
      code: 'ACCOUNT_UNAVAILABLE',
    });
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
    workspaceMember: { id: workspaceMemberId },
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
    find: jest
      .fn()
      .mockResolvedValue([{ handle: 'creator.name', profileUrl: null }]),
  };
  // GET uses system context; saves keep the authenticated actor for trusted SQL.
  const query = jest.fn(async (sql: string) => {
    if (currentContext.type === 'user')
      expect(currentContext).toBe(authContext);
    else expect(currentContext.type).toBe('system');
    if (sql.includes('"myahSocialConversation"')) {
      return [
        {
          id: 'conversation-id',
          creatorId: 'creator-id',
          recipientIgsid: 'provider-id',
        },
      ];
    }
    if (sql.includes('"creator"')) return [{ id: 'creator-id' }];
    if (sql.includes('"socialProfile"'))
      return [{ handle: 'creator.name', profileUrl: null }];
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

    return {
      userWorkspaceRoleMap: { [userWorkspaceId]: 'current-role-id' },
      apiKeyRoleMap: new Map(),
    };
  });
  mockResolveRolePermissionConfig.mockReturnValue(rolePermissionConfig);
  const draftService = new InstagramMessageDraftService(
    { findOneBy: jest.fn().mockResolvedValue(workspace) } as never,
    globalWorkspaceOrmManager as never,
    {
      isDraftExecutionLocked: jest.fn().mockResolvedValue(false),
      isDraftProviderAccepted: jest.fn().mockResolvedValue(false),
    } as never,
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
    providerExternalMessageId: 'provider-message',
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
    getDirectInstagramReceiptForViewer: jest.fn().mockResolvedValue({
      actionKind: 'START_CHAT',
      receipt: storedReceipt,
      providerMessageId: storedReceipt.providerExternalMessageId,
    }),
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
      providerMessageId: 'provider-message',
      outcome: null,
      creatorRecordId: null,
      conversationRecordId: null,
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

describe('InstagramMessageResolver confirmed immutable destination', () => {
  const setup = () => {
    const h = createV3RecoveryFixture();
    const workspace = { id: h.workspaceId } as WorkspaceEntity;
    const user = h.binding.initiatorUserWorkspaceId;
    const member = 'member-v3';
    const role = { unionOf: ['destination-role'] };
    mockGetWorkspaceAuthContext.mockReturnValue({
      type: 'user',
      workspace,
      userWorkspaceId: user,
      workspaceMemberId: member,
      user: { id: 'user-v3' },
    });
    mockGetWorkspaceContext.mockReturnValue({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    });
    mockResolveRolePermissionConfig.mockReturnValue(role);
    const approval = new ActionApprovalService(
      { getRepository: () => h.receiptRepository } as never,
      h.projector,
    );
    const permission = { assertCanSend: jest.fn() };
    const resolver = new InstagramMessageResolver(
      approval,
      h.draft,
      {} as never,
      h.access,
      { isMyahTeamMember: () => false } as never,
      permission as never,
      h.orm as never,
    );
    const status = () =>
      resolver.instagramMessageSendStatus(
        { receiptId: h.receipt.id },
        workspace,
        user,
        member,
      );
    return { ...h, status, role, permission };
  };
  it('lets the interactive first-message initiator poll their receipt without a START_CHAT grant', async () => {
    const h = setup();
    const hasToolPermission = jest.fn().mockResolvedValue(false);
    const realPermission = new InstagramMessagePermissionService({
      hasToolPermission,
    } as never);
    h.permission.assertCanSend.mockImplementation((input) =>
      realPermission.assertCanSend(input),
    );
    mockGetWorkspaceAuthContext.mockReturnValue({
      type: 'user',
      workspace: { id: h.workspaceId },
      userWorkspaceId: h.binding.initiatorUserWorkspaceId,
      workspaceMemberId: 'member-v3',
      user: { id: 'user-v3' },
      isInteractiveUserRequest: true,
    });
    await expect(h.status()).resolves.toMatchObject({
      state: 'PROVIDER_ACCEPTED',
    });
    expect(hasToolPermission).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('retains the route grant for legacy first-message receipts', async () => {
    const h = setup();
    Object.assign(h.binding, {
      actionVersion: 2,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
    });
    const hasToolPermission = jest.fn().mockResolvedValue(false);
    const realPermission = new InstagramMessagePermissionService({
      hasToolPermission,
    } as never);
    h.permission.assertCanSend.mockImplementation((input) =>
      realPermission.assertCanSend(input),
    );
    mockGetWorkspaceAuthContext.mockReturnValue({
      type: 'user',
      workspace: { id: h.workspaceId },
      userWorkspaceId: h.binding.initiatorUserWorkspaceId,
      workspaceMemberId: 'member-v3',
      user: { id: 'user-v3' },
      isInteractiveUserRequest: true,
    });
    await expect(h.status()).rejects.toThrow(
      'Instagram message send permission is required',
    );
    expect(hasToolPermission).toHaveBeenCalled();
  });
  it('returns IDs only after durable message projection with current role-scoped reads, not current handles', async () => {
    const h = setup();
    await expect(h.status()).resolves.toMatchObject({
      state: 'PROVIDER_ACCEPTED',
      creatorRecordId: null,
      conversationRecordId: null,
    });
    await h.projector.projectReceipt(h.receipt.id);
    h.orm.getRepository.mockClear();
    await expect(h.status()).resolves.toMatchObject({
      state: 'SENT',
      creatorRecordId: h.creatorId,
      conversationRecordId: h.rows.myahSocialConversation[0].id,
    });
    expect(
      h.orm.getRepository.mock.calls.every(([, , role]) => role === h.role),
    ).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it('suppresses destination IDs on current record/field permission denial without provider access', async () => {
    const h = setup();
    await h.projector.projectReceipt(h.receipt.id);
    h.fetch.mockClear();
    h.orm.getRepository.mockRejectedValue(
      new PermissionsException(
        'denied',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    );
    await expect(h.status()).resolves.toMatchObject({
      state: 'SENT',
      creatorRecordId: null,
      conversationRecordId: null,
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.permission.assertCanSend).toHaveBeenCalled();
  });

  it.each([
    'creator',
    'conversation',
    'message',
    'account',
    'binding',
    'owner',
    'ambiguous',
    'body',
    'wrong-message',
    'wrong-chat',
  ])(
    'does not expose a destination for inaccessible/mismatched %s',
    async (failure) => {
      const h = setup();
      await h.projector.projectReceipt(h.receipt.id);
      if (failure === 'creator') h.rows.creator = [];
      if (failure === 'conversation') h.rows.myahSocialConversation = [];
      if (failure === 'message') h.rows.myahSocialMessage = [];
      if (failure === 'account') h.rows.myahInstagramAccount = [];
      if (failure === 'binding') h.account.status = 'INACTIVE';
      if (failure === 'owner')
        h.rows.myahSocialConversation[0].creatorId = 'other';
      if (failure === 'ambiguous')
        h.rows.myahSocialConversation.push({
          ...h.rows.myahSocialConversation[0],
          id: 'duplicate',
        });
      if (failure === 'body') h.rows.myahSocialMessage[0].text = 'edited';
      if (failure === 'wrong-message')
        h.receipt.providerExternalMessageId = 'other';
      if (failure === 'wrong-chat')
        h.receipt.providerThreadExternalId = 'other';
      await expect(h.status()).resolves.toMatchObject({
        state: 'SENT',
        creatorRecordId: null,
        conversationRecordId: null,
      });
    },
  );
});
