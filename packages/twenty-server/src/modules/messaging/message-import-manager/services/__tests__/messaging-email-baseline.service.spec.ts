import {
  ConnectedAccountProvider,
  MessageFolderImportPolicy,
} from 'twenty-shared/types';
import { MessagingEmailBaselineService } from 'src/modules/messaging/message-import-manager/services/messaging-email-baseline.service';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';

const channel = {
  id: 'channel-id',
  connectedAccountId: 'account-id',
  connectedAccount: { provider: ConnectedAccountProvider.GOOGLE },
  messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
  messageFolders: [],
} as unknown as MessageChannelEntity;
const workspaceId = 'workspace-id';
const workspaceTransaction = (query: jest.Mock) => ({
  query: () => {
    throw new Error('WorkspaceEntityManager.query must not be used');
  },
  queryRunner: { query, isTransactionActive: true, isReleased: false },
});
const list = (ids: string[], cursor = 'history-1') => [
  {
    messageExternalIds: ids,
    initialFrontierVerified: true,
    messageExternalIdsToDelete: [],
    nextSyncCursor: cursor,
    previousSyncCursor: '',
    folderId: undefined,
  },
];

describe('Gmail prospective baseline', () => {
  let service: MessagingEmailBaselineService;
  let generations: Array<{
    id: string;
    status: string;
    isCurrent: boolean;
    scopeFingerprint: string;
    connectedAccountId: string;
    accountIncarnationId: string;
    completedAt?: Date;
  }>;
  let items: Map<string, Map<string, string>>;
  let query: jest.Mock;
  let incarnation: string;
  beforeEach(() => {
    incarnation = 'incarnation-1';
    generations = [];
    items = new Map();
    query = jest.fn(async (sql: string, args: unknown[] = []) => {
      if (sql.includes('to_regclass'))
        return [{ name: 'campaignEmailBaselineGeneration' }];
      if (sql.includes('pg_attribute')) return [{ available: true }];
      if (sql.includes('FROM core."connectedAccount"'))
        return [{ campaignEmailIncarnationId: incarnation }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('INSERT INTO core."campaignEmailBaselineGeneration"')) {
        const id = `generation-${generations.length + 1}`;
        generations.push({
          id,
          status: 'ENUMERATED',
          isCurrent: true,
          scopeFingerprint: args[3] as string,
          connectedAccountId: args[2] as string,
          accountIncarnationId: args[5] as string,
        });
        return [{ id }];
      }
      if (sql.includes('INSERT INTO core."campaignEmailBaselineItem"')) {
        items.set(
          args[0] as string,
          new Map((args[1] as string[]).map((id) => [id, 'LISTED'])),
        );
        return [];
      }
      if (sql.includes('UPDATE core."campaignEmailBaselineItem"')) {
        const item = items.get(args[0] as string);
        if (item?.get(args[1] as string) === 'LISTED')
          item.set(args[1] as string, args[2] as string);
        return [];
      }
      if (
        sql.includes(
          'UPDATE core."campaignEmailBaselineGeneration" SET "status" = \'INVALID\'',
        )
      ) {
        const row = generations.find((row) => row.id === args[0]);
        if (row) {
          row.status = 'INVALID';
          row.isCurrent = false;
        }
        return [];
      }
      if (
        sql.includes(
          'UPDATE core."campaignEmailBaselineGeneration" g SET "status" = \'READY\'',
        )
      ) {
        const row = generations.find(
          (row) =>
            row.id === args[0] &&
            row.isCurrent &&
            row.status === 'ENUMERATED' &&
            row.accountIncarnationId === args[4],
        );
        if (
          !row ||
          [...(items.get(row.id)?.values() ?? [])].some(
            (value) => value === 'FAILED' || value === 'LISTED',
          )
        )
          return [[], 0]; // TypeORM PostgreSQL UPDATE ... RETURNING shape
        row.status = 'READY';
        row.completedAt = new Date('2026-09-27T12:00:00Z');
        return [[{ id: row.id }], 1];
      }
      if (
        sql.includes(
          'SELECT "id", "status", "scopeFingerprint", "connectedAccountId"',
        )
      )
        return generations.filter((row) => row.isCurrent);
      if (sql.includes('SELECT "scopeFingerprint", "status"'))
        return generations.filter((row) => row.isCurrent);
      if (
        sql.includes(
          'SELECT "id", "completedAt", "scopeFingerprint" FROM core."campaignEmailBaselineGeneration"',
        )
      )
        return generations.filter(
          (row) =>
            row.id === args[0] &&
            row.isCurrent &&
            row.status === 'READY' &&
            row.accountIncarnationId === args[4],
        );
      if (
        sql.includes('SELECT "id" FROM core."campaignEmailBaselineGeneration"')
      )
        return generations.filter(
          (row) =>
            row.id === args[0] && row.isCurrent && row.status === 'ENUMERATED',
        );
      if (sql.includes('SELECT g."id", g."completedAt"'))
        return generations.filter(
          (row) =>
            row.isCurrent &&
            row.status === 'READY' &&
            row.accountIncarnationId === incarnation,
        );
      if (sql.includes('FROM core."messageChannel"'))
        return [
          {
            connectedAccountId: 'account-id',
            messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
          },
        ];
      if (sql.includes('FROM core."messageFolder"')) return [];
      if (sql.includes('SELECT "providerMessageId"'))
        return [...(items.get(args[0] as string)?.keys() ?? [])]
          .filter((id) => (args[1] as string[]).includes(id))
          .map((providerMessageId) => ({ providerMessageId }));
      throw new Error(`Unexpected baseline SQL: ${sql}`);
    });
    const manager = {
      query,
      transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback(manager),
    };
    service = new MessagingEmailBaselineService({
      getGlobalWorkspaceDataSource: jest.fn(async () => ({
        coreDataSource: { manager, isInitialized: true },
      })),
    } as never);
  });

  it('fails closed on empty/filtered-out scan and unsupported connector, including existing synced channels', async () => {
    expect(await service.needsInitialScan(channel, [], workspaceId)).toBe(true);
    expect(
      await service.recordEnumeration(channel, [], workspaceId, list([])),
    ).toBeNull();
    expect(
      await service.recordEnumeration(channel, [], workspaceId, []),
    ).toBeNull();
    expect(
      await service.recordEnumeration(
        channel,
        [],
        workspaceId,
        list(['old'], ''),
      ),
    ).toBeNull();
    expect(generations).toHaveLength(0);
    expect(
      await service.classifyNewIds(workspaceId, channel, ['old']),
    ).toBeNull();
    const microsoft = {
      ...channel,
      connectedAccount: { provider: ConnectedAccountProvider.MICROSOFT },
    } as MessageChannelEntity;
    expect(await service.needsInitialScan(microsoft, [], workspaceId)).toBe(
      false,
    );
    expect(
      await service.recordEnumeration(
        microsoft,
        [],
        workspaceId,
        list(['old']),
      ),
    ).toBeNull();
  });

  it('retains LISTED until canonical dispositions; FAILED or missing items never finalize, retry re-enumerates', async () => {
    const first = await service.recordEnumeration(
      channel,
      [],
      workspaceId,
      list(['old', 'filtered', 'missing', 'old']),
      incarnation,
    );
    expect(first).toBe('generation-1');
    expect(items.get(first!)?.size).toBe(3);
    expect(await service.finalize(workspaceId, channel, first)).toBe(false);
    const tx = workspaceTransaction(query) as never;
    await service.recordDispositionsInTransaction(tx, {
      generationId: first!,
      workspaceId,
      messageChannelId: channel.id,
      connectedAccountId: channel.connectedAccountId,
      listedIds: ['old', 'filtered', 'missing'],
      importedIds: ['old'],
      excludedIds: ['filtered'],
    });
    expect([...items.get(first!)!.entries()]).toEqual([
      ['old', 'IMPORTED'],
      ['filtered', 'EXCLUDED'],
      ['missing', 'FAILED'],
    ]);
    expect(await service.finalize(workspaceId, channel, first)).toBe(false);
    expect(await service.needsInitialScan(channel, [], workspaceId)).toBe(true);
    const restarted = await service.recordEnumeration(
      channel,
      [],
      workspaceId,
      list(['old', 'filtered']),
      incarnation,
    );
    expect(restarted).toBe('generation-2');
    expect(generations[0]).toMatchObject({
      status: 'INVALID',
      isCurrent: false,
    });
    await service.recordDispositionsInTransaction(tx, {
      generationId: first!,
      workspaceId,
      messageChannelId: channel.id,
      connectedAccountId: channel.connectedAccountId,
      listedIds: ['old'],
      importedIds: ['old'],
      excludedIds: [],
    });
    expect(items.get(first!)?.get('old')).toBe('IMPORTED');
    await service.recordDispositionsInTransaction(tx, {
      generationId: restarted!,
      workspaceId,
      messageChannelId: channel.id,
      connectedAccountId: channel.connectedAccountId,
      listedIds: ['old', 'filtered'],
      importedIds: ['old'],
      excludedIds: ['filtered'],
    });
    expect(await service.finalize(workspaceId, channel, restarted)).toBe(true);
    expect(await service.finalize(workspaceId, channel, restarted)).toBe(false);
    expect(await service.needsInitialScan(channel, [], workspaceId)).toBe(
      false,
    );
    const classified = await service.classifyNewIds(workspaceId, channel, [
      'old',
      'filtered',
      'post-baseline',
    ]);
    expect([...classified!.ids]).toEqual(['post-baseline']);
    expect([
      ...(await service.verifyLiveInTransaction(
        tx,
        workspaceId,
        channel,
        restarted!,
        ['old', 'post-baseline'],
      )),
    ]).toEqual(['post-baseline']);
    expect([
      ...(await service.verifyLiveInTransaction(
        tx,
        workspaceId,
        {
          ...channel,
          connectedAccountId: 'different-account-id',
        } as MessageChannelEntity,
        restarted!,
        ['post-baseline'],
      )),
    ]).toEqual([]);
    generations[1].status = 'INVALID';
    generations[1].isCurrent = false;
    expect([
      ...(await service.verifyLiveInTransaction(
        tx,
        workspaceId,
        channel,
        restarted!,
        ['post-baseline'],
      )),
    ]).toEqual([]);
  });

  it('fences reconnect between scan snapshot and insert, and between enumeration and READY', async () => {
    const before = await service.snapshotIncarnation(channel, workspaceId);
    incarnation = 'incarnation-2'; // credential reconnect committed during provider pagination
    expect(
      await service.recordEnumeration(
        channel,
        [],
        workspaceId,
        list(['old']),
        before,
      ),
    ).toBeNull();
    expect(generations).toHaveLength(0);
    const current = await service.snapshotIncarnation(channel, workspaceId);
    const generationId = await service.recordEnumeration(
      channel,
      [],
      workspaceId,
      list(['old']),
      current,
    );
    expect(generationId).toBe('generation-1');
    await service.recordDispositionsInTransaction(
      workspaceTransaction(query) as never,
      {
        generationId: generationId!,
        workspaceId,
        messageChannelId: channel.id,
        connectedAccountId: channel.connectedAccountId,
        listedIds: ['old'],
        importedIds: ['old'],
        excludedIds: [],
      },
    );
    incarnation = 'incarnation-3'; // reconnect after enumeration, before cursor commit/finalize
    expect(await service.finalize(workspaceId, channel, generationId)).toBe(
      false,
    );
    expect(
      await service.classifyNewIds(workspaceId, channel, ['new']),
    ).toBeNull();
    expect([
      ...(await service.verifyLiveInTransaction(
        workspaceTransaction(query) as never,
        workspaceId,
        channel,
        generationId!,
        ['new'],
      )),
    ]).toEqual([]);
    expect(await service.needsInitialScan(channel, [], workspaceId)).toBe(true);
  });

  it('requires the active canonical transaction runner for core SQL', async () => {
    await expect(
      service.verifyLiveInTransaction(
        { queryRunner: undefined } as never,
        workspaceId,
        channel,
        'generation-1',
        ['new'],
      ),
    ).rejects.toThrow('active transaction');
    await expect(
      service.recordDispositionsInTransaction(
        {
          queryRunner: { query, isTransactionActive: false, isReleased: false },
        } as never,
        {
          generationId: 'generation-1',
          workspaceId,
          messageChannelId: channel.id,
          connectedAccountId: channel.connectedAccountId,
          listedIds: ['new'],
          importedIds: [],
          excludedIds: [],
        },
      ),
    ).rejects.toThrow('active transaction');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a changed folder scope and an invalidated account incarnation', async () => {
    const folderChannel = {
      ...channel,
      messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
      messageFolders: [{ externalId: 'INBOX', isSynced: true }],
    } as MessageChannelEntity;
    const id = await service.recordEnumeration(
      folderChannel,
      folderChannel.messageFolders,
      workspaceId,
      list(['old']),
      incarnation,
    );
    await service.recordDispositionsInTransaction(
      workspaceTransaction(query) as never,
      {
        generationId: id!,
        workspaceId,
        messageChannelId: channel.id,
        connectedAccountId: channel.connectedAccountId,
        listedIds: ['old'],
        importedIds: ['old'],
        excludedIds: [],
      },
    );
    expect(await service.finalize(workspaceId, folderChannel, id)).toBe(true);
    expect(
      await service.classifyNewIds(
        workspaceId,
        {
          ...folderChannel,
          messageFolders: [{ externalId: 'OTHER', isSynced: true }],
        } as MessageChannelEntity,
        ['new'],
      ),
    ).toBeNull();
    generations[0].status = 'INVALID';
    generations[0].isCurrent = false;
    expect(
      await service.classifyNewIds(workspaceId, folderChannel, ['new']),
    ).toBeNull();
  });
});
