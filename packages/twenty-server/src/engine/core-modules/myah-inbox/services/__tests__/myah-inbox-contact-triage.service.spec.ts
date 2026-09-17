import { BadRequestException } from '@nestjs/common';

import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const threadId = '00000000-0000-4000-8000-000000000002';
const creatorId = '00000000-0000-4000-8000-000000000003';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

type FirstSourceLock = {
  acquired: () => void;
  release: Promise<void>;
};

type SourceLockConfig = {
  sourceType: 'EMAIL_THREAD' | 'INSTAGRAM_CONVERSATION';
  tableName: 'messageThread' | '_myahSocialConversation';
  fallbackPrefix: 'email-thread' | 'instagram-conversation';
};

const emailSourceLockConfig: SourceLockConfig = {
  sourceType: 'EMAIL_THREAD',
  tableName: 'messageThread',
  fallbackPrefix: 'email-thread',
};

const instagramSourceLockConfig: SourceLockConfig = {
  sourceType: 'INSTAGRAM_CONVERSATION',
  tableName: '_myahSocialConversation',
  fallbackPrefix: 'instagram-conversation',
};

class SourceLockStore {
  constructor(readonly source = emailSourceLockConfig) {}

  creatorId: string | null = null;
  identities = new Map<string, boolean>();
  triage = new Set<string>();
  receiptTransitions = new Map<string, number>();
  receiptCompletions = new Map<string, number>();
  private readonly sourceLockTails = new Map<string, Promise<void>>();
  private readonly threadLockTails = new Map<string, Promise<void>>();
  private readonly waitingSourceLocks = new Set<string>();
  private readonly waitingThreadLocks = new Set<string>();

  async waitForSourceLockWaiter(sourceLockKey: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (this.waitingSourceLocks.has(sourceLockKey)) return;
      await Promise.resolve();
    }
    throw new Error(`No transaction waited for source lock ${sourceLockKey}`);
  }

  createManager(firstSourceLock?: FirstSourceLock) {
    const heldSourceLocks = new Map<
      string,
      { release: () => void; tail: Promise<void> }
    >();
    const heldThreadLocks = new Map<
      string,
      { release: () => void; tail: Promise<void> }
    >();
    let shouldPause = firstSourceLock !== undefined;

    return {
      manager: {
        internalContext: { workspaceId },
        queryRunner: {
          query: async (sql: string, parameters: string[] = []) => {
            if (sql.includes('set_config')) return [];
            if (sql.includes('pg_advisory_xact_lock')) {
              if (
                !sql.includes("hashtextextended('myah-inbox-source:' || $1, 0)")
              ) {
                throw new Error(`Unexpected source lock expression: ${sql}`);
              }
              const sourceLockKey = parameters[0];
              if (heldSourceLocks.has(sourceLockKey)) return [];

              const priorTail = this.sourceLockTails.get(sourceLockKey);
              let release: () => void;
              const tail = new Promise<void>((done) => {
                release = done;
              });
              this.sourceLockTails.set(sourceLockKey, tail);
              if (priorTail) this.waitingSourceLocks.add(sourceLockKey);
              await priorTail;
              this.waitingSourceLocks.delete(sourceLockKey);
              heldSourceLocks.set(sourceLockKey, { release: release!, tail });

              if (shouldPause) {
                shouldPause = false;
                firstSourceLock!.acquired();
                await firstSourceLock!.release;
              }
              return [];
            }
            if (
              sql.includes(`UPDATE "${this.source.tableName}"`) ||
              (sql.includes(`FROM "${this.source.tableName}"`) &&
                sql.includes('FOR UPDATE'))
            ) {
              const lockKey = parameters[0];
              if (!heldThreadLocks.has(lockKey)) {
                const priorTail = this.threadLockTails.get(lockKey);
                let release: () => void;
                const tail = new Promise<void>((done) => {
                  release = done;
                });
                this.threadLockTails.set(lockKey, tail);
                if (priorTail) this.waitingThreadLocks.add(lockKey);
                await priorTail;
                this.waitingThreadLocks.delete(lockKey);
                heldThreadLocks.set(lockKey, { release: release!, tail });
              }
              if (sql.includes(`FROM "${this.source.tableName}"`)) {
                return [{ id: threadId, creatorId: this.creatorId }];
              }
              return [];
            }
            if (
              sql.includes('UPDATE "myahInboxContactTriage"') &&
              (sql.includes('AND "hasStateDecision"=false') ||
                sql.includes('"snoozedUntil" <= now()'))
            ) {
              return [];
            }
            if (sql.includes('SET "lastInboundOccurredAt"=$2::timestamptz')) {
              const identityKey = parameters[0];
              this.receiptTransitions.set(
                identityKey,
                (this.receiptTransitions.get(identityKey) ?? 0) + 1,
              );
              return [];
            }
            if (sql.includes("SET status='COMPLETE'")) {
              const receiptSequence = parameters[0];
              this.receiptCompletions.set(
                receiptSequence,
                (this.receiptCompletions.get(receiptSequence) ?? 0) + 1,
              );
              return [];
            }
            if (sql.includes('SET "isActive"=false')) {
              if (this.identities.has(parameters[0])) {
                this.identities.set(parameters[0], false);
              }
              return [];
            }
            if (sql.startsWith('INSERT INTO "myahInboxContactIdentity"')) {
              if (!this.identities.has(parameters[0])) {
                this.identities.set(parameters[0], true);
              }
              return [];
            }
            if (sql.includes('SET "isActive"=true')) {
              if (this.identities.has(parameters[0])) {
                this.identities.set(parameters[0], true);
              }
              return [];
            }
            if (sql.startsWith('INSERT INTO "myahInboxContactTriage"')) {
              this.triage.add(parameters[0]);
              return [];
            }
            if (
              sql.includes('FROM "myahInboxContactIdentity"') ||
              sql.includes('FROM "myahInboxContactTriage"') ||
              sql.includes('SET generation=generation+1') ||
              sql.includes('UPDATE "myahInboxContactTriage" creator') ||
              sql.startsWith('DELETE FROM "myahInboxContactTriage"')
            ) {
              return [];
            }
            throw new Error(`Unhandled source SQL: ${sql}`);
          },
        },
      } as never,
      release: () => {
        for (const [sourceLockKey, heldLock] of heldSourceLocks) {
          heldLock.release();
          if (this.sourceLockTails.get(sourceLockKey) === heldLock.tail) {
            this.sourceLockTails.delete(sourceLockKey);
          }
        }
        heldSourceLocks.clear();
        for (const [threadLockKey, heldLock] of heldThreadLocks) {
          heldLock.release();
          if (this.threadLockTails.get(threadLockKey) === heldLock.tail) {
            this.threadLockTails.delete(threadLockKey);
          }
        }
        heldThreadLocks.clear();
      },
    };
  }
}

describe('MyahInboxContactTriageService receipt transitions', () => {
  it.each([
    ['OUTBOUND', 'WAITING_ON_CREATOR'],
    ['INBOUND', 'NEEDS_REPLY'],
  ] as const)(
    'moves a source-only Instagram contact to %s state',
    async (direction, expectedState) => {
      let inboxState = 'CLOSED';
      const query = jest.fn(async (sql: string, parameters: string[] = []) => {
        if (sql.includes('FROM "_myahSocialConversation"')) {
          return [{ id: threadId, creatorId: null }];
        }
        if (sql.includes('UPDATE "myahInboxContactTriage"')) {
          inboxState =
            direction === 'INBOUND' ? 'NEEDS_REPLY' : 'WAITING_ON_CREATOR';
        }
        if (
          sql.includes('INSERT INTO "myahInboxContactTriage"') &&
          parameters[1]
        ) {
          inboxState = parameters[1];
        }

        return [];
      });
      const service = new MyahInboxContactTriageService();

      await service.applyReceiptInTransaction(
        {
          sequence: '1',
          channel: 'INSTAGRAM',
          persistedMessageId: '00000000-0000-4000-8000-000000000004',
          sourceRecordId: threadId,
          sourceGenerationId: 'webhook:event-id',
          mode: 'LIVE',
          direction,
          providerOccurredAt: '2026-09-15T10:00:00.000Z',
          originalCreatedAt: '2026-09-15T10:00:00.000Z',
          normalizedOccurredAt: '2026-09-15T10:00:00.000Z',
          orderKey: `2026-09-15T10:00:00.000Z|INSTAGRAM|${direction}`,
        },
        {
          internalContext: { workspaceId },
          queryRunner: { query },
        } as never,
      );

      expect(inboxState).toBe(expectedState);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('AND "hasStateDecision"=false'),
        [
          `instagram-conversation:${threadId}`,
          expectedState,
          '2026-09-15T10:00:00.000Z',
        ],
      );
    },
  );

  it('initializes a source-only tuple on first outbound evidence after an owner-only CAS', async () => {
    const sourceOnlyTuple = {
      inboxOwnerId: null as string | null,
      inboxState: 'CLOSED',
      revision: 1,
      hasStateDecision: false,
    };
    const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('FROM "_myahSocialConversation"')) {
        return [{ id: threadId, creatorId: null }];
      }
      if (sql.includes('SET "inboxOwnerId"=')) {
        expect(parameters.slice(0, 3)).toEqual([
          `instagram-conversation:${threadId}`,
          1,
          '1',
        ]);
        sourceOnlyTuple.inboxOwnerId = creatorId;
        sourceOnlyTuple.revision += 1;
        return [
          {
            ...sourceOnlyTuple,
            snoozedUntil: null,
            identityGeneration: '1',
          },
        ];
      }
      if (
        sql.includes('UPDATE "myahInboxContactTriage"') &&
        sql.includes('AND "hasStateDecision"=false')
      ) {
        sourceOnlyTuple.inboxState = 'WAITING_ON_CREATOR';
        sourceOnlyTuple.hasStateDecision = true;
        sourceOnlyTuple.revision += 1;
      }

      return [];
    });
    const service = new MyahInboxContactTriageService();

    await service.updateTupleInTransaction({
      contactIdentityKey: `instagram-conversation:${threadId}`,
      expectedRevision: 1,
      expectedIdentityGeneration: '1',
      patch: { inboxOwnerId: creatorId },
      manager: { queryRunner: { query } } as never,
    });
    await service.applyReceiptInTransaction(
      {
        sequence: '1',
        channel: 'INSTAGRAM',
        persistedMessageId: '00000000-0000-4000-8000-000000000004',
        sourceRecordId: threadId,
        sourceGenerationId: 'webhook:event-id',
        mode: 'LIVE',
        direction: 'OUTBOUND',
        providerOccurredAt: '2026-09-15T10:00:00.000Z',
        originalCreatedAt: '2026-09-15T10:00:00.000Z',
        normalizedOccurredAt: '2026-09-15T10:00:00.000Z',
        orderKey: '2026-09-15T10:00:00.000Z|INSTAGRAM|outbound',
      },
      {
        internalContext: { workspaceId },
        queryRunner: { query },
      } as never,
    );

    expect(sourceOnlyTuple).toMatchObject({
      inboxOwnerId: creatorId,
      inboxState: 'WAITING_ON_CREATOR',
    });
  });

  it('does not give automatic first outbound wall-clock precedence over ordered LIVE inbound evidence', async () => {
    const outboundOccurredAt = '2026-09-15T09:00:00.000Z';
    const inboundOccurredAt = '2026-09-15T10:00:00.000Z';
    const inboundOrderKey = '2026-09-15T10:00:00.000Z|INSTAGRAM|inbound';
    const tuple = {
      inboxOwnerId: creatorId,
      inboxState: 'CLOSED',
      hasStateDecision: false,
      stateDecisionAt: '2026-09-15T20:00:00.000Z',
      lastInboundOccurredAt: null as string | null,
      lastInboundOrderKey: null as string | null,
    };
    let inboundTransitions = 0;
    const query = jest.fn(async (sql: string, parameters: string[] = []) => {
      if (sql.includes('FROM "_myahSocialConversation"')) {
        return [{ id: threadId, creatorId: null }];
      }
      if (
        sql.includes('UPDATE "myahInboxContactTriage"') &&
        sql.includes('AND "hasStateDecision"=false')
      ) {
        if (tuple.inboxState === 'CLOSED') {
          expect(sql).toContain('COALESCE($3::timestamptz, now())');
          expect(parameters).toEqual([
            `instagram-conversation:${threadId}`,
            'WAITING_ON_CREATOR',
            outboundOccurredAt,
          ]);
          tuple.inboxState = 'WAITING_ON_CREATOR';
          tuple.stateDecisionAt = outboundOccurredAt;
        }
        return [];
      }
      if (sql.includes('SET "lastInboundOccurredAt"=$2::timestamptz')) {
        expect(sql).toContain('NOT "hasStateDecision"');
        if (tuple.lastInboundOccurredAt === null) {
          tuple.inboxState = 'NEEDS_REPLY';
          tuple.lastInboundOccurredAt = parameters[1];
          tuple.lastInboundOrderKey = parameters[2];
          inboundTransitions += 1;
        }
        return [];
      }

      return [];
    });
    const service = new MyahInboxContactTriageService();
    const manager = {
      internalContext: { workspaceId },
      queryRunner: { query },
    } as never;
    const receipt = {
      sequence: '1',
      channel: 'INSTAGRAM' as const,
      persistedMessageId: '00000000-0000-4000-8000-000000000004',
      sourceRecordId: threadId,
      sourceGenerationId: 'webhook:event-id',
      mode: 'LIVE' as const,
      providerOccurredAt: null,
      originalCreatedAt: outboundOccurredAt,
    };

    await service.applyReceiptInTransaction(
      {
        ...receipt,
        direction: 'OUTBOUND',
        normalizedOccurredAt: outboundOccurredAt,
        orderKey: '2026-09-15T09:00:00.000Z|INSTAGRAM|outbound',
      },
      manager,
    );
    await service.applyReceiptInTransaction(
      {
        ...receipt,
        sequence: '2',
        direction: 'INBOUND',
        normalizedOccurredAt: inboundOccurredAt,
        orderKey: inboundOrderKey,
      },
      manager,
    );
    await service.applyReceiptInTransaction(
      {
        ...receipt,
        sequence: '3',
        direction: 'INBOUND',
        normalizedOccurredAt: inboundOccurredAt,
        orderKey: inboundOrderKey,
      },
      manager,
    );

    expect(tuple).toMatchObject({
      inboxOwnerId: creatorId,
      inboxState: 'NEEDS_REPLY',
      lastInboundOccurredAt: inboundOccurredAt,
      lastInboundOrderKey: inboundOrderKey,
    });
    expect(inboundTransitions).toBe(1);
  });
});

describe('MyahInboxContactTriageService tuple mutation', () => {
  const tuple = {
    inboxOwnerId: null,
    inboxState: 'CLOSED',
    snoozedUntil: null,
    revision: 2,
    identityGeneration: '1',
  };

  it('allows an owner-only CAS mutation to clear the owner', async () => {
    const query = jest.fn(async (sql: string, parameters: unknown[]) => {
      if (sql.includes('UPDATE "myahInboxContactTriage"')) {
        expect(parameters).toEqual([
          'creator:contact',
          1,
          '1',
          true,
          null,
          undefined,
          null,
          false,
        ]);
        return [tuple];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      new MyahInboxContactTriageService().updateTupleInTransaction({
        contactIdentityKey: 'creator:contact',
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxOwnerId: null },
        manager: { queryRunner: { query } } as never,
      }),
    ).resolves.toEqual(tuple);
  });

  it('treats an explicit null inbox state as omission without clearing a SNOOZED deadline', async () => {
    const query = jest.fn(async (sql: string, parameters: unknown[]) => {
      if (sql.includes('UPDATE "myahInboxContactTriage"')) {
        expect(parameters.slice(5)).toEqual([undefined, null, false]);
        return [
          {
            ...tuple,
            inboxState: 'SNOOZED',
            snoozedUntil: '2026-09-15T10:00:00.000Z',
          },
        ];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      new MyahInboxContactTriageService().updateTupleInTransaction({
        contactIdentityKey: 'creator:contact',
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxState: null } as never,
        manager: { queryRunner: { query } } as never,
      }),
    ).resolves.toMatchObject({
      inboxState: 'SNOOZED',
      snoozedUntil: '2026-09-15T10:00:00.000Z',
    });
  });

  it('treats an explicit null snooze as omission for an owner-only mutation', async () => {
    const query = jest.fn(async (sql: string, parameters: unknown[]) => {
      if (sql.includes('UPDATE "myahInboxContactTriage"')) {
        expect(parameters.slice(5)).toEqual([undefined, null, false]);
        return [tuple];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      new MyahInboxContactTriageService().updateTupleInTransaction({
        contactIdentityKey: 'creator:contact',
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxOwnerId: null, snoozedUntil: null } as never,
        manager: { queryRunner: { query } } as never,
      }),
    ).resolves.toEqual(tuple);
  });

  it('requires a snooze deadline and clears it outside SNOOZED', async () => {
    const service = new MyahInboxContactTriageService();
    const manager = { queryRunner: { query: jest.fn() } } as never;

    await expect(
      service.updateTupleInTransaction({
        contactIdentityKey: 'creator:contact',
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxState: 'SNOOZED' },
        manager,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.updateTupleInTransaction({
        contactIdentityKey: 'creator:contact',
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: {
          inboxState: 'SNOOZED',
          snoozedUntil: '2020-01-01T00:00:00.000Z',
        },
        manager,
      }),
    ).rejects.toThrow(BadRequestException);

    const query = jest.fn(async (sql: string, parameters: unknown[]) => {
      if (sql.includes('UPDATE "myahInboxContactTriage"')) {
        expect(parameters.slice(5)).toEqual(['CLOSED', null, true]);
        return [tuple];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    await service.updateTupleInTransaction({
      contactIdentityKey: 'creator:contact',
      expectedRevision: 1,
      expectedIdentityGeneration: '1',
      patch: {
        inboxState: 'CLOSED',
        snoozedUntil: '2026-09-15T10:00:00.000Z',
      },
      manager: { queryRunner: { query } } as never,
    });
  });

  it.each([
    ['revision', 1, '2'],
    ['identity generation', 2, '1'],
  ] as const)(
    'returns the current tuple for a stale %s CAS',
    async (_staleField, expectedRevision, expectedIdentityGeneration) => {
      const query = jest.fn(async (sql: string, parameters: unknown[]) => {
        if (sql.includes('UPDATE "myahInboxContactTriage"')) {
          expect(parameters.slice(0, 3)).toEqual([
            'creator:contact',
            expectedRevision,
            expectedIdentityGeneration,
          ]);
          return [];
        }
        if (sql.includes('FROM "myahInboxContactTriage"')) return [tuple];
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(
        new MyahInboxContactTriageService().updateTupleInTransaction({
          contactIdentityKey: 'creator:contact',
          expectedRevision,
          expectedIdentityGeneration,
          patch: { inboxOwnerId: null },
          manager: { queryRunner: { query } } as never,
        }),
      ).rejects.toMatchObject({
        extensions: expect.objectContaining({ triage: tuple }),
      });
    },
  );

  it('normalizes PostgreSQL Date snooze values on successful tuple updates and conflicts', async () => {
    const snoozedUntil = new Date('2026-09-15T10:00:00.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { ...tuple, inboxState: 'SNOOZED', snoozedUntil },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...tuple, inboxState: 'SNOOZED', snoozedUntil },
      ]);
    const service = new MyahInboxContactTriageService();
    const input = {
      contactIdentityKey: 'creator:contact',
      expectedRevision: 2,
      expectedIdentityGeneration: '1',
      patch: { inboxOwnerId: null },
      manager: { queryRunner: { query } } as never,
    };

    await expect(service.updateTupleInTransaction(input)).resolves.toEqual({
      ...tuple,
      inboxState: 'SNOOZED',
      snoozedUntil: '2026-09-15T10:00:00.000Z',
    });
    await expect(service.updateTupleInTransaction(input)).rejects.toMatchObject(
      {
        extensions: {
          triage: {
            snoozedUntil: '2026-09-15T10:00:00.000Z',
          },
        },
      },
    );
  });

  it('keeps the ordered-receipt predicate on duplicate and older inbound evidence', async () => {
    const query = jest.fn(async (sql: string, _parameters: unknown[] = []) => {
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: threadId, creatorId: null }];
      }
      return [];
    });
    const service = new MyahInboxContactTriageService();
    const receipt = {
      sequence: '1',
      channel: 'EMAIL' as const,
      persistedMessageId: '00000000-0000-4000-8000-000000000004',
      sourceRecordId: threadId,
      sourceGenerationId: 'generation',
      mode: 'LIVE' as const,
      direction: 'INBOUND' as const,
      providerOccurredAt: '2026-09-15T10:00:00.000Z',
      originalCreatedAt: '2026-09-15T10:00:00.000Z',
      normalizedOccurredAt: '2026-09-15T10:00:00.000Z',
      orderKey: '2026-09-15T10:00:00.000Z|EMAIL|message',
    };

    await service.applyReceiptInTransaction(receipt, {
      internalContext: { workspaceId },
      queryRunner: { query },
    } as never);
    await service.applyReceiptInTransaction(
      {
        ...receipt,
        sequence: '2',
        orderKey: '2026-09-15T09:00:00.000Z|EMAIL|older',
      },
      { internalContext: { workspaceId }, queryRunner: { query } } as never,
    );

    const transitionCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('"lastInboundOccurredAt" < $2::timestamptz'),
    );
    expect(transitionCalls).toHaveLength(2);
    expect(transitionCalls[0]?.[1]).toEqual([
      `email-thread:${threadId}`,
      receipt.normalizedOccurredAt,
      receipt.orderKey,
    ]);
  });

  it('resolves only due snoozes before applying a receipt', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: threadId, creatorId: null }];
      }
      return [];
    });
    await new MyahInboxContactTriageService().resolveDueSnoozesInTransaction({
      manager: { queryRunner: { query } } as never,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"snoozedUntil" <= now()'),
      [null],
    );
  });
});

describe('MyahInboxContactTriageService Creator identity reconciliation', () => {
  const creatorA = '00000000-0000-4000-8000-00000000000a';
  const creatorB = '00000000-0000-4000-8000-00000000000b';

  const managerForCreator = (currentCreatorId: string | null) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: threadId, creatorId: currentCreatorId }];
      }
      if (sql.includes('SET "inboxOwnerId"=CASE')) return [];
      if (sql.includes('SELECT "inboxOwnerId", "inboxState"')) {
        return [
          {
            inboxOwnerId: null,
            inboxState: 'CLOSED',
            snoozedUntil: null,
            revision: 2,
            identityGeneration: '2',
          },
        ];
      }
      return [];
    });

    return {
      query,
      manager: {
        internalContext: { workspaceId },
        queryRunner: { query },
      } as never,
    };
  };

  it('finalizes a previous Email Creator without querying an absent Instagram relation', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ exists: false }];
      return [];
    });
    const service = new MyahInboxContactTriageService();

    await expect(
      service.finalizePreviousCreatorIdentitiesInTransaction({
        previousCreatorIds: [creatorA],
        manager: { queryRunner: { query } } as never,
      }),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      'SELECT to_regclass($1) IS NOT NULL AS "exists"',
      ['"_myahSocialConversation"'],
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('FROM "_myahSocialConversation"'),
      ),
    ).toBe(false);
  });

  it('rejects a linked stale source under source locks without locking its Creator identity or triage', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: threadId, creatorId: creatorA }];
      }
      return [];
    });
    const service = new MyahInboxContactTriageService();

    await expect(
      service.prepareUnmatchedSourceContactInTransaction({
        sourceType: 'EMAIL_THREAD',
        sourceRecordId: threadId,
        manager: {
          internalContext: { workspaceId },
          queryRunner: { query },
        } as never,
      }),
    ).resolves.toBeNull();

    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-source:' || $1, 0))",
      [`EMAIL_THREAD:${threadId}`],
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT id, "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE',
      [threadId],
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('"myahInboxContactIdentity"'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('"myahInboxContactTriage"'),
      ),
    ).toBe(false);
  });

  it('reactivates a retired Creator identity and rejects its pre-retirement CAS generation when relinked', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM "messageThread"')) {
        return [{ id: threadId, creatorId: creatorA }];
      }
      if (sql.includes('SET "isActive"=true')) return [{ generation: '4' }];
      if (sql.includes('SET "identityGeneration"=$2::bigint')) return [];
      if (sql.includes('SET "inboxOwnerId"=CASE')) return [];
      if (sql.includes('SELECT "inboxOwnerId", "inboxState"')) {
        return [
          {
            inboxOwnerId: null,
            inboxState: 'CLOSED',
            snoozedUntil: null,
            revision: 4,
            identityGeneration: '4',
          },
        ];
      }
      return [];
    });
    const manager = {
      internalContext: { workspaceId },
      queryRunner: { query },
    } as never;
    const service = new MyahInboxContactTriageService();

    await service.ensureSourceContactInTransaction({
      sourceType: 'EMAIL_THREAD',
      sourceRecordId: threadId,
      manager,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET "isActive"=true, generation=generation+1'),
      [`creator:${creatorA}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET "identityGeneration"=$2::bigint'),
      [`creator:${creatorA}`, '4'],
    );
    await expect(
      service.updateTupleInTransaction({
        contactIdentityKey: `creator:${creatorA}`,
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxOwnerId: null },
        manager,
      }),
    ).rejects.toMatchObject({
      extensions: { triage: { identityGeneration: '4' } },
    });
  });

  it('reconciles a direct Creator A-to-B relink and invalidates A generation', async () => {
    const { manager, query } = managerForCreator(creatorB);
    const service = new MyahInboxContactTriageService();

    await service.ensureSourceContactInTransaction({
      sourceType: 'EMAIL_THREAD',
      sourceRecordId: threadId,
      previousCreatorId: creatorA,
      manager,
    });

    const lifecycleLock = query.mock.calls.find(
      (call) =>
        String(call[0]).includes('= ANY($1::text[])') &&
        String(call[0]).includes('FOR UPDATE'),
    ) as [string, string[]] | undefined;
    expect(lifecycleLock?.[1]).toEqual([
      [
        `creator:${creatorA}`,
        `creator:${creatorB}`,
        `email-thread:${threadId}`,
      ],
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "myahInboxContactTriage" previous_creator'),
      [`creator:${creatorA}`, `email-thread:${threadId}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET generation=generation+1'),
      [`creator:${creatorA}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET "identityGeneration"=identity.generation'),
      [`creator:${creatorA}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND NOT EXISTS (SELECT 1 FROM "messageThread"'),
      [`creator:${creatorA}`, creatorA],
    );
    await expect(
      service.updateTupleInTransaction({
        contactIdentityKey: `creator:${creatorA}`,
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxOwnerId: null },
        manager,
      }),
    ).rejects.toMatchObject({
      extensions: { triage: { identityGeneration: '2' } },
    });
  });

  it('preserves Creator A tuple for an unlink and invalidates its stale generation', async () => {
    const { manager, query } = managerForCreator(null);
    const service = new MyahInboxContactTriageService();

    await service.ensureSourceContactInTransaction({
      sourceType: 'EMAIL_THREAD',
      sourceRecordId: threadId,
      previousCreatorId: creatorA,
      manager,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "myahInboxContactTriage" creator'),
      [`creator:${creatorA}`, `email-thread:${threadId}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET generation=generation+1'),
      [`creator:${creatorA}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET "identityGeneration"=identity.generation'),
      [`creator:${creatorA}`],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND NOT EXISTS (SELECT 1 FROM "messageThread"'),
      [`creator:${creatorA}`, creatorA],
    );
    await expect(
      service.updateTupleInTransaction({
        contactIdentityKey: `creator:${creatorA}`,
        expectedRevision: 1,
        expectedIdentityGeneration: '1',
        patch: { inboxOwnerId: null },
        manager,
      }),
    ).rejects.toMatchObject({
      extensions: { triage: { identityGeneration: '2' } },
    });
  });
});

describe('MyahInboxContactTriageService source lock', () => {
  const runPersistence = async (
    store: SourceLockStore,
    firstSourceLock?: FirstSourceLock,
  ) => {
    const transaction = store.createManager(firstSourceLock);
    const query = (
      transaction.manager as unknown as {
        queryRunner: {
          query: (sql: string, parameters: string[]) => Promise<unknown[]>;
        };
      }
    ).queryRunner.query;
    try {
      // The real receipt path owns the source advisory acquisition. Pausing this
      // transaction at that acquisition exercises resolution after either lock
      // order rather than merely source-contact initialization.
      const receipt = {
        sequence: '1',
        channel:
          store.source.sourceType === 'EMAIL_THREAD'
            ? ('EMAIL' as const)
            : ('INSTAGRAM' as const),
        persistedMessageId: '00000000-0000-4000-8000-000000000004',
        sourceRecordId: threadId,
        sourceGenerationId: 'race-generation',
        mode: 'LIVE' as const,
        direction: 'INBOUND' as const,
        providerOccurredAt: '2026-09-15T10:00:00.000Z',
        originalCreatedAt: '2026-09-15T10:00:00.000Z',
        normalizedOccurredAt: '2026-09-15T10:00:00.000Z',
        orderKey: `2026-09-15T10:00:00.000Z|${
          store.source.sourceType === 'EMAIL_THREAD' ? 'EMAIL' : 'INSTAGRAM'
        }|race-message`,
      };
      await new MyahInboxContactTriageService().applyReceiptInTransaction(
        receipt,
        transaction.manager,
      );
      await query(
        `UPDATE "myahInboxTriageTransitionReceipt"
         SET status='COMPLETE' WHERE sequence=$1::bigint AND status='PENDING'`,
        [receipt.sequence],
      );
    } finally {
      transaction.release();
    }
  };

  const runCreatorLink = async (
    store: SourceLockStore,
    firstSourceLock?: FirstSourceLock,
  ) => {
    const transaction = store.createManager(firstSourceLock);
    try {
      await (
        transaction.manager as unknown as {
          queryRunner: {
            query: (sql: string, parameters: string[]) => Promise<unknown[]>;
          };
        }
      ).queryRunner.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-source:' || $1, 0))",
        [`${store.source.sourceType}:${threadId}`],
      );
      store.creatorId = creatorId;
      await new MyahInboxContactTriageService().ensureSourceContactInTransaction(
        {
          workspaceId,
          sourceType: store.source.sourceType,
          sourceRecordId: threadId,
          manager: transaction.manager,
        },
      );
    } finally {
      transaction.release();
    }
  };

  it('retires the fallback tuple when persistence acquires the source lock before Creator linking', async () => {
    const store = new SourceLockStore();
    const firstLockAcquired = deferred();
    const releaseFirstLock = deferred();
    const persistence = runPersistence(store, {
      acquired: firstLockAcquired.resolve,
      release: releaseFirstLock.promise,
    });
    await firstLockAcquired.promise;

    let linkCompleted = false;
    const link = runCreatorLink(store).then(() => {
      linkCompleted = true;
    });
    await store.waitForSourceLockWaiter(`EMAIL_THREAD:${threadId}`);
    expect(linkCompleted).toBe(false);

    releaseFirstLock.resolve();
    await Promise.all([persistence, link]);

    expect(store.identities.get(`email-thread:${threadId}`)).toBe(false);
    expect(store.identities.get(`creator:${creatorId}`)).toBe(true);
    expect(store.receiptTransitions).toEqual(
      new Map([[`email-thread:${threadId}`, 1]]),
    );
    expect(store.receiptCompletions).toEqual(new Map([['1', 1]]));
    expect(
      [...store.identities.entries()].filter(([, isActive]) => isActive),
    ).toEqual([[`creator:${creatorId}`, true]]);
  });

  it('never creates an active fallback tuple when Creator linking acquires the source lock first', async () => {
    const store = new SourceLockStore();
    const firstLockAcquired = deferred();
    const releaseFirstLock = deferred();
    const link = runCreatorLink(store, {
      acquired: firstLockAcquired.resolve,
      release: releaseFirstLock.promise,
    });
    await firstLockAcquired.promise;

    let persistenceCompleted = false;
    const persistence = runPersistence(store).then(() => {
      persistenceCompleted = true;
    });
    await store.waitForSourceLockWaiter(`EMAIL_THREAD:${threadId}`);
    expect(persistenceCompleted).toBe(false);

    releaseFirstLock.resolve();
    await Promise.all([link, persistence]);

    expect(store.identities.get(`email-thread:${threadId}`)).not.toBe(true);
    expect(store.identities.get(`creator:${creatorId}`)).toBe(true);
    expect(store.receiptTransitions).toEqual(
      new Map([[`creator:${creatorId}`, 1]]),
    );
    expect(store.receiptCompletions).toEqual(new Map([['1', 1]]));
    expect(
      [...store.identities.entries()].filter(([, isActive]) => isActive),
    ).toEqual([[`creator:${creatorId}`, true]]);
  });

  it('retires the Instagram conversation fallback when message persistence holds the source lock before Creator linking', async () => {
    const store = new SourceLockStore(instagramSourceLockConfig);
    const firstLockAcquired = deferred();
    const releaseFirstLock = deferred();
    const persistence = runPersistence(store, {
      acquired: firstLockAcquired.resolve,
      release: releaseFirstLock.promise,
    });
    await firstLockAcquired.promise;

    let linkCompleted = false;
    const link = runCreatorLink(store).then(() => {
      linkCompleted = true;
    });
    await store.waitForSourceLockWaiter(`INSTAGRAM_CONVERSATION:${threadId}`);
    expect(linkCompleted).toBe(false);

    releaseFirstLock.resolve();
    await Promise.all([persistence, link]);

    expect(store.identities.get(`instagram-conversation:${threadId}`)).toBe(
      false,
    );
    expect(store.receiptTransitions).toEqual(
      new Map([[`instagram-conversation:${threadId}`, 1]]),
    );
    expect(store.receiptCompletions).toEqual(new Map([['1', 1]]));
    expect(
      [...store.identities.entries()].filter(([, isActive]) => isActive),
    ).toEqual([[`creator:${creatorId}`, true]]);
  });

  it('never creates an active Instagram conversation fallback when Creator linking holds the source lock first', async () => {
    const store = new SourceLockStore(instagramSourceLockConfig);
    const firstLockAcquired = deferred();
    const releaseFirstLock = deferred();
    const link = runCreatorLink(store, {
      acquired: firstLockAcquired.resolve,
      release: releaseFirstLock.promise,
    });
    await firstLockAcquired.promise;

    let persistenceCompleted = false;
    const persistence = runPersistence(store).then(() => {
      persistenceCompleted = true;
    });
    await store.waitForSourceLockWaiter(`INSTAGRAM_CONVERSATION:${threadId}`);
    expect(persistenceCompleted).toBe(false);

    releaseFirstLock.resolve();
    await Promise.all([link, persistence]);

    expect(store.identities.get(`instagram-conversation:${threadId}`)).not.toBe(
      true,
    );
    expect(store.receiptTransitions).toEqual(
      new Map([[`creator:${creatorId}`, 1]]),
    );
    expect(store.receiptCompletions).toEqual(new Map([['1', 1]]));
    expect(
      [...store.identities.entries()].filter(([, isActive]) => isActive),
    ).toEqual([[`creator:${creatorId}`, true]]);
  });
});
