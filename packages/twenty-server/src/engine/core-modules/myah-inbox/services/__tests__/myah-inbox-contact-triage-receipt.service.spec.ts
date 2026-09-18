import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';

describe('MyahInboxContactTriageReceiptService', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const evidence = {
    channel: 'EMAIL' as const,
    persistedMessageId: 'message-id',
    sourceRecordId: 'thread-id',
    sourceGenerationId: 'generation-id',
    mode: 'LIVE' as const,
    direction: 'INBOUND' as const,
    originalCreatedAt: '2026-09-15T10:00:00.123Z',
    firstPersistence: true,
  };

  // The service probes the private triage schema before every triage write, so a
  // mock that ignores the probe would silently skip the work under test.
  const triageSchemaProbe = (sql: unknown): unknown[] | undefined =>
    String(sql).includes('to_regclass') ? [{ exists: true }] : undefined;

  it('skips every triage write when the private schema is absent', async () => {
    const query = jest.fn(async (sql: string) => {
      if (String(sql).includes('to_regclass')) return [{ exists: false }];

      throw new Error(`No triage write may run without the schema: ${sql}`);
    });
    const service = new MyahInboxContactTriageReceiptService();
    const manager = {
      internalContext: { workspaceId },
      queryRunner: { query },
    } as never;

    await expect(
      service.lockMigrationMarkerForSourcePersistenceInTransaction(manager),
    ).resolves.toBe(false);
    await expect(
      service.recordInTransaction(
        { ...evidence, providerOccurredAt: null },
        manager,
      ),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain('to_regclass');
  });

  it('synchronizes receipt insertion with the final migration fence', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      const probe = triageSchemaProbe(sql);

      if (probe) return Promise.resolve(probe);

      return sql.includes('SELECT status FROM')
        ? Promise.resolve([{ status: 'MIGRATING' }])
        : Promise.resolve([]);
    });
    const service = new MyahInboxContactTriageReceiptService();

    await service.recordInTransaction(
      { ...evidence, providerOccurredAt: null },
      {
        internalContext: { workspaceId },
        queryRunner: { query },
      } as never,
    );

    const markerLockIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes(
        '"myahInboxTriageMigration" WHERE id=true FOR UPDATE',
      ),
    );
    const markerTouchIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('UPDATE "myahInboxTriageMigration"'),
    );
    const receiptInsertIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('INSERT INTO "myahInboxTriageTransitionReceipt"'),
    );
    expect(markerLockIndex).toBeGreaterThanOrEqual(0);
    expect(markerTouchIndex).toBeGreaterThan(markerLockIndex);
    expect(receiptInsertIndex).toBeGreaterThan(markerTouchIndex);
  });

  it('extends durable Email channel provenance on a replay without inserting another receipt', async () => {
    const query = jest.fn(async (sql: string) => triageSchemaProbe(sql) ?? []);
    const service = new MyahInboxContactTriageReceiptService();

    await service.recordInTransaction(
      { ...evidence, providerOccurredAt: null, firstPersistence: false },
      {
        internalContext: { workspaceId },
        queryRunner: { query },
      } as never,
    );

    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "myahInboxTriageTransitionReceipt"'),
      expect.any(Array),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("persistedMessageId") DO UPDATE'),
      [evidence.persistedMessageId],
    );
    const provenanceSql = String(
      query.mock.calls.find(([sql]) =>
        String(sql).includes('myahInboxTriageEmailChannelProvenance'),
      )?.[0],
    );
    expect(provenanceSql).toContain(
      '"myahInboxTriageEmailChannelProvenance"."messageChannelIds"',
    );
    expect(provenanceSql).toContain('EXCLUDED."messageChannelIds"');
  });

  it.each([
    ['2023-11-14T22:13:20.000Z', '2023-11-14T22:13:20.000Z'],
    ['2026-09-15T10:00:00.123Z', '2026-09-15T10:00:00.123Z'],
    ['0000-01-01T00:00:00.000Z', null],
    ['+010000-01-01T00:00:00.000Z', null],
    ['2026-09-15T10:00:00', null],
    ['2026-09-15T10:00:00.123Z\0', null],
    ['not-a-date', null],
  ])(
    'binds %p provider evidence as %p without Date normalization',
    async (providerOccurredAt, expectedProviderOccurredAt) => {
      const query = jest.fn(
        async (sql: string) => triageSchemaProbe(sql) ?? [],
      );
      const service = new MyahInboxContactTriageReceiptService();

      await service.recordInTransaction({ ...evidence, providerOccurredAt }, {
        internalContext: {
          workspaceId: '00000000-0000-4000-8000-000000000001',
        },
        queryRunner: { query },
      } as never);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('$7::timestamptz'),
        expect.arrayContaining([expectedProviderOccurredAt]),
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('$2::uuid'),
        expect.any(Array),
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("|| $1::text || '|' || $2::uuid::text"),
        expect.any(Array),
      );
    },
  );

  it.each([
    ['MIGRATING', '1'],
    ['READY', null],
  ] as const)(
    'does not claim receipts before the migration is drainable (%s, baseline %p)',
    async (status, baselineFenceSequence) => {
      const query = jest.fn(async (sql: string) => {
        const probe = triageSchemaProbe(sql);

        if (probe) return probe;

        if (sql.includes("set_config('search_path'")) return [];
        if (sql.includes('SELECT status,')) {
          return [{ status, baselineFenceSequence }];
        }
        throw new Error(`Receipt claim must not run: ${sql}`);
      });
      const service = new MyahInboxContactTriageReceiptService(
        {
          executeInWorkspaceContext: jest
            .fn()
            .mockImplementation((callback: () => Promise<unknown>) =>
              callback(),
            ),
          getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
            query,
            manager: { queryRunner: { query } },
            transaction: (callback: (manager: unknown) => unknown) =>
              callback({ queryRunner: { query } }),
          }),
        } as never,
        undefined,
        { resolveDueSnoozesInTransaction: jest.fn() } as never,
      );

      await expect(
        service.drain({
          workspaceId,
          throughSequence: '1',
          purpose: 'READY_RECOVERY',
        }),
      ).resolves.toBe(0);
    },
  );

  it('leaves a receipt PENDING when applying it fails so a later drain retries it', async () => {
    let attempts = 0;
    let status = 'PENDING';
    const applyReceiptInTransaction = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient apply failure');
    });
    const query = jest.fn(async (sql: string) => {
      const probe = triageSchemaProbe(sql);

      if (probe) return probe;

      if (sql.includes('SELECT status,')) {
        return [{ status: 'MIGRATING', baselineFenceSequence: '1' }];
      }
      if (sql.includes('SELECT sequence')) {
        return status === 'PENDING'
          ? [
              {
                sequence: '1',
                channel: 'EMAIL',
                persistedMessageId: 'message-id',
                sourceRecordId: 'thread-id',
                sourceGenerationId: 'generation-id',
                mode: 'LIVE',
                direction: 'INBOUND',
                providerOccurredAt: null,
                originalCreatedAt: '2026-09-15T10:00:00.123Z',
                normalizedOccurredAt: '2026-09-15T10:00:00.123Z',
                orderKey: '2026-09-15T10:00:00.123Z|EMAIL|message-id',
              },
            ]
          : [];
      }
      if (sql.includes("SET status='COMPLETE'")) status = 'COMPLETE';
      return [];
    });
    const manager = { queryRunner: { query } };
    const service = new MyahInboxContactTriageReceiptService(
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((callback: () => Promise<unknown>) => callback()),
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
          query,
          manager,
          transaction: (callback: (transactionManager: unknown) => unknown) =>
            callback(manager),
        }),
      } as never,
      undefined,
      {
        lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
        applyReceiptInTransaction,
        resolveDueSnoozesInTransaction: jest.fn().mockResolvedValue(0),
      } as never,
    );

    await expect(
      service.drain({ workspaceId, throughSequence: '1', purpose: 'CATCH_UP' }),
    ).rejects.toThrow('transient apply failure');
    expect(status).toBe('PENDING');

    await expect(
      service.drain({ workspaceId, throughSequence: '1', purpose: 'CATCH_UP' }),
    ).resolves.toBe(1);
    expect(applyReceiptInTransaction).toHaveBeenCalledTimes(2);
    expect(status).toBe('COMPLETE');
  });

  it('locks every source before applying each ordered receipt and marking it complete', async () => {
    const applyReceiptInTransaction = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockImplementation((sql: string) => {
      const probe = triageSchemaProbe(sql);

      if (probe) return Promise.resolve(probe);

      if (sql.includes('SELECT status,')) {
        return Promise.resolve([
          { status: 'READY', baselineFenceSequence: '1' },
        ]);
      }
      if (sql.includes('SELECT sequence')) {
        return Promise.resolve([
          {
            sequence: '1',
            channel: 'INSTAGRAM',
            persistedMessageId: 'message-id',
            sourceRecordId: 'conversation-id',
            sourceGenerationId: 'webhook:event-id',
            mode: 'LIVE',
            direction: 'OUTBOUND',
            providerOccurredAt: '2026-09-15T10:00:00.123Z',
            originalCreatedAt: '2026-09-15T10:00:00.123Z',
            normalizedOccurredAt: '2026-09-15T10:00:00.123Z',
            orderKey: '2026-09-15T10:00:00.123Z|INSTAGRAM|message-id',
          },
        ]);
      }

      return Promise.resolve([]);
    });
    const manager = { queryRunner: { query } };
    const lockIdentityKeysInTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    const service = new MyahInboxContactTriageReceiptService(
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((callback: () => Promise<unknown>) => callback()),
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
          query,
          manager,
          transaction: (callback: (transactionManager: unknown) => unknown) =>
            callback(manager),
        }),
      } as never,
      undefined,
      {
        lockIdentityKeysInTransaction,
        applyReceiptInTransaction,
      } as never,
    );

    await expect(
      service.drain({
        workspaceId,
        throughSequence: '1',
        purpose: 'READY_RECOVERY',
      }),
    ).resolves.toBe(1);

    expect(applyReceiptInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRecordId: 'conversation-id',
        direction: 'OUTBOUND',
      }),
      manager,
    );
    const sourceLockIndex = query.mock.calls.findIndex(
      ([sql]) => sql === MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
    );
    const sourceRowLockIndex = query.mock.calls.findIndex(
      ([sql]) =>
        String(sql).includes('_myahSocialConversation') &&
        String(sql).includes('FOR UPDATE'),
    );
    const completionCallIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes("SET status='COMPLETE'"),
    );
    expect(sourceLockIndex).toBeGreaterThanOrEqual(0);
    expect(query.mock.calls[sourceLockIndex]?.[1]).toEqual([
      'INSTAGRAM_CONVERSATION:conversation-id',
    ]);
    expect(sourceRowLockIndex).toBeGreaterThan(sourceLockIndex);
    expect(query.mock.invocationCallOrder[sourceRowLockIndex]).toBeLessThan(
      lockIdentityKeysInTransaction.mock.invocationCallOrder[0],
    );
    expect(lockIdentityKeysInTransaction).toHaveBeenCalledWith({
      identityKeys: ['instagram-conversation:conversation-id'],
      manager,
    });
    expect(
      lockIdentityKeysInTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(applyReceiptInTransaction.mock.invocationCallOrder[0]);
    expect(completionCallIndex).toBeGreaterThan(sourceRowLockIndex);
    expect(applyReceiptInTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      query.mock.invocationCallOrder[completionCallIndex],
    );
  });
});
