import { FindOperator } from 'typeorm';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramMessageAuthorityReaderService } from '../instagram-message-authority-reader.service';
import { InstagramMessageSendService } from '../instagram-message-send.service';
import { InstagramMessagePermissionService } from '../instagram-message-permission.service';
import { InstagramMessageRecordAccessService } from '../instagram-message-record-access.service';
import {
  InstagramMessageRecipientService,
  computeInstagramComposerPreparationFingerprint,
} from '../instagram-message-recipient.service';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    ...jest.requireActual(
      'src/engine/twenty-orm/storage/orm-workspace-context.storage',
    ),
    getWorkspaceContext: jest.fn(),
  }),
);
import { buildInstagramMessageEvidenceLinks } from 'src/engine/core-modules/action-approval/utils/build-instagram-message-evidence-links.util';
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

import { createHash } from 'crypto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';

import { enqueueWorkspaceDatabaseEvent } from 'src/engine/workspace-event-emitter/utils/workspace-database-event-buffer';

import { buildInstagramMessageV3ActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { type ResolvedInstagramComposerGraph } from '../instagram-message-composer.types';
import { type InstagramMessageIdentitySnapshot } from 'src/engine/core-modules/action-approval/types/action-approval.type';

import { InstagramMessageComposerService } from '../instagram-message-composer.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const workspaceMemberId = '00000000-0000-4000-8000-000000000003';
const draftId = '00000000-0000-4000-8000-000000000004';
const composerObjectMetadata = [
  ['2d357469-831a-4629-ad4b-47335900e883', 'account-metadata'],
  ['85762d24-541b-407f-9d6a-cdf89552c665', 'draft-metadata'],
  ['36817464-855f-42db-9fbb-f8853643f8d6', 'conversation-metadata'],
  ['5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator-metadata'],
].map(([universalIdentifier, id]) => ({
  universalIdentifier,
  id,
  workspaceId,
  isActive: true,
}));
beforeEach(() =>
  jest.mocked(getWorkspaceContext).mockReturnValue({
    authContext: { workspace: { id: workspaceId } },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        composerObjectMetadata.map((object) => [
          object.universalIdentifier,
          object,
        ]),
      ),
    },
  } as never),
);
const secondDraftId = '00000000-0000-4000-8000-000000000009';
const creatorId = 'abcdefab-0000-4000-8000-000000000005';
const accountId = '00000000-0000-4000-8000-000000000006';
const bindingId = '00000000-0000-4000-8000-000000000007';

const sha256 = (values: unknown[]) =>
  createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');

const input = {
  recipient: { rawHandle: 'recipient' } as const,
  draftId,
  expectedAccountRecordId: accountId,
  expectedPreparationFingerprint: 'preparation-fingerprint',
  body: '  hello  ',
};

const authenticatedContext = {
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  workspaceMemberId,
  rolePermissionConfig: {} as never,
};

const graph = {
  status: 'READY' as const,
  normalizedHandle: 'recipient',
  creatorRecordId: creatorId,
  sender: { accountRecordId: accountId, label: 'Instagram' },
  actionKind: 'START_CHAT' as const,
  preparationFingerprint: 'preparation-fingerprint',
  account: {
    bindingId,
    instagramAccountRecordId: accountId,
    instagramUserId: 'instagram-user',
    unipileAccountId: 'unipile-account',
  },
  recipient: {
    providerId: 'provider-id',
    providerMessagingId: 'provider-messaging-id',
    sourceValues: [{ field: 'instagramUsername', value: 'recipient' }],
  },
  chat: {
    actionKind: 'START_CHAT' as const,
    conversationRecordId: null,
    providerChatId: null,
  },
};

const snapshot = {
  publicIdentifier: 'recipient',
  providerId: 'provider-id',
  providerMessagingId: 'provider-messaging-id',
  creatorRecordId: creatorId,
  accountBindingId: bindingId,
  instagramAccountRecordId: accountId,
  unipileAccountId: 'unipile-account',
  instagramUserId: 'instagram-user',
  recipientSourceValues: [{ field: 'instagramUsername', value: 'recipient' }],
  actionKind: 'START_CHAT' as const,
  conversationRecordId: null,
  providerChatId: null,
  attendeeProviderId: null,
};

const composerInputDigest = sha256([
  workspaceId,
  userWorkspaceId,
  draftId,
  ['rawHandle', 'recipient'],
  accountId,
  'preparation-fingerprint',
  'hello',
]);

const verifiedDraftRow = {
  id: draftId,
  revision: 1,
  body: 'hello',
  kind: 'FIRST_MESSAGE',
  status: 'DRAFT',
  source: 'MANUAL',
  creatorId,
  conversationId: null,
  recipientUsername: 'recipient',
  recipientProviderId: 'provider-id',
  createdByWorkspaceMemberId: workspaceMemberId,
  sentAt: null,
  composerInputDigest,
  instagramMessageSnapshot: snapshot,
};

const approvedBinding = {
  workspaceId,
  actionName: 'send_instagram_message' as const,
  actionVersion: 3 as const,
  actionKind: 'START_CHAT' as const,
  draftId,
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  actionContextFingerprint: 'd'.repeat(64),
  initiatorUserWorkspaceId: userWorkspaceId,
  evidenceLinks: [],
  threadId: null,
  interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT' as const,
  interactionContextId: draftId,
  instagramMessageSnapshot: snapshot,
  composerInputDigest,
};

const createLockService = (events: string[]) => ({
  withNormalizedHandleLock: jest.fn(async (_input, operation) => {
    events.push('handle-lock');
    return operation();
  }),
  withLock: jest.fn(async (_input, operation) => {
    events.push('draft-lock');
    return operation();
  }),
});

const transactionRunner = (events: string[] = []) => {
  const runner = {
    manager: { queryRunner: {} },
    isTransactionActive: false,
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => {
      runner.isTransactionActive = true;
      events.push('transaction');
    }),
    query: jest.fn(async (..._args: unknown[]) => []),
    commitTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
      events.push('commit');
    }),
    rollbackTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
      events.push('rollback');
    }),
    release: jest.fn(async () => {
      events.push('release');
    }),
  };
  runner.manager.queryRunner = runner;
  return runner;
};

const metadataDataSource = (responses: unknown[][]) => {
  const runner = transactionRunner();
  return {
    query: jest.fn(async () => responses.shift() ?? []),
    createQueryRunner: jest.fn(() => runner),
    runner,
  };
};

// Writes are staged in the runner; only commit makes them visible to discovery.
// This fixture asserts protocol/visibility, not PostgreSQL lock semantics.
const buildTransactionHarness = (
  route: 'START_CHAT' | 'REPLY' = 'START_CHAT',
) => {
  const events: string[] = [];
  const runner = transactionRunner(events);
  const state = {
    committed: [] as Record<string, unknown>[],
    staged: [] as Record<string, unknown>[],
    creatorCommitted: false,
    creatorStaged: false,
    linkCommitted: false,
    linkStaged: false,
    released: false,
  };
  const currentGraph: ResolvedInstagramComposerGraph = {
    ...graph,
    creatorRecordId: null,
    actionKind: route,
    chat:
      route === 'START_CHAT'
        ? graph.chat
        : {
            actionKind: 'REPLY',
            conversationRecordId: '00000000-0000-4000-8000-000000000008',
            providerChatId: 'chat-id',
          },
  };
  runner.query.mockImplementation(async (...args: unknown[]) => {
    expect(runner.isTransactionActive).toBe(true);
    const [sql, params] = args;
    if (typeof sql !== 'string') throw new Error('missing SQL');
    if (sql.startsWith('SET LOCAL ')) {
      expect([
        "SET LOCAL statement_timeout = '3000ms'",
        "SET LOCAL lock_timeout = '2000ms'",
        "SET LOCAL idle_in_transaction_session_timeout = '10000ms'",
      ]).toContain(sql);
    } else if (sql.includes('set_config')) {
      expect(sql).toBe("SELECT set_config('statement_timeout', $1, true)");
      expect(params).toEqual([expect.stringMatching(/^\d+ms$/)]);
    } else {
      expect(sql).toBe(
        `LOCK TABLE "${getWorkspaceSchemaName(workspaceId)}"."creator" IN SHARE ROW EXCLUSIVE MODE`,
      );
      events.push('table-lock');
    }
    return [];
  });
  const requireManager = (manager: unknown) => {
    expect(manager).toBe(runner.manager);
    expect(runner.isTransactionActive).toBe(true);
    expect(state.committed).toEqual([]);
  };
  const listener = jest.fn((_eventName?: string, _event?: unknown) => {
    expect(state.released).toBe(true);
    expect(runner.isTransactionActive).toBe(false);
    events.push('listener');
  });
  const enqueue = () => {
    expect(enqueueWorkspaceDatabaseEvent(listener)).toBe(true);
  };
  const creatorRepository = {
    insert: jest.fn(async (values, manager, columns) => {
      requireManager(manager);
      expect(values).toEqual({ instagramUsername: 'recipient' });
      expect(columns).toEqual(['id']);
      expect(events).toContain('canonical-scan');
      events.push('creator-insert');
      state.creatorStaged = true;
      enqueue();
      return { identifiers: [{ id: creatorId }] };
    }),
  };
  const draftRepository = {
    findOne: jest.fn(async (_options, manager) => {
      requireManager(manager);
      return null;
    }),
    insert: jest.fn(async (values, manager, columns) => {
      requireManager(manager);
      expect(columns).toEqual(['id']);
      events.push('draft-insert');
      state.staged.push(values);
      enqueue();
      return { identifiers: [{ id: draftId }] };
    }),
  };
  const conversationRepository = {
    findOne: jest.fn(async (_options, manager) => {
      requireManager(manager);
      events.push('conversation-lock');
      return {
        id: '00000000-0000-4000-8000-000000000008',
        creatorId: null as string | null,
      };
    }),
    update: jest.fn(async (_where, _values, _options, manager, columns) => {
      requireManager(manager);
      expect(columns).toEqual(['id']);
      state.linkStaged = true;
      // The real conditional update after-read still includes creatorId IS NULL,
      // so the shared builder emits no events. The local by-ID path must do it.
      return { affected: 1 };
    }),
  };
  const conversationFields = [
    { id: 'id', name: 'id', type: FieldMetadataType.UUID },
    {
      id: 'creator',
      name: 'creator',
      type: FieldMetadataType.RELATION,
      settings: { relationType: RelationType.MANY_TO_ONE },
    },
  ];
  const conversationObject = {
    id: 'conversation',
    nameSingular: 'myahSocialConversation',
    fieldIds: conversationFields.map(({ id }) => id),
  };
  const eventSnapshots = jest.fn(async () => {
    requireManager(runner.manager);
    return {
      id: currentGraph.chat.conversationRecordId,
      creatorId: state.linkStaged ? creatorId : null,
    };
  });
  Object.assign(runner.manager, {
    authContext: { userWorkspaceId, workspaceMemberId },
    internalContext: {
      workspaceId,
      objectIdByNameSingular: { myahSocialConversation: 'conversation' },
      flatObjectMetadataMaps: {
        byUniversalIdentifier: { conversation: conversationObject },
        universalIdentifierById: { conversation: 'conversation' },
      },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: Object.fromEntries(
          conversationFields.map((field) => [field.id, field]),
        ),
        universalIdentifierById: { id: 'id', creator: 'creator' },
      },
      eventEmitterService: new WorkspaceEventEmitter({
        emit: listener,
      } as unknown as EventEmitter2),
    },
    createQueryBuilder: jest.fn((target, alias, eventRunner, options) => {
      expect(target).toBe('myahSocialConversation');
      expect(alias).toBe(target);
      expect(eventRunner).toBe(runner);
      expect(options).toEqual({ shouldBypassPermissionChecks: true });
      return {
        where: (where: unknown) => {
          expect(where).toEqual({ id: currentGraph.chat.conversationRecordId });
          return { getOne: eventSnapshots };
        },
      };
    }),
  });
  runner.commitTransaction.mockImplementation(async () => {
    expect(listener).not.toHaveBeenCalled();
    state.committed = state.staged.map((values) => ({
      ...values,
      createdByWorkspaceMemberId: workspaceMemberId,
    }));
    state.creatorCommitted = state.creatorStaged;
    state.linkCommitted = state.linkStaged;
    runner.isTransactionActive = false;
    events.push('commit');
  });
  runner.rollbackTransaction.mockImplementation(async () => {
    expect(listener).not.toHaveBeenCalled();
    state.staged = [];
    state.creatorStaged = false;
    state.linkStaged = false;
    runner.isTransactionActive = false;
    events.push('rollback');
  });
  runner.release.mockImplementation(async () => {
    expect(listener).not.toHaveBeenCalled();
    state.released = true;
    events.push('release');
  });
  const dataSource = {
    driver: { escape: (identifier: string) => `"${identifier}"` },
    createQueryRunner: jest.fn(() => runner),
    query: jest.fn(
      async (sql: string, params: unknown[], queryRunner, options) => {
        expect(queryRunner).toBeUndefined();
        expect(options).toEqual({ shouldBypassPermissionChecks: true });
        if (sql.includes('information_schema.columns')) {
          expect(params).toEqual([
            getWorkspaceSchemaName(workspaceId),
            ['composerInputDigest', 'instagramMessageSnapshot'],
          ]);
          return [
            { column_name: 'composerInputDigest' },
            { column_name: 'instagramMessageSnapshot' },
          ];
        }
        expect(sql).toContain(
          `FROM "${getWorkspaceSchemaName(workspaceId)}"."_myahInstagramReplyDraft"`,
        );
        expect([draftId, secondDraftId]).toContain(params[0]);
        return state.committed.filter((row) => row.id === params[0]);
      },
    ),
  };
  const recipient = {
    resolve: jest.fn(async () => {
      expect(runner.isTransactionActive).toBe(false);
      return { ...currentGraph };
    }),
    assertCreatorMatchesUnderLock: jest.fn(
      async (_graph, _context, manager, beforeQuery) => {
        requireManager(manager);
        expect(events).toContain('table-lock');
        await beforeQuery();
        events.push('canonical-scan');
      },
    ),
  };
  const approvals = {
    findComposerAttempt: jest.fn(async () => null),
    createApprovedInstagramMessageBinding: jest.fn(async () => {
      expect(state.released).toBe(true);
      expect(state.committed).toHaveLength(1);
      events.push('approval');
      return { id: bindingId };
    }),
  };
  const send = {
    executeApprovedWithDraftLockHeld: jest.fn(async () => {
      events.push('handoff');
      throw new Error('fresh v3 unavailable');
    }),
  };
  const orm = {
    getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
    getRepository: jest.fn(async (workspace, name, role) => {
      expect(workspace).toBe(workspaceId);
      expect(role).toBe(authenticatedContext.rolePermissionConfig);
      if (name === 'creator') return creatorRepository;
      if (name === 'myahSocialConversation') return conversationRepository;
      if (name === 'myahInstagramReplyDraft') return draftRepository;
      throw new Error(`unexpected repository ${name}`);
    }),
  };
  const locks = createLockService(events);
  const service = new InstagramMessageComposerService(
    orm as never,
    recipient as never,
    { assertCanSend: jest.fn() } as never,
    locks as never,
    approvals as never,
    send as never,
  );
  return {
    service,
    runner,
    events,
    state,
    listener,
    recipient,
    currentGraph,
    locks,
    creatorRepository,
    draftRepository,
    conversationRepository,
    eventSnapshots,
    orm,
    approvals,
    send,
    dataSource,
  };
};

describe('InstagramMessageComposerService', () => {
  it('recovers a prior START receipt from its immutable binding without reclassifying a newly visible chat', async () => {
    const events: string[] = [];
    const recipientService = {
      resolveNormalizedHandle: jest.fn(async () => {
        events.push('handle');
        return 'recipient';
      }),
      resolve: jest.fn(async () => {
        events.push('resolve');
        return { ...graph, actionKind: 'REPLY' as const };
      }),
    };
    const actionApprovalService = {
      findComposerAttempt: jest.fn(async () => {
        events.push('attempt');
        return {
          id: bindingId,
          actionKind: 'START_CHAT',
          composerInputDigest,
          instagramMessageSnapshot: snapshot,
          receipt: { id: 'receipt' },
        };
      }),
      getApprovedBinding: jest.fn(async () => approvedBinding),
    };
    const sendService = {
      executeApprovedWithDraftLockHeld: jest.fn(async () => {
        events.push('handoff');
        return { status: 'SENT' as const, receiptId: 'receipt' };
      }),
    };
    const service = new InstagramMessageComposerService(
      {} as never,
      recipientService as never,
      { assertCanSend: jest.fn() } as never,
      createLockService(events) as never,
      actionApprovalService as never,
      sendService as never,
    );

    await expect(service.send(input, authenticatedContext)).resolves.toEqual({
      status: 'SENT',
      receiptId: 'receipt',
    });

    expect(events).toEqual([
      'attempt',
      'handle-lock',
      'draft-lock',
      'attempt',
      'handoff',
    ]);
    expect(recipientService.resolve).not.toHaveBeenCalled();
    expect(sendService.executeApprovedWithDraftLockHeld).toHaveBeenCalledWith(
      expect.objectContaining({ approvalBindingId: bindingId }),
      approvedBinding,
    );
  });

  it('recovers a selected Creator receipt from the submitted ID after its current handle is unavailable', async () => {
    const events: string[] = [];
    const actionApprovalService = {
      findComposerAttempt: jest.fn().mockResolvedValue({
        id: bindingId,
        actionKind: 'START_CHAT',
        composerInputDigest: sha256([
          workspaceId,
          userWorkspaceId,
          draftId,
          ['creatorRecordId', creatorId],
          accountId,
          'preparation-fingerprint',
          'hello',
        ]),
        instagramMessageSnapshot: snapshot,
        receipt: { id: 'receipt', state: 'SENT' },
      }),
      getApprovedBinding: jest.fn().mockResolvedValue({
        ...approvedBinding,
        composerInputDigest: sha256([
          workspaceId,
          userWorkspaceId,
          draftId,
          ['creatorRecordId', creatorId],
          accountId,
          'preparation-fingerprint',
          'hello',
        ]),
      }),
    };
    const recipientService = {
      resolveNormalizedHandle: jest.fn().mockRejectedValue(new Error('hidden')),
      resolve: jest.fn(),
    };
    const service = new InstagramMessageComposerService(
      {} as never,
      recipientService as never,
      { assertCanSend: jest.fn() } as never,
      createLockService(events) as never,
      actionApprovalService as never,
      {
        executeApprovedWithDraftLockHeld: jest
          .fn()
          .mockResolvedValue({ status: 'SENT', receiptId: 'receipt' }),
      } as never,
    );

    await expect(
      service.send(
        { ...input, recipient: { creatorRecordId: creatorId } },
        authenticatedContext,
      ),
    ).resolves.toEqual({ status: 'SENT', receiptId: 'receipt' });
    expect(recipientService.resolveNormalizedHandle).not.toHaveBeenCalled();
    expect(recipientService.resolve).not.toHaveBeenCalled();
  });

  it('rejects a replay with changed input before route resolution or any write', async () => {
    const events: string[] = [];
    const recipientService = {
      resolveNormalizedHandle: jest.fn().mockResolvedValue('recipient'),
      resolve: jest.fn(),
    };
    const actionApprovalService = {
      findComposerAttempt: jest.fn().mockResolvedValue({
        id: bindingId,
        actionKind: 'START_CHAT',
        composerInputDigest: 'f'.repeat(64),
        instagramMessageSnapshot: snapshot,
        receipt: null,
      }),
      getApprovedBinding: jest.fn(),
    };
    const service = new InstagramMessageComposerService(
      {} as never,
      recipientService as never,
      { assertCanSend: jest.fn() } as never,
      createLockService(events) as never,
      actionApprovalService as never,
      { executeApprovedWithDraftLockHeld: jest.fn() } as never,
    );

    await expect(service.send(input, authenticatedContext)).rejects.toThrow(
      'Instagram composer input changed',
    );
    expect(recipientService.resolve).not.toHaveBeenCalled();
    expect(actionApprovalService.getApprovedBinding).not.toHaveBeenCalled();
  });

  it('creates the immutable draft before approval and hands off a fresh v3 binding only after commit and release', async () => {
    const h = buildTransactionHarness();
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'fresh v3 unavailable',
    );
    expect(h.events).toEqual([
      'handle-lock',
      'draft-lock',
      'transaction',
      'table-lock',
      'canonical-scan',
      'creator-insert',
      'draft-insert',
      'commit',
      'release',
      'listener',
      'listener',
      'approval',
      'handoff',
    ]);
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actionVersion: 3,
        composerInputDigest,
        instagramMessageSnapshot: snapshot,
      }),
    );
  });

  it('creates exactly one minimal Creator through the role-aware transaction before draft persistence', async () => {
    const h = buildTransactionHarness();
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'fresh v3 unavailable',
    );
    expect(h.creatorRepository.insert).toHaveBeenCalledWith(
      { instagramUsername: 'recipient' },
      h.runner.manager,
      ['id'],
    );
    expect(h.state.committed).toEqual([
      expect.objectContaining({
        ...verifiedDraftRow,
        createdBy: {
          source: 'MANUAL',
          workspaceMemberId,
          name: 'Workspace member',
          context: {},
        },
        updatedBy: {
          source: 'MANUAL',
          workspaceMemberId,
          name: 'Workspace member',
          context: {},
        },
      }),
    ]);
  });

  it('resumes a committed draft after an approval crash only when current identity still matches its snapshot', async () => {
    const events: string[] = [];
    const dataSource = metadataDataSource([
      [
        { column_name: 'composerInputDigest' },
        { column_name: 'instagramMessageSnapshot' },
      ],
      [verifiedDraftRow],
      [
        { column_name: 'composerInputDigest' },
        { column_name: 'instagramMessageSnapshot' },
      ],
      [verifiedDraftRow],
    ]);
    const actionApprovalService = {
      findComposerAttempt: jest.fn().mockResolvedValue(null),
      createApprovedInstagramMessageBinding: jest
        .fn()
        .mockResolvedValue({ id: bindingId }),
    };
    const sendService = {
      executeApprovedWithDraftLockHeld: jest
        .fn()
        .mockRejectedValue(
          new Error('Instagram message source graph is unavailable'),
        ),
    };
    const service = new InstagramMessageComposerService(
      {
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
      } as never,
      {
        resolveNormalizedHandle: jest.fn().mockResolvedValue('recipient'),
        resolve: jest.fn().mockResolvedValue(graph),
      } as never,
      { assertCanSend: jest.fn() } as never,
      createLockService(events) as never,
      actionApprovalService as never,
      sendService as never,
    );

    await expect(service.send(input, authenticatedContext)).rejects.toThrow(
      'Instagram message source graph is unavailable',
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(
      actionApprovalService.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledTimes(1);
  });

  it('does not reveal another user’s attempt through the read-only recovery method', async () => {
    const actionApprovalService = {
      findComposerAttempt: jest.fn().mockResolvedValue(null),
    };
    const service = new InstagramMessageComposerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      actionApprovalService as never,
      {} as never,
    );

    await expect(
      service.getAttempt(draftId, authenticatedContext),
    ).resolves.toBeNull();
    expect(actionApprovalService.findComposerAttempt).toHaveBeenCalledWith({
      workspaceId,
      draftId,
      initiatorUserWorkspaceId: userWorkspaceId,
    });
  });
});

describe('InstagramMessageComposerService recovery input guards', () => {
  it.each([
    ['neither recipient discriminant', { recipient: {} }],
    ['null recipient', { recipient: null }],
    [
      'non-string selected discriminant alongside raw',
      { recipient: { creatorRecordId: 42, rawHandle: 'recipient' } },
    ],
    ['non-string raw handle', { recipient: { rawHandle: 42 } }],
    [
      'both recipient discriminants',
      { recipient: { creatorRecordId: creatorId, rawHandle: 'recipient' } },
    ],
    [
      'invalid selected Creator UUID',
      { recipient: { creatorRecordId: 'not-a-uuid' } },
    ],
    ['empty raw handle', { recipient: { rawHandle: '  ' } }],
    ['empty trimmed body', { body: ' \n ' }],
    ['non-string body', { body: 42 }],
  ])(
    'rejects %s before lookup, locks, permission, or send',
    async (_name, patch) => {
      const attempts = {
        findComposerAttempt: jest.fn(),
        getApprovedBinding: jest.fn(),
      };
      const locks = createLockService([]);
      const recipient = {
        resolveNormalizedHandle: jest.fn(),
        resolve: jest.fn(),
      };
      const permission = { assertCanSend: jest.fn() };
      const send = { executeApprovedWithDraftLockHeld: jest.fn() };
      const service = new InstagramMessageComposerService(
        {} as never,
        recipient as never,
        permission as never,
        locks as never,
        attempts as never,
        send as never,
      );

      await expect(
        service.send({ ...input, ...patch } as never, authenticatedContext),
      ).rejects.toThrow('Invalid Instagram composer input');
      expect(attempts.findComposerAttempt).not.toHaveBeenCalled();
      expect(locks.withNormalizedHandleLock).not.toHaveBeenCalled();
      expect(permission.assertCanSend).not.toHaveBeenCalled();
      expect(send.executeApprovedWithDraftLockHeld).not.toHaveBeenCalled();
    },
  );

  it('canonicalizes selected Creator UUID case for receipt recovery without current Creator resolution', async () => {
    const upperCreatorId = creatorId.toUpperCase();
    const digest = sha256([
      workspaceId,
      userWorkspaceId,
      draftId,
      ['creatorRecordId', creatorId],
      accountId,
      'preparation-fingerprint',
      'hello',
    ]);
    const approvals = {
      findComposerAttempt: jest.fn().mockResolvedValue({
        id: bindingId,
        actionKind: 'START_CHAT',
        composerInputDigest: digest,
        instagramMessageSnapshot: snapshot,
        receipt: { id: 'receipt', state: 'SENT' },
      }),
      getApprovedBinding: jest
        .fn()
        .mockResolvedValue({ ...approvedBinding, composerInputDigest: digest }),
    };
    const recipient = {
      resolveNormalizedHandle: jest
        .fn()
        .mockRejectedValue(new Error('deleted')),
      resolve: jest.fn().mockRejectedValue(new Error('hidden')),
    };
    const send = {
      executeApprovedWithDraftLockHeld: jest
        .fn()
        .mockResolvedValue({ status: 'SENT', receiptId: 'receipt' }),
    };
    const service = new InstagramMessageComposerService(
      {} as never,
      recipient as never,
      { assertCanSend: jest.fn() } as never,
      createLockService([]) as never,
      approvals as never,
      send as never,
    );

    await expect(
      service.send(
        { ...input, recipient: { creatorRecordId: upperCreatorId } },
        authenticatedContext,
      ),
    ).resolves.toEqual({ status: 'SENT', receiptId: 'receipt' });
    expect(recipient.resolveNormalizedHandle).not.toHaveBeenCalled();
    expect(recipient.resolve).not.toHaveBeenCalled();
  });

  it('fails closed when the durable attempt changes after its draft-derived handle hint', async () => {
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('information_schema.columns')) {
        expect(params).toEqual([
          getWorkspaceSchemaName(workspaceId),
          ['composerInputDigest', 'instagramMessageSnapshot'],
        ]);
        return [
          { column_name: 'composerInputDigest' },
          { column_name: 'instagramMessageSnapshot' },
        ];
      }
      expect(sql).toContain(`"${getWorkspaceSchemaName(workspaceId)}"`);
      expect(params).toEqual([draftId]);
      return [verifiedDraftRow];
    });
    const approvals = {
      findComposerAttempt: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          id: bindingId,
          actionKind: 'START_CHAT',
          composerInputDigest,
          instagramMessageSnapshot: {
            ...snapshot,
            publicIdentifier: 'other.creator',
          },
          receipt: { id: 'receipt' },
        }),
      getApprovedBinding: jest.fn(),
    };
    const recipient = {
      resolveNormalizedHandle: jest.fn(),
      resolve: jest.fn(),
    };
    const locks = createLockService([]);
    const service = new InstagramMessageComposerService(
      {
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
      } as never,
      recipient as never,
      { assertCanSend: jest.fn() } as never,
      locks as never,
      approvals as never,
      { executeApprovedWithDraftLockHeld: jest.fn() } as never,
    );

    await expect(service.send(input, authenticatedContext)).rejects.toThrow(
      'Instagram composer context changed',
    );
    expect(locks.withNormalizedHandleLock).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedHandle: 'recipient' }),
      expect.any(Function),
    );
    expect(recipient.resolveNormalizedHandle).not.toHaveBeenCalled();
  });
});

describe('InstagramMessageComposerService receiptless binding recovery', () => {
  it.each([
    [
      'account binding',
      (value: typeof snapshot) => ({
        ...value,
        accountBindingId: '00000000-0000-4000-8000-000000000008',
      }),
    ],
    [
      'recipient attendee',
      (value: typeof snapshot) => ({
        ...value,
        attendeeProviderId: 'other-attendee',
      }),
    ],
    [
      'provider target',
      (value: typeof snapshot) => ({
        ...value,
        providerMessagingId: 'other-messaging',
      }),
    ],
  ])(
    'rejects changed immutable %s before permission or handoff',
    async (_name, mutate) => {
      const query = jest.fn(async (sql: string) =>
        sql.includes('information_schema.columns')
          ? [
              { column_name: 'composerInputDigest' },
              { column_name: 'instagramMessageSnapshot' },
            ]
          : [verifiedDraftRow],
      );
      const changed = mutate(snapshot);
      const attempt = {
        id: bindingId,
        actionKind: 'START_CHAT' as const,
        composerInputDigest,
        instagramMessageSnapshot: changed,
        receipt: null,
      };
      const approvals = {
        findComposerAttempt: jest.fn().mockResolvedValue(attempt),
        getApprovedBinding: jest.fn().mockResolvedValue(approvedBinding),
      };
      const changedGraph = {
        ...graph,
        normalizedHandle: changed.publicIdentifier,
        creatorRecordId: changed.creatorRecordId,
        account: {
          bindingId: changed.accountBindingId,
          instagramAccountRecordId: changed.instagramAccountRecordId,
          unipileAccountId: changed.unipileAccountId,
          instagramUserId: changed.instagramUserId,
        },
        recipient: {
          providerId: changed.providerId,
          providerMessagingId: changed.providerMessagingId,
          sourceValues: changed.recipientSourceValues,
        },
      };
      const permission = { assertCanSend: jest.fn() };
      const send = { executeApprovedWithDraftLockHeld: jest.fn() };
      const service = new InstagramMessageComposerService(
        {
          getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
        } as never,
        { resolve: jest.fn().mockResolvedValue(changedGraph) } as never,
        permission as never,
        createLockService([]) as never,
        approvals as never,
        send as never,
      );

      await expect(service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(permission.assertCanSend).not.toHaveBeenCalled();
      expect(send.executeApprovedWithDraftLockHeld).not.toHaveBeenCalled();
    },
  );
});

describe('InstagramMessageComposerService immutable retry binding', () => {
  it.each([
    ['selected Creator', { recipient: { creatorRecordId: creatorId } }],
    ['raw handle', { recipient: { rawHandle: 'other.creator' } }],
    ['sending account', { expectedAccountRecordId: bindingId }],
    [
      'preparation fingerprint',
      { expectedPreparationFingerprint: 'changed-fingerprint' },
    ],
    ['body', { body: 'changed body' }],
  ])(
    'rejects a same-draft retry with changed %s before route resolution or handoff',
    async (_name, patch) => {
      const approvals = {
        findComposerAttempt: jest.fn().mockResolvedValue({
          id: bindingId,
          actionKind: 'START_CHAT',
          composerInputDigest,
          instagramMessageSnapshot: snapshot,
          receipt: null,
        }),
        getApprovedBinding: jest.fn(),
      };
      const recipient = {
        resolveNormalizedHandle: jest.fn(),
        resolve: jest.fn(),
      };
      const send = { executeApprovedWithDraftLockHeld: jest.fn() };
      const service = new InstagramMessageComposerService(
        {} as never,
        recipient as never,
        { assertCanSend: jest.fn() } as never,
        createLockService([]) as never,
        approvals as never,
        send as never,
      );

      await expect(
        service.send({ ...input, ...patch } as never, authenticatedContext),
      ).rejects.toThrow('Instagram composer input changed');
      expect(recipient.resolve).not.toHaveBeenCalled();
      expect(send.executeApprovedWithDraftLockHeld).not.toHaveBeenCalled();
    },
  );
});

// Recovery fixtures check the actual SQL boundary, not a response queue. A
// colliding draft is never inserted/updated, including a soft-deleted row.
const buildRecoveryHarness = () => {
  const state = {
    row: { ...verifiedDraftRow, deletedAt: null } as Record<string, unknown>,
    snapshot: JSON.parse(
      JSON.stringify(snapshot),
    ) as InstagramMessageIdentitySnapshot,
    digest: composerInputDigest,
    bindingPresent: true,
    receipt: null as { id: string; state: string } | null,
  };
  const events: string[] = [];
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('information_schema.columns')) {
      expect(params).toEqual([
        getWorkspaceSchemaName(workspaceId),
        ['composerInputDigest', 'instagramMessageSnapshot'],
      ]);
      expect(sql).toContain("table_name = '_myahInstagramReplyDraft'");
      return [
        { column_name: 'composerInputDigest' },
        { column_name: 'instagramMessageSnapshot' },
      ];
    }
    if (sql.includes('set_config')) {
      expect(params).toEqual([getWorkspaceSchemaName(workspaceId)]);
      return [];
    }
    if (sql.includes('INSERT INTO')) {
      expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
      expect(params[0]).toBe(state.row.id);
      return [];
    }
    expect(sql).toContain(
      `FROM "${getWorkspaceSchemaName(workspaceId)}"."_myahInstagramReplyDraft"`,
    );
    expect(sql).toContain('WHERE "id" = $1 AND "deletedAt" IS NULL');
    expect(params).toEqual([draftId]);
    events.push('draft-read');
    return state.row.id === params[0] && state.row.deletedAt === null
      ? [JSON.parse(JSON.stringify(state.row))]
      : [];
  });
  const dataSource = {
    driver: { escape: (identifier: string) => `"${identifier}"` },
    query,
    createQueryRunner: jest.fn(() => transactionRunner()),
  };
  const binding = () =>
    buildInstagramMessageV3ActionAuthority({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId: null,
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
      interactionContextId: draftId,
      composerInputDigest: state.digest,
      instagramMessageSnapshot: state.snapshot,
      draft: {
        id: draftId,
        revision: 1,
        body: 'hello',
        kind: state.snapshot.actionKind,
        creatorRecordId: creatorId,
        recipientUsername: 'recipient',
        recipientSourceValues: state.snapshot.recipientSourceValues,
        conversationRecordId: state.snapshot.conversationRecordId,
        providerConversationId: state.snapshot.providerChatId,
        recipientProviderId: 'provider-id',
      },
      account: {
        bindingId,
        workspaceInstagramAccountRecordId: accountId,
        unipileAccountId: 'unipile-account',
        instagramUserId: 'instagram-user',
      },
      evidenceLinks: buildInstagramMessageEvidenceLinks({
        objectMetadatas: composerObjectMetadata,
        accountRecordId: accountId,
        draftId,
        conversationRecordId: state.snapshot.conversationRecordId,
        creatorRecordId: creatorId,
      }),
    }).expectedActionBinding;
  const approvals = {
    findComposerAttempt: jest.fn(async (where) => {
      expect(where).toEqual({
        workspaceId,
        draftId,
        initiatorUserWorkspaceId: userWorkspaceId,
      });
      events.push('attempt-read');
      return state.bindingPresent
        ? {
            id: bindingId,
            actionKind: state.snapshot.actionKind,
            instagramMessageSnapshot: JSON.parse(
              JSON.stringify(state.snapshot),
            ),
            composerInputDigest: state.digest,
            receipt: state.receipt,
          }
        : null;
    }),
    getApprovedBinding: jest.fn(async (where) => {
      expect(where).toEqual({
        workspaceId,
        approvalBindingId: bindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId: null,
        interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        interactionContextId: draftId,
      });
      return binding();
    }),
    createApprovedInstagramMessageBinding: jest.fn(async () => ({
      id: bindingId,
    })),
  };
  const recipient = {
    assertCreatorMatchesUnderLock: jest.fn(),
    resolveNormalizedHandle: jest.fn(async () => {
      throw new Error('current Creator unavailable');
    }),
    resolve: jest.fn<Promise<ResolvedInstagramComposerGraph>, unknown[]>(
      async () => JSON.parse(JSON.stringify(graph)),
    ),
  };
  const permission = { assertCanSend: jest.fn(async () => undefined) };
  // Handoff is intentionally not a provider send. Task 5 v3 dispatch stays closed.
  const send = {
    executeApprovedWithDraftLockHeld: jest.fn(async () => ({
      status: 'SENT' as const,
      receiptId: 'receipt',
    })),
  };
  const locks = createLockService(events);
  const service = new InstagramMessageComposerService(
    {
      getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
      getRepository: jest.fn(async (_workspace, name, role) => {
        expect(name).toBe('myahInstagramReplyDraft');
        expect(role).toBe(authenticatedContext.rolePermissionConfig);
        return {
          findOne: jest.fn(async (options, manager) => {
            expect(manager.queryRunner.isTransactionActive).toBe(true);
            expect(options).toEqual({
              where: { id: draftId },
              withDeleted: true,
              select: { id: true },
              lock: { mode: 'pessimistic_write' },
            });
            return { id: state.row.id };
          }),
          insert: jest.fn(async () => {
            throw new Error('must not insert colliding draft');
          }),
        };
      }),
    } as never,
    recipient as never,
    permission as never,
    locks as never,
    approvals as never,
    send as never,
  );
  const expectNoApprovalOrSend = () => {
    expect(
      approvals.createApprovedInstagramMessageBinding,
    ).not.toHaveBeenCalled();
    expect(send.executeApprovedWithDraftLockHeld).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => /UPDATE|DELETE/.test(sql))).toBe(
      false,
    );
  };
  return {
    service,
    state,
    binding,
    query,
    dataSource,
    approvals,
    recipient,
    permission,
    send,
    locks,
    events,
    expectNoApprovalOrSend,
  };
};

const draftMutations = [
  {
    name: 'unowned provenance',
    patch: { createdByWorkspaceMemberId: accountId },
    readable: false,
  },
  {
    name: 'missing provenance',
    patch: { createdByWorkspaceMemberId: null },
    readable: false,
  },
  { name: 'status', patch: { status: 'APPROVED' }, readable: false },
  { name: 'source', patch: { source: 'AI' }, readable: false },
  { name: 'sent timestamp', patch: { sentAt: new Date() }, readable: false },
  { name: 'deleted row', patch: { deletedAt: new Date() }, readable: false },
  { name: 'kind', patch: { kind: 'REPLY' }, readable: false },
  { name: 'missing target', patch: { creatorId: null }, readable: false },
  { name: 'Creator target', patch: { creatorId: accountId }, readable: false },
  {
    name: 'recipient username',
    patch: { recipientUsername: 'other' },
    readable: false,
  },
  {
    name: 'recipient provider ID',
    patch: { recipientProviderId: 'other' },
    readable: false,
  },
  {
    name: 'conversation',
    patch: { conversationId: accountId },
    readable: false,
  },
  { name: 'revision', patch: { revision: 2 }, readable: false },
  { name: 'malformed revision', patch: { revision: 'bad' }, readable: false },
  { name: 'body', patch: { body: 'changed' }, readable: true },
  { name: 'empty body', patch: { body: '' }, readable: false },
  { name: 'non-string body', patch: { body: 123 }, readable: false },
  { name: 'untrimmed body', patch: { body: ' hello ' }, readable: false },
  {
    name: 'missing digest',
    patch: { composerInputDigest: null },
    readable: false,
  },
  {
    name: 'malformed digest',
    patch: { composerInputDigest: 'bad' },
    readable: false,
  },
  {
    name: 'different digest',
    patch: { composerInputDigest: 'f'.repeat(64) },
    readable: true,
  },
  {
    name: 'missing snapshot',
    patch: { instagramMessageSnapshot: null },
    readable: false,
  },
  {
    name: 'malformed snapshot',
    patch: { instagramMessageSnapshot: {} },
    readable: false,
  },
];

const snapshotMutations: Array<{
  name: keyof InstagramMessageIdentitySnapshot;
  value: unknown;
}> = [
  { name: 'publicIdentifier', value: 'other' },
  { name: 'providerId', value: 'other-profile' },
  { name: 'providerMessagingId', value: 'other-messaging' },
  { name: 'creatorRecordId', value: accountId },
  { name: 'accountBindingId', value: creatorId },
  { name: 'instagramAccountRecordId', value: creatorId },
  { name: 'unipileAccountId', value: 'other-account' },
  { name: 'instagramUserId', value: 'other-user' },
  {
    name: 'recipientSourceValues',
    value: [{ field: 'instagramUsername', value: 'other' }],
  },
  { name: 'actionKind', value: 'REPLY' },
  { name: 'conversationRecordId', value: accountId },
  { name: 'providerChatId', value: 'other-chat' },
  { name: 'attendeeProviderId', value: 'other-attendee' },
];

const graphForSnapshot = (
  value: InstagramMessageIdentitySnapshot,
): ResolvedInstagramComposerGraph => ({
  ...graph,
  normalizedHandle: value.publicIdentifier,
  creatorRecordId: value.creatorRecordId,
  actionKind: value.actionKind,
  account: {
    bindingId: value.accountBindingId,
    instagramAccountRecordId: value.instagramAccountRecordId,
    unipileAccountId: value.unipileAccountId,
    instagramUserId: value.instagramUserId,
  },
  recipient: {
    providerId: value.providerId,
    providerMessagingId: value.providerMessagingId,
    sourceValues: value.recipientSourceValues,
  },
  chat: {
    actionKind: value.actionKind,
    conversationRecordId: value.conversationRecordId,
    providerChatId: value.providerChatId,
  } as ResolvedInstagramComposerGraph['chat'],
});

describe('InstagramMessageComposerService committed draft recovery matrix', () => {
  it('reports COMMITTED without binding or receipt and resumes approval without rewriting the exact trimmed revision-one draft', async () => {
    const h = buildRecoveryHarness();
    h.state.bindingPresent = false;
    const before = structuredClone(h.state.row);
    await expect(
      h.service.getAttempt(draftId, authenticatedContext),
    ).resolves.toEqual({
      draftId,
      approvalBindingId: null,
      receiptId: null,
      state: 'COMMITTED',
    });
    await h.service.send(input, authenticatedContext);
    expect(h.state.row).toEqual(before);
    expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledTimes(1);
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        composerInputDigest,
        instagramMessageSnapshot: snapshot,
      }),
    );
    expect(h.send.executeApprovedWithDraftLockHeld).toHaveBeenCalledTimes(1);
  });

  it.each(draftMutations)(
    'never approves or overwrites committed draft with changed $name',
    async ({ patch, readable }) => {
      const h = buildRecoveryHarness();
      h.state.bindingPresent = false;
      Object.assign(h.state.row, patch);
      const before = structuredClone(h.state.row);
      const attempt = await h.service.getAttempt(draftId, authenticatedContext);
      // getAttempt has no submitted payload: only send can compare a well-formed
      // changed body/digest against that payload. COMMITTED is not approval.
      expect(attempt?.state ?? null).toBe(readable ? 'COMMITTED' : null);
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        /Instagram composer (context|input) changed/,
      );
      h.expectNoApprovalOrSend();
      expect(h.state.row).toEqual(before);
    },
  );

  it.each(snapshotMutations)(
    'rejects committed snapshot $name drift without a replacement approval',
    async ({ name, value }) => {
      const h = buildRecoveryHarness();
      h.state.bindingPresent = false;
      h.state.row.instagramMessageSnapshot = { ...snapshot, [name]: value };
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        /Instagram composer (context|input) changed/,
      );
      h.expectNoApprovalOrSend();
    },
  );
});

describe('InstagramMessageComposerService complete receiptless recovery matrix', () => {
  it.each([
    { name: 'workspaceId', value: accountId },
    { name: 'initiatorUserWorkspaceId', value: accountId },
    { name: 'actionName', value: 'send_outreach_email' },
    { name: 'actionVersion', value: 2 },
    { name: 'actionKind', value: 'REPLY' },
    { name: 'draftId', value: accountId },
    { name: 'threadId', value: accountId },
    { name: 'interactionContextType', value: 'MYAH_INBOX_INSTAGRAM_DRAFT' },
    { name: 'interactionContextId', value: accountId },
    { name: 'contentDigest', value: 'f'.repeat(64) },
    { name: 'recipientFingerprint', value: 'f'.repeat(64) },
    { name: 'sendingAccountFingerprint', value: 'f'.repeat(64) },
    { name: 'actionContextFingerprint', value: 'f'.repeat(64) },
    { name: 'composerInputDigest', value: 'f'.repeat(64) },
    {
      name: 'evidenceLinks',
      value: [
        { objectMetadataId: accountId, recordId: creatorId, role: 'draft' },
      ],
    },
    { name: 'instagramMessageSnapshot', value: null },
  ])(
    'rejects separately loaded binding $name mutation against rebuilt full authority',
    async ({ name, value }) => {
      const h = buildRecoveryHarness();
      const unchanged = structuredClone(h.state);
      h.approvals.getApprovedBinding.mockResolvedValue({
        ...h.binding(),
        [name]: value,
      } as never);
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        /Instagram composer (context changed|attempt is unavailable)/,
      );
      expect(h.approvals.getApprovedBinding).toHaveBeenCalledTimes(1);
      expect(h.state).toEqual(unchanged);
      expect(h.permission.assertCanSend).not.toHaveBeenCalled();
      h.expectNoApprovalOrSend();
    },
  );

  it.each(snapshotMutations)(
    'rejects separately loaded binding snapshot $name mutation against rebuilt full authority',
    async ({ name, value }) => {
      const h = buildRecoveryHarness();
      const unchanged = structuredClone(h.state);
      h.approvals.getApprovedBinding.mockResolvedValue({
        ...h.binding(),
        instagramMessageSnapshot: { ...snapshot, [name]: value },
      } as never);
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.recipient.resolve).toHaveBeenCalledTimes(1);
      expect(h.state).toEqual(unchanged);
      expect(h.permission.assertCanSend).not.toHaveBeenCalled();
      h.expectNoApprovalOrSend();
    },
  );

  it('hands off an unchanged authorized receiptless binding without creating approval or mutating the draft', async () => {
    const h = buildRecoveryHarness();
    await h.service.send(input, authenticatedContext);
    expect(h.recipient.resolve).toHaveBeenCalledTimes(1);
    expect(h.permission.assertCanSend).toHaveBeenCalledWith({
      workspaceId,
      actionKind: 'START_CHAT',
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
    });
    expect(h.send.executeApprovedWithDraftLockHeld).toHaveBeenCalledTimes(1);
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).not.toHaveBeenCalled();
    expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it.each(draftMutations)(
    'rejects receiptless draft $name mutation before handoff',
    async ({ patch }) => {
      const h = buildRecoveryHarness();
      Object.assign(h.state.row, patch);
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.recipient.resolve).not.toHaveBeenCalled();
      h.expectNoApprovalOrSend();
    },
  );

  it.each(snapshotMutations)(
    'rejects protected draft snapshot $name mutation against the immutable binding',
    async ({ name, value }) => {
      const h = buildRecoveryHarness();
      h.state.row.instagramMessageSnapshot = { ...snapshot, [name]: value };
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.recipient.resolve).not.toHaveBeenCalled();
      h.expectNoApprovalOrSend();
    },
  );

  it.each(
    snapshotMutations.filter(({ name }) => name !== 'attendeeProviderId'),
  )(
    'rejects current graph $name drift against an unchanged binding and draft',
    async ({ name, value }) => {
      const h = buildRecoveryHarness();
      h.recipient.resolve.mockResolvedValue(
        graphForSnapshot({
          ...snapshot,
          [name]: value,
        } as InstagramMessageIdentitySnapshot),
      );
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.recipient.resolve).toHaveBeenCalledTimes(1);
      h.expectNoApprovalOrSend();
    },
  );

  it('rejects REPLY attendee identity drift against matching stored snapshots', async () => {
    const h = buildRecoveryHarness();
    h.state.snapshot = {
      ...snapshot,
      actionKind: 'REPLY',
      conversationRecordId: accountId,
      providerChatId: 'chat',
      attendeeProviderId: 'provider-messaging-id',
    };
    Object.assign(h.state.row, {
      kind: 'REPLY',
      conversationId: accountId,
      instagramMessageSnapshot: h.state.snapshot,
    });
    h.recipient.resolve.mockResolvedValue(
      graphForSnapshot({
        ...h.state.snapshot,
        providerMessagingId: 'other-attendee',
      }),
    );
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'Instagram composer context changed',
    );
    h.expectNoApprovalOrSend();
  });

  it('never reclassifies a receiptless START binding into a newly visible REPLY', async () => {
    const h = buildRecoveryHarness();
    h.recipient.resolve.mockResolvedValue(
      graphForSnapshot({
        ...snapshot,
        actionKind: 'REPLY',
        conversationRecordId: accountId,
        providerChatId: 'chat',
        attendeeProviderId: 'provider-messaging-id',
      }),
    );
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'Instagram composer context changed',
    );
    h.expectNoApprovalOrSend();
  });

  it.each([false, true])(
    'rejects revoked bound-route permission with receipt=%s',
    async (hasReceipt) => {
      const h = buildRecoveryHarness();
      h.state.receipt = hasReceipt ? { id: 'receipt', state: 'SENT' } : null;
      h.permission.assertCanSend.mockRejectedValue(
        new Error('permission revoked'),
      );
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'permission revoked',
      );
      expect(h.permission.assertCanSend).toHaveBeenCalledWith({
        workspaceId,
        actionKind: 'START_CHAT',
        rolePermissionConfig: authenticatedContext.rolePermissionConfig,
      });
      h.expectNoApprovalOrSend();
      if (hasReceipt) expect(h.recipient.resolve).not.toHaveBeenCalled();
    },
  );

  it('rejects an unresolved target claim before approval or sender handoff', async () => {
    const h = buildRecoveryHarness();
    h.recipient.resolve.mockRejectedValue(new Error('TARGET_LOCKED'));
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'TARGET_LOCKED',
    );
    h.expectNoApprovalOrSend();
  });

  it('compares JSONB snapshots and submitted-input digests independently of JS property order', async () => {
    const h = buildRecoveryHarness();
    // Storage reorders JSONB keys, not the fingerprints approved beforehand.
    const loadedBinding = h.binding();
    h.state.row.instagramMessageSnapshot = Object.fromEntries(
      Object.entries(snapshot).reverse(),
    );
    h.state.snapshot.recipientSourceValues = [
      { value: 'recipient', field: 'instagramUsername' },
    ];
    h.approvals.getApprovedBinding.mockResolvedValue({
      ...loadedBinding,
      instagramMessageSnapshot: h.state.snapshot,
    });
    const reorderedInput = {
      body: input.body,
      expectedPreparationFingerprint: input.expectedPreparationFingerprint,
      expectedAccountRecordId: accountId,
      draftId,
      recipient: input.recipient,
    };
    await h.service.send(reorderedInput, authenticatedContext);
    expect(h.send.executeApprovedWithDraftLockHeld).toHaveBeenCalledTimes(1);
  });

  it.each(['renamed', 'deleted', 'hidden'])(
    'recovers selected-Creator receipt after Creator is %s using consistent submitted-ID authority',
    async (reason) => {
      const h = buildRecoveryHarness();
      const selectedInput = {
        ...input,
        recipient: { creatorRecordId: creatorId.toUpperCase() },
      };
      h.state.digest = sha256([
        workspaceId,
        userWorkspaceId,
        draftId,
        ['creatorRecordId', creatorId],
        accountId,
        input.expectedPreparationFingerprint,
        'hello',
      ]);
      h.state.receipt = { id: 'receipt', state: 'SENT' };
      h.recipient.resolve.mockRejectedValue(new Error(reason));
      await expect(
        h.service.send(selectedInput, authenticatedContext),
      ).resolves.toEqual({ status: 'SENT', receiptId: 'receipt' });
      expect(h.recipient.resolve).not.toHaveBeenCalled();
      expect(h.recipient.resolveNormalizedHandle).not.toHaveBeenCalled();
      expect(h.query).not.toHaveBeenCalled();
      expect(h.permission.assertCanSend).toHaveBeenCalledWith({
        workspaceId,
        actionKind: 'START_CHAT',
        rolePermissionConfig: authenticatedContext.rolePermissionConfig,
      });
    },
  );

  it.each(['hint changed', 'hint disappeared', 'attempt changed'])(
    'fails closed under handle then draft locks when %s',
    async (change) => {
      const h = buildRecoveryHarness();
      h.state.bindingPresent = change === 'attempt changed';
      h.locks.withLock.mockImplementation(async (_input, operation) => {
        h.events.push('draft-lock');
        if (change === 'hint changed')
          h.state.row.instagramMessageSnapshot = {
            ...snapshot,
            publicIdentifier: 'other',
          };
        if (change === 'hint disappeared') h.state.row.deletedAt = new Date();
        if (change === 'attempt changed') h.state.snapshot.providerId = 'other';
        return operation();
      });
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.locks.withNormalizedHandleLock).toHaveBeenCalledTimes(1);
      expect(h.events.indexOf('handle-lock')).toBeLessThan(
        h.events.indexOf('draft-lock'),
      );
      h.expectNoApprovalOrSend();
    },
  );
});

describe('InstagramMessageComposerService discovery-state identity', () => {
  it.each([
    ['absent', 'binding'],
    ['absent', 'draft-only'],
    ['draft-only', 'binding'],
  ])(
    'rejects same-handle same-digest %s to %s transition under one handle lock',
    async (before, after) => {
      const h = buildRecoveryHarness();
      h.state.bindingPresent = false;
      if (before === 'absent') h.state.row.deletedAt = new Date();
      h.locks.withLock.mockImplementation(async (_input, operation) => {
        h.events.push('draft-lock');
        h.state.row.deletedAt = null;
        h.state.bindingPresent = after === 'binding';
        return operation();
      });
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.locks.withNormalizedHandleLock).toHaveBeenCalledTimes(1);
      expect(h.locks.withNormalizedHandleLock).toHaveBeenCalledWith(
        { workspaceId, normalizedHandle: snapshot.publicIdentifier },
        expect.any(Function),
      );
      expect(h.events.indexOf('handle-lock')).toBeLessThan(
        h.events.indexOf('draft-lock'),
      );
      expect(h.approvals.getApprovedBinding).not.toHaveBeenCalled();
      expect(h.recipient.resolve).not.toHaveBeenCalled();
      h.expectNoApprovalOrSend();
    },
  );

  it.each([
    { name: 'binding ID', patch: { id: accountId } },
    { name: 'route', patch: { actionKind: 'REPLY' as const } },
    { name: 'digest', patch: { composerInputDigest: 'f'.repeat(64) } },
    {
      name: 'snapshot',
      patch: { instagramMessageSnapshot: { ...snapshot, providerId: 'other' } },
    },
  ])(
    'rejects immutable $name drift under one handle lock',
    async ({ patch }) => {
      const h = buildRecoveryHarness();
      const lookup = h.approvals.findComposerAttempt.getMockImplementation()!;
      h.locks.withLock.mockImplementation(async (_input, operation) => {
        h.events.push('draft-lock');
        h.approvals.findComposerAttempt.mockImplementation(async (where) => ({
          ...(await lookup(where))!,
          ...patch,
        }));
        return operation();
      });
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        /Instagram composer (context|input) changed/,
      );
      expect(h.locks.withNormalizedHandleLock).toHaveBeenCalledTimes(1);
      expect(h.approvals.getApprovedBinding).not.toHaveBeenCalled();
      h.expectNoApprovalOrSend();
    },
  );

  it.each([null, { id: 'receipt', state: 'PROCESSING' }])(
    'allows receipt progression from %j without treating outcomes as a new attempt',
    async (receipt) => {
      const h = buildRecoveryHarness();
      h.state.receipt = receipt;
      h.recipient.resolve.mockRejectedValue(
        new Error('mutable graph unavailable'),
      );
      h.locks.withLock.mockImplementation(async (_input, operation) => {
        h.events.push('draft-lock');
        h.state.receipt = { id: 'receipt', state: 'SENT' };
        return operation();
      });
      await expect(
        h.service.send(input, authenticatedContext),
      ).resolves.toEqual({
        status: 'SENT',
        receiptId: 'receipt',
      });
      expect(h.locks.withNormalizedHandleLock).toHaveBeenCalledTimes(1);
      expect(h.query).not.toHaveBeenCalled();
      expect(h.recipient.resolve).not.toHaveBeenCalled();
      expect(h.permission.assertCanSend).toHaveBeenCalledTimes(1);
      expect(h.send.executeApprovedWithDraftLockHeld).toHaveBeenCalledTimes(1);
    },
  );
});

describe('InstagramMessageComposerService own Creator preparation exception', () => {
  const setup = () => {
    const h = buildRecoveryHarness();
    h.state.bindingPresent = false;
    const expectedPreparationFingerprint =
      computeInstagramComposerPreparationFingerprint(
        input,
        authenticatedContext,
        { ...graph, creatorRecordId: null },
      );
    const retry = { ...input, expectedPreparationFingerprint };
    h.state.row.composerInputDigest = sha256([
      workspaceId,
      userWorkspaceId,
      draftId,
      ['rawHandle', 'recipient'],
      accountId,
      expectedPreparationFingerprint,
      'hello',
    ]);
    h.recipient.resolve.mockResolvedValue({
      ...graph,
      preparationFingerprint: computeInstagramComposerPreparationFingerprint(
        input,
        authenticatedContext,
        graph,
      ),
    });
    return { h, retry };
  };

  it('resumes only the original null-Creator preparation after its own verified Creator commit', async () => {
    const { h, retry } = setup();
    await h.service.send(retry, authenticatedContext);
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledTimes(1);
    expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(h.permission.assertCanSend).toHaveBeenCalledTimes(1);
  });

  it.each([
    'arbitrary fingerprint',
    'selected Creator',
    'pre-existing Creator preparation',
  ])('does not excuse %s as own Creator creation', async (change) => {
    const { h, retry } = setup();
    const selected = change === 'selected Creator';
    const recipient = selected
      ? { creatorRecordId: creatorId }
      : input.recipient;
    const expectedPreparationFingerprint =
      change === 'arbitrary fingerprint'
        ? 'arbitrary'
        : computeInstagramComposerPreparationFingerprint(
            { recipient },
            authenticatedContext,
            { ...graph, creatorRecordId: selected ? null : accountId },
          );
    h.state.row.composerInputDigest = sha256([
      workspaceId,
      userWorkspaceId,
      draftId,
      selected ? ['creatorRecordId', creatorId] : ['rawHandle', 'recipient'],
      accountId,
      expectedPreparationFingerprint,
      'hello',
    ]);
    await expect(
      h.service.send(
        { ...retry, recipient, expectedPreparationFingerprint },
        authenticatedContext,
      ),
    ).rejects.toThrow('Instagram composer context changed');
    h.expectNoApprovalOrSend();
  });

  it.each(
    snapshotMutations.filter(({ name }) => name !== 'attendeeProviderId'),
  )(
    'does not excuse unrelated $name graph drift after own Creator creation',
    async ({ name, value }) => {
      const { h, retry } = setup();
      h.recipient.resolve.mockResolvedValue(
        graphForSnapshot({
          ...snapshot,
          [name]: value,
        } as InstagramMessageIdentitySnapshot),
      );
      await expect(h.service.send(retry, authenticatedContext)).rejects.toThrow(
        'Instagram composer context changed',
      );
      h.expectNoApprovalOrSend();
    },
  );
});

describe('InstagramMessageComposerService selected-ID input binding', () => {
  it('rejects a changed selected Creator ID for the same selected-ID attempt before current resolution', async () => {
    const h = buildRecoveryHarness();
    h.state.digest = sha256([
      workspaceId,
      userWorkspaceId,
      draftId,
      ['creatorRecordId', creatorId],
      accountId,
      input.expectedPreparationFingerprint,
      'hello',
    ]);
    h.state.receipt = { id: 'receipt', state: 'SENT' };
    await expect(
      h.service.send(
        { ...input, recipient: { creatorRecordId: accountId } },
        authenticatedContext,
      ),
    ).rejects.toThrow('Instagram composer input changed');
    expect(h.recipient.resolve).not.toHaveBeenCalled();
    expect(h.recipient.resolveNormalizedHandle).not.toHaveBeenCalled();
    h.expectNoApprovalOrSend();
  });
});

describe('InstagramMessageComposerService valid REPLY graph recovery', () => {
  const setup = () => {
    const h = buildRecoveryHarness();
    h.state.snapshot = {
      ...snapshot,
      actionKind: 'REPLY',
      conversationRecordId: accountId,
      providerChatId: 'chat',
      attendeeProviderId: 'provider-messaging-id',
    };
    Object.assign(h.state.row, {
      kind: 'REPLY',
      conversationId: accountId,
      instagramMessageSnapshot: h.state.snapshot,
    });
    h.recipient.resolve.mockResolvedValue(graphForSnapshot(h.state.snapshot));
    return h;
  };
  it('hands off an unchanged authorized receiptless REPLY using its bound route', async () => {
    const h = setup();
    await h.service.send(input, authenticatedContext);
    expect(h.permission.assertCanSend).toHaveBeenCalledWith({
      workspaceId,
      actionKind: 'REPLY',
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
    });
    expect(h.send.executeApprovedWithDraftLockHeld).toHaveBeenCalledTimes(1);
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).not.toHaveBeenCalled();
    expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
  it.each([
    {
      name: 'conversationRecordId',
      patch: { conversationRecordId: bindingId },
    },
    { name: 'providerChatId', patch: { providerChatId: 'different-chat' } },
    {
      name: 'attendee identity',
      patch: {
        providerMessagingId: 'different-attendee',
        attendeeProviderId: 'different-attendee',
      },
    },
  ])('rejects current valid REPLY $name mutation', async ({ patch }) => {
    const h = setup();
    if (h.state.snapshot.actionKind !== 'REPLY') {
      throw new Error('Expected a REPLY fixture');
    }
    h.recipient.resolve.mockResolvedValue(
      graphForSnapshot({ ...h.state.snapshot, ...patch }),
    );
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'Instagram composer context changed',
    );
    h.expectNoApprovalOrSend();
  });
});

describe('InstagramMessageComposerService write transaction boundary', () => {
  it.each(['START_CHAT', 'REPLY'] as const)(
    'commits the complete %s fixed payload on the same runner',
    async (route) => {
      const h = buildTransactionHarness(route);
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'fresh v3 unavailable',
      );
      expect(h.runner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
      expect(h.runner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(h.runner.release).toHaveBeenCalledTimes(1);
      expect(h.runner.rollbackTransaction).not.toHaveBeenCalled();
      expect(h.state.creatorCommitted).toBe(true);
      expect(h.state.committed[0]).toMatchObject({
        id: draftId,
        body: 'hello',
        revision: 1,
        source: 'MANUAL',
        status: 'DRAFT',
        sentAt: null,
        deletedAt: null,
        composerInputDigest,
        kind: route === 'REPLY' ? 'REPLY' : 'FIRST_MESSAGE',
        instagramMessageSnapshot: {
          actionKind: route,
          creatorRecordId: creatorId,
          attendeeProviderId:
            route === 'REPLY' ? 'provider-messaging-id' : null,
        },
      });
      if (route === 'REPLY') {
        const exactWhere = {
          id: '00000000-0000-4000-8000-000000000008',
          instagramAccountId: accountId,
          providerConversationId: 'chat-id',
          recipientIgsid: 'provider-messaging-id',
          provider: 'UNIPILE',
          lifecycle: 'ACTIVE',
          deletedAt: expect.anything(),
        };
        expect(h.conversationRepository.findOne).toHaveBeenCalledWith(
          {
            where: exactWhere,
            select: { id: true, creatorId: true },
            lock: { mode: 'pessimistic_write' },
          },
          h.runner.manager,
        );
        expect(h.conversationRepository.update).toHaveBeenCalledWith(
          {
            ...exactWhere,
            creatorId: expect.objectContaining({ _type: 'isNull' }),
          },
          { creatorId },
          undefined,
          h.runner.manager,
          ['id'],
        );
        expect(h.events.indexOf('table-lock')).toBeLessThan(
          h.events.indexOf('conversation-lock'),
        );
        expect(h.state.linkCommitted).toBe(true);
        expect(h.eventSnapshots).toHaveBeenCalledTimes(2);
        expect(
          h.listener.mock.calls.filter(([name]) => name).map(([name]) => name),
        ).toEqual([
          'myahSocialConversation.updated',
          'myahSocialConversation.upserted',
        ]);
      }
    },
  );

  it.each(['object', 'field', 'RLS'])(
    'rolls back Creator and buffered events on draft %s denial',
    async (denial) => {
      const h = buildTransactionHarness('REPLY');
      h.draftRepository.insert.mockRejectedValueOnce(
        new Error(`${denial} denied`),
      );
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        `${denial} denied`,
      );
      expect(h.creatorRepository.insert).toHaveBeenCalledTimes(1);
      expect(h.conversationRepository.update).toHaveBeenCalledTimes(1);
      expect(h.state.committed).toEqual([]);
      expect(h.state.creatorCommitted).toBe(false);
      expect(h.state.linkCommitted).toBe(false);
      expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(h.runner.release).toHaveBeenCalledTimes(1);
      expect(h.listener).not.toHaveBeenCalled();
      expect(
        h.approvals.createApprovedInstagramMessageBinding,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['object', 'field', 'RLS'])(
    'does not persist any draft on Creator %s denial',
    async (denial) => {
      const h = buildTransactionHarness();
      h.creatorRepository.insert.mockRejectedValueOnce(
        new Error(`${denial} denied`),
      );
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        `${denial} denied`,
      );
      expect(h.draftRepository.insert).not.toHaveBeenCalled();
      expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(h.listener).not.toHaveBeenCalled();
      expect(h.state.committed).toEqual([]);
    },
  );

  it.each(['new canonical match', 'source drift', 'create permission revoked'])(
    'rejects %s under table lock before inserting',
    async (reason) => {
      const h = buildTransactionHarness();
      h.recipient.assertCreatorMatchesUnderLock.mockRejectedValueOnce(
        new Error(reason),
      );
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        reason,
      );
      expect(h.creatorRepository.insert).not.toHaveBeenCalled();
      expect(h.draftRepository.insert).not.toHaveBeenCalled();
      expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(h.runner.release).toHaveBeenCalledTimes(1);
    },
  );

  it.each([0, 2, undefined])(
    'rolls back a conditional conversation update affecting %s rows',
    async (affected) => {
      const h = buildTransactionHarness('REPLY');
      h.conversationRepository.update.mockResolvedValueOnce({
        affected: affected as number,
      });
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'conversation is unavailable',
      );
      expect(h.draftRepository.insert).not.toHaveBeenCalled();
      expect(h.state.creatorCommitted).toBe(false);
      expect(h.listener).not.toHaveBeenCalled();
    },
  );

  it.each(['field denied', 'RLS denied'])(
    'rolls back on conversation link %s',
    async (denial) => {
      const h = buildTransactionHarness('REPLY');
      h.conversationRepository.update.mockRejectedValueOnce(new Error(denial));
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        denial,
      );
      expect(h.state.creatorCommitted).toBe(false);
      expect(h.state.committed).toEqual([]);
      expect(h.listener).not.toHaveBeenCalled();
    },
  );

  it.each(['before', 'after'] as const)(
    'rolls back if the %s link event snapshot is missing',
    async (phase) => {
      const h = buildTransactionHarness('REPLY');
      if (phase === 'after')
        h.eventSnapshots.mockResolvedValueOnce({
          id: h.currentGraph.chat.conversationRecordId,
          creatorId: null,
        });
      h.eventSnapshots.mockResolvedValueOnce(null as never);
      await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
        'conversation is unavailable',
      );
      expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(h.state.linkCommitted).toBe(false);
      expect(h.listener).not.toHaveBeenCalled();
    },
  );

  it('never reassigns a conversation owned by another Creator', async () => {
    const h = buildTransactionHarness('REPLY');
    h.conversationRepository.findOne.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000008',
      creatorId: 'another-creator',
    });
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'conversation is unavailable',
    );
    expect(h.conversationRepository.update).not.toHaveBeenCalled();
    expect(h.state.creatorCommitted).toBe(false);
  });

  it('does not update a conversation already owned by the exact Creator', async () => {
    const h = buildTransactionHarness('REPLY');
    h.conversationRepository.findOne.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000008',
      creatorId,
    });
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'fresh v3 unavailable',
    );
    expect(h.conversationRepository.update).not.toHaveBeenCalled();
    expect(h.eventSnapshots).not.toHaveBeenCalled();
    expect(h.listener.mock.calls.filter(([name]) => name)).toEqual([]);
    expect(h.state.committed).toHaveLength(1);
  });

  it('discards staged writes and events on a precommit crash', async () => {
    const h = buildTransactionHarness();
    h.runner.commitTransaction.mockRejectedValueOnce(
      new Error('precommit crash'),
    );
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'precommit crash',
    );
    expect(h.state.committed).toEqual([]);
    expect(h.state.creatorCommitted).toBe(false);
    expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(h.listener).not.toHaveBeenCalled();
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).not.toHaveBeenCalled();
  });

  it.each(['approval crash', 'listener failure', 'release failure'])(
    'retains recoverable reply persistence after %s',
    async (failure) => {
      const h = buildTransactionHarness('REPLY');
      const originalFingerprint =
        computeInstagramComposerPreparationFingerprint(
          input,
          authenticatedContext,
          h.currentGraph,
        );
      h.currentGraph.preparationFingerprint = originalFingerprint;
      const original = {
        ...input,
        expectedPreparationFingerprint: originalFingerprint,
      };
      if (failure === 'approval crash')
        h.approvals.createApprovedInstagramMessageBinding.mockRejectedValueOnce(
          new Error(failure),
        );
      if (failure === 'listener failure')
        h.listener.mockImplementation(() => {
          throw new Error(failure);
        });
      if (failure === 'release failure')
        h.runner.release.mockRejectedValueOnce(new Error(failure));
      await expect(
        h.service.send(original, authenticatedContext),
      ).rejects.toThrow(
        failure === 'listener failure' ? 'fresh v3 unavailable' : failure,
      );
      expect(h.state.committed).toHaveLength(1);
      expect(h.state.creatorCommitted).toBe(true);
      expect(h.runner.rollbackTransaction).not.toHaveBeenCalled();
      if (failure === 'release failure')
        expect(h.listener).not.toHaveBeenCalled();
      h.state.released = true;
      h.currentGraph.creatorRecordId = creatorId;
      h.currentGraph.preparationFingerprint =
        computeInstagramComposerPreparationFingerprint(
          input,
          authenticatedContext,
          h.currentGraph,
        );
      await expect(
        h.service.getAttempt(draftId, authenticatedContext),
      ).resolves.toMatchObject({ state: 'COMMITTED' });
      await expect(
        h.service.send(original, authenticatedContext),
      ).rejects.toThrow('fresh v3 unavailable');
      expect(h.creatorRepository.insert).toHaveBeenCalledTimes(1);
      expect(h.draftRepository.insert).toHaveBeenCalledTimes(1);
      expect(h.dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    },
  );

  it('rolls back and releases on the bounded lock wait failing', async () => {
    const h = buildTransactionHarness();
    const query = h.runner.query.getMockImplementation()!;
    h.runner.query.mockImplementation(async (...args: unknown[]) => {
      if (String(args[0]).startsWith('LOCK TABLE'))
        throw new Error('lock timeout');
      return query(...args);
    });
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'lock timeout',
    );
    expect(h.recipient.assertCreatorMatchesUnderLock).not.toHaveBeenCalled();
    expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(h.runner.release).toHaveBeenCalledTimes(1);
  });

  it('checks the transaction deadline between database steps without starting another write', async () => {
    const h = buildTransactionHarness();
    h.recipient.assertCreatorMatchesUnderLock.mockImplementationOnce(
      async () => {
        jest.advanceTimersByTime(10_001);
      },
    );
    await expect(h.service.send(input, authenticatedContext)).rejects.toThrow(
      'transaction deadline exceeded',
    );
    expect(h.creatorRepository.insert).not.toHaveBeenCalled();
    expect(h.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(h.runner.release).toHaveBeenCalledTimes(1);
  });
});

describe('InstagramMessageComposerService overlapping composer protocol', () => {
  it('serializes two independently prepared raw attempts and refuses to adopt the first attempt’s Creator', async () => {
    const h = buildTransactionHarness();
    let tail = Promise.resolve();
    h.locks.withNormalizedHandleLock.mockImplementation(
      async (_input, operation) => {
        const preceding = tail;
        let unlock!: () => void;
        tail = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await preceding;
        try {
          return await operation();
        } finally {
          unlock();
        }
      },
    );
    let enterDraft!: () => void;
    const draftEntered = new Promise<void>((resolve) => {
      enterDraft = resolve;
    });
    let continueDraft!: () => void;
    const draftMayFinish = new Promise<void>((resolve) => {
      continueDraft = resolve;
    });
    const insert = h.draftRepository.insert.getMockImplementation()!;
    h.draftRepository.insert.mockImplementationOnce(async (...args) => {
      enterDraft();
      await draftMayFinish;
      return insert(...args);
    });
    const commit = h.runner.commitTransaction.getMockImplementation()!;
    h.runner.commitTransaction.mockImplementationOnce(async () => {
      await commit();
      h.currentGraph.creatorRecordId = creatorId;
      h.currentGraph.preparationFingerprint = 'changed-after-another-attempt';
    });
    const first = h.service.send(input, authenticatedContext);
    await draftEntered;
    const second = h.service.send(
      { ...input, draftId: secondDraftId },
      authenticatedContext,
    );
    const outcomes = Promise.allSettled([first, second]);
    expect(h.state.committed).toEqual([]);
    continueDraft();
    expect(await outcomes).toEqual([
      {
        status: 'rejected',
        reason: expect.objectContaining({ message: 'fresh v3 unavailable' }),
      },
      {
        status: 'rejected',
        reason: expect.objectContaining({
          message: 'Instagram composer context changed',
        }),
      },
    ]);
    expect(h.creatorRepository.insert).toHaveBeenCalledTimes(1);
    expect(h.state.committed).toHaveLength(1);
    expect(h.dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
  });
});

// Actual composer, recipient, approval persistence/reservation, authority reader,
// access/permission and sender. SQL repositories, locks/budget and HTTP transport
// are fixture boundaries; no authority or approval methods are replaced.
const buildComposedSendHarness = async (route: 'START_CHAT' | 'REPLY') => {
  const h = buildTransactionHarness(route);
  h.currentGraph.creatorRecordId = creatorId;
  const conversationId =
    route === 'REPLY' ? h.currentGraph.chat.conversationRecordId : null;
  const account = {
    id: bindingId,
    workspaceId,
    workspaceInstagramAccountRecordId: accountId,
    unipileAccountId: 'unipile-account',
    instagramUserId: 'instagram-user',
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const accountRepository = { find: jest.fn(async () => [account]) };
  const creator = {
    id: creatorId,
    instagramUsername: 'recipient',
    instagramUrl: null,
    instagramLink: null,
  };
  const chat = {
    chatId: 'chat-id',
    accountId: 'unipile-account',
    type: 'ONE_TO_ONE',
    attendeeProviderId: 'provider-messaging-id',
  };
  const provider = {
    getInstagramMessagingProfile: jest.fn(async () => ({
      username: 'recipient',
      providerId: 'provider-id',
      providerMessagingId: 'provider-messaging-id',
    })),
    listChats: jest.fn(async () => ({
      chats: route === 'REPLY' ? [chat] : [],
      nextCursor: null,
    })),
    getChat: jest.fn(async () => chat),
    startChat: jest.fn(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'ACCEPTED',
        value: { chatId: 'new-chat', messageId: 'sent-message' },
      };
    }),
    sendMessage: jest.fn(async (_input, options) => {
      await options.beforeDispatch();
      return { kind: 'ACCEPTED', value: { messageId: 'sent-message' } };
    }),
  };
  const conversation = () => ({
    id: conversationId,
    providerConversationId: 'chat-id',
    recipientIgsid: 'provider-messaging-id',
    recipientUsername: 'recipient',
    instagramAccountId: accountId,
    creatorId: h.state.linkCommitted ? creatorId : null,
    lifecycle: 'ACTIVE',
    provider: 'UNIPILE',
  });
  const readOrm = {
    executeInWorkspaceContext: async (operation: () => Promise<unknown>) =>
      operation(),
    getRepository: jest.fn(async (_workspace, name, _role) => ({
      find: async () =>
        name === 'creator'
          ? [creator]
          : name === 'myahSocialConversation' && route === 'REPLY'
            ? [conversation()]
            : [],
      findOne: async () =>
        name === 'creator'
          ? creator
          : name === 'myahInstagramReplyDraft'
            ? (h.state.committed[0] ?? null)
            : name === 'myahSocialConversation'
              ? conversation()
              : {
                  id: accountId,
                  label: 'Instagram',
                  status: 'ACTIVE',
                  unipileAccountId: account.unipileAccountId,
                },
    })),
    getGlobalWorkspaceDataSource: async () => ({
      query: async (sql: string) => {
        if (!sql.includes('"_myahInstagramReplyDraft"'))
          return route === 'REPLY' ? [conversation()] : [];
        const row = h.state.committed[0];
        return row
          ? [
              {
                ...row,
                creatorInstagramUsername: 'recipient',
                creatorInstagramUrl: null,
                creatorInstagramLinkPrimaryLinkUrl: null,
                providerConversationId: route === 'REPLY' ? 'chat-id' : null,
                conversationRecipientIgsid:
                  route === 'REPLY' ? 'provider-messaging-id' : null,
                conversationProvider: route === 'REPLY' ? 'UNIPILE' : null,
                conversationLifecycle: route === 'REPLY' ? 'ACTIVE' : null,
                conversationInstagramAccountId:
                  route === 'REPLY' ? accountId : null,
                conversationCreatorId:
                  route === 'REPLY' && h.state.linkCommitted ? creatorId : null,
              },
            ]
          : [];
      },
    }),
  };
  const permission = new InstagramMessagePermissionService({
    hasToolPermission: async () => true,
  } as never);
  const access = new InstagramMessageRecordAccessService(
    readOrm as never,
    accountRepository as never,
  );
  const budget = {
    isTargetAvailable: jest.fn(async () => true),
    reserve: jest.fn(async () => ({
      status: 'RESERVED',
      reservationId: 'reservation',
    })),
    markProviderAttempted: jest.fn(),
    releasePreDispatch: jest.fn(),
    releaseStartTarget: jest.fn(),
    releaseStartTargetForReceipt: jest.fn(),
  };
  const recipient = new InstagramMessageRecipientService(
    readOrm as never,
    access,
    permission,
    budget as never,
    provider as never,
    { upsertVerifiedChat: jest.fn() } as never,
    { findOne: jest.fn() } as never,
  );
  const authority = new InstagramMessageAuthorityReaderService(
    { findOneBy: async () => ({ id: workspaceId }) } as never,
    readOrm as never,
    accountRepository as never,
    { find: async () => composerObjectMetadata } as never,
    provider as never,
  );
  const core = new Map<unknown, Record<string, unknown>[]>([
    [ActionApprovalBindingEntity, []],
    [ActionApprovalBindingEvidenceLinkEntity, []],
    [ActionExecutionReceiptEntity, []],
  ]);
  const matches = (
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ) =>
    Object.entries(where).every(([key, value]) =>
      value instanceof FindOperator
        ? value.type === 'isNull'
          ? row[key] == null
          : value.type === 'in' && value.value.includes(row[key])
        : row[key] === value,
    );
  const manager = {
    create: (_entity: unknown, value: Record<string, unknown>) => value,
    find: jest.fn(async (entity, options) =>
      core
        .get(entity)!
        .filter((row) => matches(row, options.where))
        .sort((left, right) =>
          JSON.stringify([
            left.objectMetadataId,
            left.recordId,
            left.role,
          ]).localeCompare(
            JSON.stringify([
              right.objectMetadataId,
              right.recordId,
              right.role,
            ]),
          ),
        ),
    ),
    findOne: jest.fn(
      async (entity, options) =>
        core.get(entity)!.find((row) => matches(row, options.where)) ?? null,
    ),
    save: jest.fn(
      async (
        entity: unknown,
        value: Record<string, unknown> | Record<string, unknown>[],
      ) => {
        const rows = core.get(entity)!;
        const save = (row: Record<string, unknown>) => {
          const saved = {
            ...row,
            id:
              row.id ??
              `00000000-0000-4000-8000-${String(rows.length + (entity === ActionApprovalBindingEntity ? 100 : entity === ActionExecutionReceiptEntity ? 200 : 300)).padStart(12, '0')}`,
            createdAt: row.createdAt ?? new Date(),
            ...(entity === ActionApprovalBindingEvidenceLinkEntity
              ? {}
              : { updatedAt: new Date() }),
          };
          const prior = rows.findIndex(({ id }) => id === saved.id);
          const persisted =
            entity === ActionApprovalBindingEvidenceLinkEntity
              ? Object.assign(
                  new ActionApprovalBindingEvidenceLinkEntity(),
                  saved,
                )
              : saved;
          if (prior < 0) rows.push(persisted);
          else rows[prior] = persisted;
          return saved;
        };
        return Array.isArray(value) ? value.map(save) : save(value);
      },
    ),
  };
  const approvals = new ActionApprovalService(
    {
      transaction: async (operation: (manager: unknown) => Promise<unknown>) =>
        operation(manager),
      getRepository: (entity: unknown) => ({
        findOne: (options: unknown) => manager.findOne(entity, options),
      }),
    } as never,
    {} as never,
  );
  const projector = {
    projectReceiptWithWriter: jest.fn(() => {
      throw new Error('legacy projection unavailable');
    }),
  };
  const createComposer = () =>
    new InstagramMessageComposerService(
      h.orm as never,
      recipient,
      permission,
      h.locks as never,
      approvals,
      new InstagramMessageSendService(
        approvals,
        authority,
        h.locks as never,
        budget as never,
        provider as never,
        projector as never,
        {} as never,
        permission,
        access,
      ),
    );
  const composer = createComposer();
  const selected = { creatorRecordId: creatorId };
  const preparation = await recipient.resolve(
    { recipient: selected },
    authenticatedContext,
  );
  const selectedInput = {
    ...input,
    recipient: selected,
    expectedPreparationFingerprint: preparation.preparationFingerprint,
  };
  return {
    h,
    core,
    manager,
    approvals,
    budget,
    provider,
    composer,
    selectedInput,
    authority,
    projector,
    createComposer,
  };
};

describe('Instagram composer actual v3 approval/authority/send evidence handoff', () => {
  describe.each(['START_CHAT', 'REPLY'] as const)(
    '%s durable receipt recovery',
    (route) => {
      it.each(['request in flight', 'accepted before persistence'] as const)(
        'retains PROCESSING after process loss with %s, without treating it as a caught provider error',
        async (crashPoint) => {
          const h = await buildComposedSendHarness(route);
          let crashReached!: () => void;
          const reached = new Promise<void>((resolve) => {
            crashReached = resolve;
          });
          const neverReturns = new Promise<never>(() => {});
          const providerWrite =
            route === 'START_CHAT'
              ? h.provider.startChat
              : h.provider.sendMessage;
          const accepted = jest.spyOn(h.approvals, 'recordProviderAccepted');
          const terminal = jest.spyOn(
            h.approvals,
            'recordProviderTerminalState',
          );
          if (crashPoint === 'request in flight') {
            providerWrite.mockImplementationOnce(async (_input, options) => {
              await options.beforeDispatch();
              // Transport request has started, but the process loses its continuation.
              crashReached();
              return neverReturns;
            });
          } else {
            accepted.mockImplementationOnce(() => {
              // The provider returned acceptance, but no outcome write has begun.
              crashReached();
              return neverReturns;
            });
          }
          // Do not throw: that would run the sender catch and persist UNKNOWN,
          // rather than model a terminated process leaving durable PROCESSING.
          const oldProcess = h.composer.send(
            h.selectedInput,
            authenticatedContext,
          );
          let oldProcessSettled = false;
          void oldProcess.then(
            () => {
              oldProcessSettled = true;
            },
            () => {
              oldProcessSettled = true;
            },
          );
          await reached;
          expect(oldProcessSettled).toBe(false);
          expect(h.core.get(ActionExecutionReceiptEntity)).toEqual([
            expect.objectContaining({ state: 'PROCESSING' }),
          ]);
          expect(h.budget.reserve).toHaveBeenCalledTimes(1);
          expect(h.budget.markProviderAttempted).toHaveBeenCalledTimes(1);
          expect(providerWrite).toHaveBeenCalledTimes(1);
          expect(accepted).toHaveBeenCalledTimes(
            crashPoint === 'accepted before persistence' ? 1 : 0,
          );
          expect(terminal).not.toHaveBeenCalled();
          const durableCore = structuredClone([...h.core.values()]);
          const durableDrafts = structuredClone(h.h.state.committed);
          const mutations = [
            h.manager.save,
            jest.spyOn(h.approvals, 'createApprovedInstagramMessageBinding'),
            jest.spyOn(h.approvals, 'reserveExecutionForBinding'),
            accepted,
            terminal,
            h.h.creatorRepository.insert,
            h.h.draftRepository.insert,
            h.budget.reserve,
            h.budget.markProviderAttempted,
            ...Object.values(h.provider),
            jest.spyOn(h.authority, 'rebuildExecutionAuthority'),
            jest.spyOn(h.authority, 'assertReadyAfterReservation'),
          ];
          const counts = mutations.map((mock) => mock.mock.calls.length);
          // A replacement sender/composer sees only persisted state. The old
          // continuation is never resumed; locks and storage remain fixture seams.
          const restarted = h.createComposer();
          for (let repeat = 0; repeat < 3; repeat++) {
            await expect(
              restarted.send(h.selectedInput, authenticatedContext),
            ).rejects.toThrow('Instagram message execution is pending');
            expect([...h.core.values()]).toEqual(durableCore);
            expect(h.h.state.committed).toEqual(durableDrafts);
            expect(mutations.map((mock) => mock.mock.calls.length)).toEqual(
              counts,
            );
            expect(h.budget.releasePreDispatch).not.toHaveBeenCalled();
            expect(h.budget.releaseStartTarget).not.toHaveBeenCalled();
            expect(
              h.budget.releaseStartTargetForReceipt,
            ).not.toHaveBeenCalled();
            expect(h.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
            expect(oldProcessSettled).toBe(false);
          }
        },
      );

      it('persists and recovers UNKNOWN for an ordinary caught post-marker transport error', async () => {
        const h = await buildComposedSendHarness(route);
        const providerWrite =
          route === 'START_CHAT'
            ? h.provider.startChat
            : h.provider.sendMessage;
        providerWrite.mockImplementationOnce(async (_input, options) => {
          await options.beforeDispatch();
          throw new Error('transport response lost');
        });
        await expect(
          h.composer.send(h.selectedInput, authenticatedContext),
        ).resolves.toMatchObject({ status: 'UNKNOWN' });
        const stored = structuredClone([...h.core.values()]);
        expect(h.core.get(ActionExecutionReceiptEntity)).toEqual([
          expect.objectContaining({ state: 'UNKNOWN' }),
        ]);
        const saveCount = h.manager.save.mock.calls.length;
        const restarted = h.createComposer();
        for (let repeat = 0; repeat < 3; repeat++) {
          await expect(
            restarted.send(h.selectedInput, authenticatedContext),
          ).resolves.toMatchObject({ status: 'UNKNOWN' });
          expect([...h.core.values()]).toEqual(stored);
          expect(h.manager.save).toHaveBeenCalledTimes(saveCount);
          expect(providerWrite).toHaveBeenCalledTimes(1);
          expect(h.budget.reserve).toHaveBeenCalledTimes(1);
          expect(h.budget.markProviderAttempted).toHaveBeenCalledTimes(1);
          expect(h.budget.releasePreDispatch).not.toHaveBeenCalled();
          expect(h.budget.releaseStartTarget).not.toHaveBeenCalled();
          expect(h.budget.releaseStartTargetForReceipt).not.toHaveBeenCalled();
          expect(h.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
        }
      });
    },
  );

  it.each(['START_CHAT', 'REPLY'] as const)(
    'dispatches actual %s composer evidence through the real approval and authority services, then recovers unchanged input without resend',
    async (route) => {
      const h = await buildComposedSendHarness(route);
      await expect(
        h.composer.send(h.selectedInput, authenticatedContext),
      ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
      if (route === 'START_CHAT')
        expect(h.provider.startChat).toHaveBeenCalledWith(
          {
            accountId: 'unipile-account',
            attendeeId: 'provider-messaging-id',
            text: 'hello',
          },
          expect.any(Object),
        );
      else
        expect(h.provider.sendMessage).toHaveBeenCalledWith(
          { accountId: 'unipile-account', chatId: 'chat-id', text: 'hello' },
          expect.any(Object),
        );
      const links = h.core.get(ActionApprovalBindingEvidenceLinkEntity)!;
      expect(links.map(({ role }) => role)).toEqual([
        'INSTAGRAM_ACCOUNT',
        'INSTAGRAM_MESSAGE_DRAFT',
        ...(route === 'REPLY' ? ['SOCIAL_CONVERSATION'] : []),
        'CREATOR',
      ]);
      expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(1);
      expect(h.core.get(ActionExecutionReceiptEntity)).toEqual([
        expect.objectContaining({
          state: 'PROVIDER_ACCEPTED',
          providerExternalMessageId: 'sent-message',
        }),
      ]);
      jest.mocked(getWorkspaceContext).mockImplementation(() => {
        throw new Error('metadata removed after acceptance');
      });
      h.provider.getInstagramMessagingProfile.mockRejectedValue(
        new Error('recipient changed after acceptance'),
      );
      await expect(
        h.composer.send(h.selectedInput, authenticatedContext),
      ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
      expect(h.provider.startChat).toHaveBeenCalledTimes(
        route === 'START_CHAT' ? 1 : 0,
      );
      expect(h.provider.sendMessage).toHaveBeenCalledTimes(
        route === 'REPLY' ? 1 : 0,
      );
      expect(h.budget.reserve).toHaveBeenCalledTimes(1);
      expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(1);
    },
  );

  describe.each(['START_CHAT', 'REPLY'] as const)('%s recovery', (route) => {
    it.each([
      'unchanged',
      'reordered-bookkeeping',
      'objectMetadataId',
      'recordId',
      'role',
      'missing',
      'missing-value',
      'extra',
      'duplicate',
      'unknown-authority',
      'null-relation',
      'loaded-relation',
      'wrong-owner',
      'undefined-owner',
      'null-owner',
      'historical-empty',
    ] as const)(
      'handles receiptless %s evidence without replacing an existing approval',
      async (evidence) => {
        const h = await buildComposedSendHarness(route);
        const rebuild = jest
          .spyOn(h.authority, 'rebuildExecutionAuthority')
          .mockRejectedValueOnce(new Error('crash after approval'));
        await expect(
          h.composer.send(h.selectedInput, authenticatedContext),
        ).rejects.toThrow('crash after approval');
        rebuild.mockRestore();
        const links = h.core.get(ActionApprovalBindingEvidenceLinkEntity)!;
        if (
          evidence === 'objectMetadataId' ||
          evidence === 'recordId' ||
          evidence === 'role'
        )
          links[0][evidence] = 'changed-authority';
        if (evidence === 'missing') links.pop();
        if (evidence === 'missing-value') delete links[0].role;
        if (evidence === 'extra')
          links.push({ ...links[0], role: 'EXTRA', id: 'extra-row' });
        if (evidence === 'duplicate')
          links.push({ ...links[0], id: 'duplicate-row' });
        if (evidence === 'unknown-authority')
          links[0].unexpectedAuthority = 'must-not-be-ignored';
        if (evidence === 'null-relation') links[0].actionApprovalBinding = null;
        if (evidence === 'loaded-relation')
          links[0].actionApprovalBinding = {
            id: links[0].actionApprovalBindingId,
          };
        if (
          evidence === 'wrong-owner' ||
          evidence === 'undefined-owner' ||
          evidence === 'null-owner'
        ) {
          links[0].actionApprovalBindingId =
            evidence === 'wrong-owner'
              ? 'wrong-binding'
              : evidence === 'null-owner'
                ? null
                : undefined;
          // Even a broken repository adapter cannot bypass independent owning-FK validation.
          h.manager.find.mockResolvedValue(links);
        }
        if (evidence === 'historical-empty') links.splice(0);
        if (evidence === 'reordered-bookkeeping') {
          links.forEach((link, index) => {
            link.id = `replacement-row-${index}`;
            link.createdAt = new Date('2026-01-01');
          });
          const find = h.manager.find.getMockImplementation()!;
          h.manager.find.mockImplementation(async (...args) =>
            (await find(...args)).reverse(),
          );
        }
        if (evidence === 'unchanged' || evidence === 'reordered-bookkeeping')
          await expect(
            h.composer.send(h.selectedInput, authenticatedContext),
          ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
        else {
          await expect(
            h.composer.send(h.selectedInput, authenticatedContext),
          ).rejects.toThrow('Instagram composer context changed');
          expect(h.budget.reserve).not.toHaveBeenCalled();
          expect(h.core.get(ActionExecutionReceiptEntity)).toHaveLength(0);
          expect(h.provider.startChat).not.toHaveBeenCalled();
          expect(h.provider.sendMessage).not.toHaveBeenCalled();
        }
        expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(1);
      },
    );

    it('recovers an authorized old empty-evidence accepted receipt without metadata or evidence backfill', async () => {
      const h = await buildComposedSendHarness(route);
      await h.composer.send(h.selectedInput, authenticatedContext);
      h.core.get(ActionApprovalBindingEvidenceLinkEntity)!.splice(0);
      jest.mocked(getWorkspaceContext).mockImplementation(() => {
        throw new Error('app removed');
      });
      await expect(
        h.composer.send(h.selectedInput, authenticatedContext),
      ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
      expect(h.core.get(ActionApprovalBindingEvidenceLinkEntity)).toHaveLength(
        0,
      );
      expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(1);
      expect(h.budget.reserve).toHaveBeenCalledTimes(1);
      expect(h.provider.startChat).toHaveBeenCalledTimes(
        route === 'START_CHAT' ? 1 : 0,
      );
      expect(h.provider.sendMessage).toHaveBeenCalledTimes(
        route === 'REPLY' ? 1 : 0,
      );
    });
  });
});

it('resumes an owned draft-only composer attempt with its first complete approval, never treating it as empty-evidence repair', async () => {
  const h = await buildComposedSendHarness('START_CHAT');
  const create = jest
    .spyOn(h.approvals, 'createApprovedInstagramMessageBinding')
    .mockRejectedValueOnce(new Error('crash before approval'));
  await expect(
    h.composer.send(h.selectedInput, authenticatedContext),
  ).rejects.toThrow('crash before approval');
  expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(0);
  expect(h.h.state.committed).toHaveLength(1);
  await expect(
    h.composer.send(h.selectedInput, authenticatedContext),
  ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
  expect(create).toHaveBeenCalledTimes(2);
  expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(1);
  expect(h.core.get(ActionApprovalBindingEvidenceLinkEntity)).toHaveLength(3);
  expect(h.provider.startChat).toHaveBeenCalledTimes(1);
});

it.each([
  'wrong-workspace',
  'missing-Creator-metadata',
  'inactive-Creator-metadata',
] as const)(
  'fails closed before fresh approval when canonical composer evidence has %s',
  async (fault) => {
    const h = await buildComposedSendHarness('START_CHAT');
    const context = structuredClone(getWorkspaceContext());
    const creatorUid = '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
    if (fault === 'wrong-workspace')
      context.authContext.workspace.id = 'other-workspace';
    if (fault === 'missing-Creator-metadata')
      delete context.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid];
    if (fault === 'inactive-Creator-metadata')
      context.flatObjectMetadataMaps.byUniversalIdentifier[
        creatorUid
      ]!.isActive = false;
    jest.mocked(getWorkspaceContext).mockReturnValue(context);
    await expect(
      h.composer.send(h.selectedInput, authenticatedContext),
    ).rejects.toThrow('Instagram message evidence metadata is unavailable');
    expect(h.core.get(ActionApprovalBindingEntity)).toHaveLength(0);
    expect(h.budget.reserve).not.toHaveBeenCalled();
    expect(h.provider.startChat).not.toHaveBeenCalled();
  },
);
