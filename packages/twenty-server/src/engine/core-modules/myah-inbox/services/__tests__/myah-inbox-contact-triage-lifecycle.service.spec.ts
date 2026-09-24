import { MyahInboxContactTriageLifecycleService } from '../myah-inbox-contact-triage-lifecycle.service';

describe('MyahInboxContactTriageLifecycleService', () => {
  it('stabilizes the attached source set under source advisory locks before row locks', async () => {
    const sourceA = {
      id: '00000000-0000-4000-8000-000000000001',
      creatorId: '00000000-0000-4000-8000-000000000100',
    };
    const sourceB = {
      id: '00000000-0000-4000-8000-000000000002',
      creatorId: '00000000-0000-4000-8000-000000000100',
    };
    const unlockedReadResults = [
      [sourceA],
      [sourceA, sourceB],
      [sourceA, sourceB],
    ];
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('FROM "messageThread"') && !sql.includes('FOR UPDATE')) {
        return unlockedReadResults.shift() ?? [sourceA, sourceB];
      }
      if (sql.includes('FROM "messageThread"') && sql.includes('FOR UPDATE')) {
        return [sourceA, sourceB];
      }
      return [];
    });
    const service = new MyahInboxContactTriageLifecycleService();

    await service.prepareCreatorMutationInTransaction({
      workspaceId: '00000000-0000-4000-8000-000000000200',
      creatorIds: [sourceA.creatorId],
      manager: { queryRunner: { query } } as never,
    });

    const sourceLockCalls = query.mock.calls
      .filter(([sql]) => String(sql).includes('myah-inbox-source:'))
      .map(([, parameters]) => parameters?.[0]);
    const firstSourceRowLock = query.mock.calls.findIndex(
      ([sql]) =>
        String(sql).includes('FROM "messageThread"') &&
        String(sql).includes('FOR UPDATE'),
    );
    const sourceBLock = query.mock.calls.findIndex(
      ([sql, parameters]) =>
        String(sql).includes('myah-inbox-source:') &&
        parameters?.[0] === `EMAIL_THREAD:${sourceB.id}`,
    );

    expect(sourceLockCalls).toEqual([
      `EMAIL_THREAD:${sourceA.id}`,
      `EMAIL_THREAD:${sourceB.id}`,
    ]);
    expect(sourceBLock).toBeLessThan(firstSourceRowLock);
  });

  it('locks attached sources before transactionally revalidating Creator targets', async () => {
    const source = {
      id: '00000000-0000-4000-8000-000000000001',
      creatorId: '00000000-0000-4000-8000-000000000100',
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "messageThread"')) return [source];
      return [];
    });
    const verify = jest.fn().mockResolvedValue(undefined);
    const mutate = jest.fn().mockResolvedValue('mutated');
    const ensureSourceContactInTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    const service = new MyahInboxContactTriageLifecycleService({
      ensureSourceContactInTransaction,
      lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
      finalizePreviousCreatorIdentitiesInTransaction: jest
        .fn()
        .mockResolvedValue(undefined),
    } as never);

    await expect(
      service.withPreparedCreatorMutationInTransaction({
        workspaceId: '00000000-0000-4000-8000-000000000200',
        creatorIds: [source.creatorId],
        manager: { queryRunner: { query } } as never,
        verify,
        mutate,
      }),
    ).resolves.toBe('mutated');

    const sourceLock =
      query.mock.invocationCallOrder[
        query.mock.calls.findIndex(([sql]) =>
          String(sql).includes('myah-inbox-source:'),
        )
      ];
    expect(sourceLock).toBeLessThan(verify.mock.invocationCallOrder[0]);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(
      mutate.mock.invocationCallOrder[0],
    );
  });

  it('anchors previous and next Creators before locking a relinked source', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000001';
    const previousCreatorId = '00000000-0000-4000-8000-000000000100';
    const nextCreatorId = '00000000-0000-4000-8000-000000000101';
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: sourceId, creatorId: previousCreatorId }];
      }
      return [];
    });
    const mutate = jest.fn().mockResolvedValue('mutated');
    const service = new MyahInboxContactTriageLifecycleService({
      lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
      ensureSourceContactInTransaction: jest.fn().mockResolvedValue(undefined),
      finalizePreviousCreatorIdentitiesInTransaction: jest
        .fn()
        .mockResolvedValue(undefined),
    } as never);

    await expect(
      service.withPreparedSourceMutationInTransaction({
        workspaceId: '00000000-0000-4000-8000-000000000200',
        sourceType: 'EMAIL_THREAD',
        sourceRecordIds: [sourceId],
        nextCreatorIds: [nextCreatorId],
        manager: { queryRunner: { query } } as never,
        mutate,
      }),
    ).resolves.toBe('mutated');

    const anchorCalls = query.mock.calls
      .filter(([sql]) => String(sql).includes('myah-inbox-anchor:'))
      .map(([, parameters]) => parameters?.[0]);
    const anchorIndexes = query.mock.calls.flatMap(([sql], index) =>
      String(sql).includes('myah-inbox-anchor:') ? [index] : [],
    );
    const finalAnchorIndex = anchorIndexes[anchorIndexes.length - 1];
    const sourceLockIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('myah-inbox-source:'),
    );

    expect(anchorCalls).toEqual([
      `creator:${previousCreatorId}`,
      `creator:${nextCreatorId}`,
    ]);
    expect(finalAnchorIndex).toBeLessThan(sourceLockIndex);
    expect(sourceLockIndex).toBeLessThan(
      query.mock.calls.findIndex(
        ([sql]) =>
          String(sql).includes('FROM "messageThread"') &&
          String(sql).includes('FOR UPDATE'),
      ),
    );
  });

  it('locks every lifecycle identity globally and defers retiring the old Creator until all fallbacks are copied', async () => {
    const creatorId = '00000000-0000-4000-8000-000000000100';
    const sourceA = '00000000-0000-4000-8000-000000000001';
    const sourceB = '00000000-0000-4000-8000-000000000002';
    const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('FROM "messageThread"') && sql.includes('FOR UPDATE')) {
        const ids = Array.isArray(parameters?.[0])
          ? parameters[0]
          : [parameters?.[0]];

        return ids.map((id) => ({ id, creatorId: null }));
      }
      return [];
    });
    const lockIdentityKeysInTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    const ensureSourceContactInTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    const finalizePreviousCreatorIdentitiesInTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    const service = new MyahInboxContactTriageLifecycleService({
      lockIdentityKeysInTransaction,
      ensureSourceContactInTransaction,
      finalizePreviousCreatorIdentitiesInTransaction,
    } as never);

    await service.reconcilePreparedSourcesInTransaction({
      workspaceId: '00000000-0000-4000-8000-000000000200',
      sources: [
        { sourceType: 'EMAIL_THREAD', sourceRecordId: sourceB, creatorId },
        { sourceType: 'EMAIL_THREAD', sourceRecordId: sourceA, creatorId },
      ],
      manager: { queryRunner: { query } } as never,
    });

    expect(lockIdentityKeysInTransaction).toHaveBeenCalledWith({
      identityKeys: [
        `creator:${creatorId}`,
        `email-thread:${sourceA}`,
        `email-thread:${sourceB}`,
      ],
      manager: expect.anything(),
    });
    expect(ensureSourceContactInTransaction).toHaveBeenCalledTimes(2);
    expect(ensureSourceContactInTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sourceRecordId: sourceA,
        previousCreatorId: creatorId,
        deferPreviousCreatorInvalidation: true,
      }),
    );
    expect(finalizePreviousCreatorIdentitiesInTransaction).toHaveBeenCalledWith(
      {
        previousCreatorIds: [creatorId],
        manager: expect.anything(),
      },
    );
    expect(
      lockIdentityKeysInTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(
      ensureSourceContactInTransaction.mock.invocationCallOrder[0],
    );
    expect(
      ensureSourceContactInTransaction.mock.invocationCallOrder[1],
    ).toBeLessThan(
      finalizePreviousCreatorIdentitiesInTransaction.mock
        .invocationCallOrder[0],
    );
  });

  it('keeps Creator lifecycle Email-only when the optional Instagram relation is absent', async () => {
    const creatorId = '00000000-0000-4000-8000-000000000100';
    const emailSource = '00000000-0000-4000-8000-000000000001';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ exists: false }];
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: emailSource, creatorId }];
      }
      return [];
    });
    const service = new MyahInboxContactTriageLifecycleService({
      lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
      ensureSourceContactInTransaction: jest.fn().mockResolvedValue(undefined),
      finalizePreviousCreatorIdentitiesInTransaction: jest
        .fn()
        .mockResolvedValue(undefined),
    } as never);

    await expect(
      service.prepareCreatorMutationInTransaction({
        workspaceId: '00000000-0000-4000-8000-000000000200',
        creatorIds: [creatorId],
        manager: { queryRunner: { query } } as never,
      }),
    ).resolves.toEqual([
      {
        sourceType: 'EMAIL_THREAD',
        sourceRecordId: emailSource,
        creatorId,
      },
    ]);

    expect(query).toHaveBeenCalledWith(
      'SELECT to_regclass($1) IS NOT NULL AS "exists"',
      ['"_myahSocialConversation"'],
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('"_myahSocialConversation"'),
      ),
    ).toBe(false);
  });

  it('rejects an uncovered anticipated Creator before acquiring its lock', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000001';
    const creatorC = '00000000-0000-4000-8000-000000000103';
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('to_regclass')) return [{ exists: false }];
      if (
        sql.includes('FROM "messageThread"') &&
        sql.includes('WHERE id = ANY')
      ) {
        return [{ id: sourceId, creatorId: creatorC }];
      }
      if (sql.includes('FROM "messageThread"') && sql.includes('WHERE id=$1')) {
        return [{ id: sourceId, creatorId: creatorC }];
      }
      return [];
    });
    const service = new MyahInboxContactTriageLifecycleService({
      ensureSourceContactInTransaction: jest.fn(),
      lockIdentityKeysInTransaction: jest.fn(),
      finalizePreviousCreatorIdentitiesInTransaction: jest.fn(),
    } as never);
    const withPreparedSourceMutation =
      service.withPreparedSourceMutationInTransaction as (
        options: Record<string, unknown>,
      ) => Promise<unknown>;

    await expect(
      withPreparedSourceMutation.call(service, {
        workspaceId: '00000000-0000-4000-8000-000000000200',
        sourceType: 'EMAIL_THREAD',
        sourceRecordIds: [sourceId],
        nextCreatorIds: [
          '00000000-0000-4000-8000-000000000101',
          '00000000-0000-4000-8000-000000000102',
        ],
        coveredCreatorIds: [
          '00000000-0000-4000-8000-000000000101',
          '00000000-0000-4000-8000-000000000102',
        ],
        manager: { queryRunner: { query } },
        mutate: jest.fn(),
      }),
    ).rejects.toThrow(
      'Inbox Creator lock coverage changed before source mutation',
    );

    expect(
      query.mock.calls.some(
        ([sql, parameters]) =>
          String(sql).includes('myah-inbox-anchor:') &&
          parameters?.[0] === `creator:${creatorC}`,
      ),
    ).toBe(false);
  });

  it('takes Creator mutation anchors in lexical order before the mutation', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const mutate = jest.fn().mockResolvedValue('mutated');
    const service = new MyahInboxContactTriageLifecycleService();

    await expect(
      service.withCreatorMutationLocksInTransaction({
        creatorIds: ['creator-b', 'creator-a'],
        manager: { queryRunner: { query } } as never,
        mutate,
      }),
    ).resolves.toBe('mutated');

    expect(query).toHaveBeenNthCalledWith(
      1,
      "SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-anchor:' || $1, 0))",
      ['creator:creator-a'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-anchor:' || $1, 0))",
      ['creator:creator-b'],
    );
    expect(mutate.mock.invocationCallOrder[0]).toBeGreaterThan(
      query.mock.invocationCallOrder[1],
    );
  });
});
