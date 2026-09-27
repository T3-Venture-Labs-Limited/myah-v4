import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  MyahInboxEmailCardInput,
  MyahInboxEmailCardMessagesInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-email-read.input';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxContactResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-contact.resolver';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MyahInboxContactLinkService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-link.service';
import { MyahInboxContactQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-query.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspace = { id: 'workspace-id' };
const workspaceMemberId = 'workspace-member-id';
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: 'user-workspace-id',
  user: { id: 'user-id' },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

const buildResolver = () => {
  const listContacts = jest.fn().mockResolvedValue({
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  });
  const getContact = jest.fn().mockResolvedValue({ id: 'opaque-contact' });
  const listMessages = jest.fn().mockResolvedValue({
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  });
  const linkContact = jest.fn().mockResolvedValue('result-contact-id');

  return {
    getContact,
    linkContact,
    listContacts,
    listMessages,
    resolver: new MyahInboxContactResolver(
      { listContacts, getContact } as never,
      { listMessages } as never,
      { linkContact } as never,
      {} as never,
      {} as never,
      { assertWrite: jest.fn() } as never,
    ),
  };
};

describe('MyahInboxContactResolver', () => {
  it.each([
    ['myahInboxContactEmailCards', 'listCards'],
    ['myahInboxContactEmailCard', 'readCard'],
    ['myahInboxContactEmailCardMessages', 'listCardMessages'],
    ['myahInboxContactEmailMessageLocation', 'locateMessage'],
  ] as const)(
    'wires %s to its exact bounded reader and rejects workspace mismatch',
    async (operation, reader) => {
      const dispatch = jest
        .fn()
        .mockResolvedValue({ snapshot: 'bounded-result' });
      const resolver = new MyahInboxContactResolver(
        {} as never,
        { [reader]: dispatch } as never,
        {} as never,
        {} as never,
        {} as never,
        { assertWrite: jest.fn() } as never,
      );
      const input = {
        contactId: 'contact',
        threadId: 'thread',
        messageId: 'message',
        snapshot: 'snapshot',
        expectedWorkspaceId: workspace.id,
      };
      await expect(
        (async () =>
          resolver[operation](
            input as never,
            workspace as never,
            workspaceMemberId,
          ))(),
      ).resolves.toEqual({ snapshot: 'bounded-result' });
      expect(dispatch).toHaveBeenCalledWith({
        ...input,
        workspace,
        workspaceMemberId,
        authContext: userAuthContext,
        user: userAuthContext.user,
      });
      dispatch.mockClear();
      await expect(
        (async () =>
          resolver[operation](
            { ...input, expectedWorkspaceId: 'other' } as never,
            workspace as never,
            workspaceMemberId,
          ))(),
      ).rejects.toThrow('Inbox workspace changed');
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
  beforeEach(() => {
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);
  });

  it.each([MyahInboxEmailCardInput, MyahInboxEmailCardMessagesInput])(
    'keeps %p valid without a key and validates the optional keyed form',
    (Input) => {
      const values = {
        contactId: 'opaque-contact',
        expectedWorkspaceId: '00000000-0000-4000-8000-000000000001',
        threadId: '00000000-0000-4000-8000-000000000002',
        ...(Input === MyahInboxEmailCardMessagesInput
          ? { snapshot: 'snapshot' }
          : {}),
      };
      expect(validateSync(Object.assign(new Input(), values))).toEqual([]);
      expect(
        validateSync(
          Object.assign(new Input(), {
            ...values,
            anchorKey: 'attempt:00000000-0000-4000-8000-000000000003',
          }),
        ),
      ).toEqual([]);
      expect(
        validateSync(
          Object.assign(new Input(), {
            ...values,
            anchorKey: 'x'.repeat(129),
          }),
        ),
      ).not.toEqual([]);
    },
  );

  it.each([
    ['myahInboxContactEmailCard', 'readCard'],
    ['myahInboxContactEmailCardMessages', 'listCardMessages'],
  ] as const)(
    'forwards a supplied group key to %s without reinterpretation',
    async (operation, reader) => {
      const dispatch = jest.fn().mockResolvedValue({ card: null });
      const resolver = new MyahInboxContactResolver(
        {} as never,
        { [reader]: dispatch } as never,
        {} as never,
        {} as never,
        {} as never,
        { assertWrite: jest.fn() } as never,
      );
      const input = {
        contactId: 'opaque-contact',
        expectedWorkspaceId: workspace.id,
        threadId: '00000000-0000-4000-8000-000000000002',
        anchorKey: 'attempt:00000000-0000-4000-8000-000000000003',
        snapshot: 'snapshot',
      };
      await resolver[operation](
        input as never,
        workspace as never,
        workspaceMemberId,
      );
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ anchorKey: input.anchorKey }),
      );
    },
  );

  it('forwards Contact list and Email timeline requests with exact authenticated context', async () => {
    const harness = buildResolver();

    await harness.resolver.myahInboxContacts(
      { first: 25, search: 'creator' },
      workspace as never,
      workspaceMemberId,
    );
    await harness.resolver.myahInboxContact(
      'opaque-contact',
      workspace as never,
      workspaceMemberId,
    );
    await harness.resolver.myahInboxContactEmailMessages(
      { contactId: 'opaque-contact', first: 50 },
      workspace as never,
      workspaceMemberId,
    );

    expect(harness.listContacts).toHaveBeenCalledWith({
      first: 25,
      search: 'creator',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
    expect(harness.getContact).toHaveBeenCalledWith({
      contactId: 'opaque-contact',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
    expect(harness.listMessages).toHaveBeenCalledWith({
      contactId: 'opaque-contact',
      first: 50,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('forwards exact source linkage and returns the resulting opaque Contact ID', async () => {
    const harness = buildResolver();

    await expect(
      harness.resolver.linkMyahInboxContactCreator(
        { contactId: 'source-contact-id', creatorId: 'creator-id' },
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toBe('result-contact-id');
    expect(harness.linkContact).toHaveBeenCalledWith({
      contactId: 'source-contact-id',
      creatorId: 'creator-id',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('normalizes Date-shaped tuple results before returning a GraphQL String or conflict payload', async () => {
    const triageDate = new Date('2026-09-15T10:00:00.000Z');
    const localWorkspace = { id: '00000000-0000-4000-8000-000000000001' };
    const contactId = encodeMyahInboxContactId({
      workspaceId: localWorkspace.id,
      identity: {
        kind: 'creator',
        recordId: '00000000-0000-4000-8000-000000000002',
      },
    });
    let updateAttempts = 0;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "myahInboxTriageMigration"')) {
        return [{ status: 'READY' }];
      }
      if (sql.includes('UPDATE "myahInboxContactTriage"')) {
        updateAttempts += 1;
        return updateAttempts === 1
          ? [
              {
                inboxOwnerId: null,
                inboxState: 'SNOOZED',
                snoozedUntil: triageDate,
                revision: 2,
                identityGeneration: '1',
              },
            ]
          : [];
      }
      if (sql.includes('FROM "myahInboxContactTriage"')) {
        return [
          {
            inboxOwnerId: null,
            inboxState: 'SNOOZED',
            snoozedUntil: triageDate,
            revision: 2,
            identityGeneration: '1',
          },
        ];
      }
      return [];
    });
    const manager = {
      internalContext: { workspaceId: localWorkspace.id },
      queryRunner: { query },
    };
    const resolver = new MyahInboxContactResolver(
      { getContact: jest.fn().mockResolvedValue({ id: contactId }) } as never,
      {} as never,
      {} as never,
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => ({
          transaction: async (
            callback: (transactionManager: unknown) => unknown,
          ) => callback(manager),
        }),
      } as never,
      new MyahInboxContactTriageService(),
      { assertWrite: jest.fn() } as never,
    );
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      ...userAuthContext,
      workspace: localWorkspace,
    } as never);
    const input = {
      expectedWorkspaceId: localWorkspace.id,
      contactId,
      expectedRevision: 1,
      expectedIdentityGeneration: '1',
      inboxOwnerId: null,
      snoozedUntil: null,
    };

    await expect(
      resolver.updateMyahInboxContactTriage(
        input,
        localWorkspace as never,
        workspaceMemberId,
      ),
    ).resolves.toMatchObject({
      snoozedUntil: '2026-09-15T10:00:00.000Z',
    });
    await expect(
      resolver.updateMyahInboxContactTriage(
        input,
        localWorkspace as never,
        workspaceMemberId,
      ),
    ).rejects.toMatchObject({
      extensions: {
        triage: {
          snoozedUntil: '2026-09-15T10:00:00.000Z',
        },
      },
    });
    expect(query).toHaveBeenCalledWith(
      'LOCK TABLE core."messageChannel", core."connectedAccount" IN SHARE MODE',
    );
    expect(query).toHaveBeenCalledWith(
      'LOCK TABLE "messageChannelMessageAssociation" IN SHARE MODE',
    );
  });

  it('rejects a stale source contact before permission fences without initializing a Creator tuple', async () => {
    const localWorkspace = { id: '00000000-0000-4000-8000-000000000001' };
    const sourceId = '00000000-0000-4000-8000-000000000002';
    const contactId = encodeMyahInboxContactId({
      workspaceId: localWorkspace.id,
      identity: { kind: 'email-thread', recordId: sourceId },
    });
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "myahInboxTriageMigration"')) {
        return [{ status: 'READY' }];
      }
      return [];
    });
    const prepareUnmatchedSourceContactInTransaction = jest
      .fn()
      .mockResolvedValue(null);
    const getContact = jest.fn();
    const resolver = new MyahInboxContactResolver(
      { getContact } as never,
      {} as never,
      {} as never,
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => ({
          transaction: async (
            callback: (transactionManager: unknown) => unknown,
          ) =>
            callback({
              internalContext: { workspaceId: localWorkspace.id },
              queryRunner: { query },
            }),
        }),
      } as never,
      {
        prepareUnmatchedSourceContactInTransaction,
        ensureSourceContactInTransaction: jest.fn(),
      } as never,
      { assertWrite: jest.fn() } as never,
    );
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      ...userAuthContext,
      workspace: localWorkspace,
    } as never);

    await expect(
      resolver.updateMyahInboxContactTriage(
        {
          expectedWorkspaceId: localWorkspace.id,
          contactId,
          expectedRevision: 1,
          expectedIdentityGeneration: '1',
          inboxState: 'CLOSED' as never,
        },
        localWorkspace as never,
        workspaceMemberId,
      ),
    ).rejects.toThrow('Inbox contact source is not readable');

    expect(prepareUnmatchedSourceContactInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'EMAIL_THREAD',
        sourceRecordId: sourceId,
      }),
    );
    expect(getContact).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('LOCK TABLE "messageChannelMessageAssociation"'),
      ),
    ).toBe(false);
  });

  it('rejects unavailable triage before resolving a selected contact', async () => {
    const localWorkspace = { id: '00000000-0000-4000-8000-000000000001' };
    const contactId = encodeMyahInboxContactId({
      workspaceId: localWorkspace.id,
      identity: {
        kind: 'creator',
        recordId: '00000000-0000-4000-8000-000000000002',
      },
    });
    const getContact = jest.fn();
    const resolver = new MyahInboxContactResolver(
      { getContact } as never,
      {} as never,
      {} as never,
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
      } as never,
      {} as never,
      {
        assertWrite: jest
          .fn()
          .mockRejectedValue(
            new ForbiddenException(
              'Triage is unavailable with your current Inbox access',
            ),
          ),
      } as never,
    );
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      ...userAuthContext,
      workspace: localWorkspace,
    } as never);

    await expect(
      resolver.updateMyahInboxContactTriage(
        {
          expectedWorkspaceId: localWorkspace.id,
          contactId,
          expectedRevision: 1,
          expectedIdentityGeneration: '1',
          inboxOwnerId: null,
        },
        localWorkspace as never,
        workspaceMemberId,
      ),
    ).rejects.toMatchObject({
      message: 'Triage is unavailable with your current Inbox access',
      status: 403,
    });
    expect(getContact).not.toHaveBeenCalled();
  });

  it('does not mutate the canonical tuple before the migration marker is READY', async () => {
    const localWorkspace = { id: '00000000-0000-4000-8000-000000000001' };
    const contactId = encodeMyahInboxContactId({
      workspaceId: localWorkspace.id,
      identity: {
        kind: 'creator',
        recordId: '00000000-0000-4000-8000-000000000002',
      },
    });
    const query = jest.fn(async (sql: string) =>
      sql.includes('FROM "myahInboxTriageMigration"')
        ? [{ status: 'MIGRATING' }]
        : [],
    );
    const resolver = new MyahInboxContactResolver(
      { getContact: jest.fn().mockResolvedValue({ id: contactId }) } as never,
      {} as never,
      {} as never,
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => ({
          transaction: async (callback: (manager: unknown) => unknown) =>
            callback({
              internalContext: { workspaceId: localWorkspace.id },
              queryRunner: { query },
            }),
        }),
      } as never,
      new MyahInboxContactTriageService(),
      { assertWrite: jest.fn() } as never,
    );

    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      ...userAuthContext,
      workspace: localWorkspace,
    } as never);
    await expect(
      resolver.updateMyahInboxContactTriage(
        {
          expectedWorkspaceId: localWorkspace.id,
          contactId,
          expectedRevision: 1,
          expectedIdentityGeneration: '1',
          inboxOwnerId: null,
        },
        localWorkspace as never,
        workspaceMemberId,
      ),
    ).rejects.toEqual(expect.any(ForbiddenException));
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "myahInboxContactTriage"'),
      expect.anything(),
    );
  });

  it.each([
    ['an empty patch', {}],
    ['a snoozed state without a deadline', { inboxState: 'SNOOZED' }],
    [
      'a deadline without a snoozed state',
      { snoozedUntil: '2099-01-01T00:00:00.000Z' },
    ],
    [
      'a non-future snooze deadline',
      {
        inboxState: 'SNOOZED',
        snoozedUntil: '2020-01-01T00:00:00.000Z',
      },
    ],
    [
      'an overflowing identity generation',
      { expectedIdentityGeneration: '9223372036854775808' },
    ],
  ])(
    'rejects %s at the mutation boundary before opening a transaction',
    async (_case, patch) => {
      const localWorkspace = { id: '00000000-0000-4000-8000-000000000001' };
      const contactId = encodeMyahInboxContactId({
        workspaceId: localWorkspace.id,
        identity: {
          kind: 'creator',
          recordId: '00000000-0000-4000-8000-000000000002',
        },
      });
      const executeInWorkspaceContext = jest.fn();
      const resolver = new MyahInboxContactResolver(
        {} as never,
        {} as never,
        {} as never,
        { executeInWorkspaceContext } as never,
        {} as never,
        {} as never,
      );
      jest.mocked(getWorkspaceAuthContext).mockReturnValue({
        ...userAuthContext,
        workspace: localWorkspace,
      } as never);

      await expect(
        resolver.updateMyahInboxContactTriage(
          {
            expectedWorkspaceId: localWorkspace.id,
            contactId,
            expectedRevision: 1,
            expectedIdentityGeneration: '1',
            ...patch,
          } as never,
          localWorkspace as never,
          workspaceMemberId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(executeInWorkspaceContext).not.toHaveBeenCalled();
    },
  );

  it('requires all Inbox guards and registers every Contact provider', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MyahInboxContactResolver),
    ).toEqual([WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard]);
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        MyahInboxContactResolver,
        MyahInboxContactQueryService,
        MyahInboxContactEmailQueryService,
        MyahInboxContactLinkService,
      ]),
    );
  });
});
