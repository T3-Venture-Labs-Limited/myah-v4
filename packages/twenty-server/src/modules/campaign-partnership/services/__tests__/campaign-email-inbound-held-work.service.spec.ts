import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';

const W = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const T = '33333333-3333-4333-8333-333333333333';
const CH = '44444444-4444-4444-8444-444444444444';
const A = '55555555-5555-4555-8555-555555555555';
const G = '66666666-6666-4666-8666-666666666666';
const INC = '77777777-7777-4777-8777-777777777777';
const after = '2026-09-28T12:00:00.000Z';
const input = {
  workspaceId: W,
  messageId: M,
  threadId: T,
  channelId: CH,
  connectedAccountId: A,
  generationId: G,
  providerMessageId: 'provider-1',
  providerThreadId: 'thread-1',
  from: 'creator@example.test',
  to: 'brand@example.test',
  providerOccurredAt: new Date(after),
};
const make = () => {
  const rows: Record<string, unknown>[] = [];
  const collisions: unknown[][] = [];
  let ready = true;
  let incarnation = INC;
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('information_schema.columns'))
      return ready ? [{ present: 11 }] : [];
    if (sql.includes('campaignEmailBaselineGeneration'))
      return ready
        ? [
            {
              id: G,
              accountIncarnationId: incarnation,
              completedAt: new Date('2026-09-28T11:00:00Z'),
            },
          ]
        : [];
    if (
      sql.includes('FROM "message" m') ||
      sql.includes('FROM "campaignEmailConversationBinding"')
    ) {
      if (sql.includes('FROM "message" m'))
        return [
          {
            id: params?.[0],
            messageThreadId: T,
            receivedAt: new Date(after),
            createdAt: new Date(after),
            isDraft: false,
            direction: 'INCOMING',
            creatorId: '88888888-8888-4888-8888-888888888888',
          },
        ];
      if (sql.includes('campaignEmailConversationBinding'))
        return [{ id: '99999999-9999-4999-8999-999999999999' }];
    }
    if (sql.includes('INSERT INTO core."campaignEmailWorkCollision"')) {
      if (
        collisions.some(
          (item) =>
            item[2] === params?.[2] &&
            item[7] === params?.[7] &&
            item[13] === params?.[13],
        )
      )
        return [];
      collisions.push(params ?? []);
      return [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }];
    }
    if (sql.includes('FROM core."campaignEmailWorkCollision"')) {
      return collisions
        .filter((item) => item[13] === params?.[5])
        .map((item) => ({
          originalWorkId: item[1],
          canonicalMessageId: item[2],
          providerMessageId: item[7],
          messageThreadId: item[3],
          connectedAccountId: item[5],
          providerThreadId: item[8],
          creatorSender: item[9],
          accountRecipient: item[10],
          baselineGenerationId: item[11],
          providerOccurredAt: item[12],
          sourceFingerprint: item[13],
        }));
    }
    if (sql.includes('INSERT INTO core."campaignPartnershipWorkItem"')) {
      if (rows.some((row) => (row.params as unknown[])[1] === params?.[1]))
        return [];
      rows.push({
        params,
        state: 'HELD',
        contextGeneration: 0,
        reason: 'AWAITING_OPERATOR_ACCESS',
      });
      return [{ id: M }];
    }
    if (sql.includes('UPDATE core."campaignPartnershipWorkItem"')) {
      const row = rows.find(
        (item) => (item.params as unknown[])[7] === params?.[2],
      );
      if (row && row.state !== 'COMPLETED')
        Object.assign(row, {
          state: 'HELD',
          reason: 'PROVIDER_ID_COLLISION',
          contextGeneration: Number(row.contextGeneration) + 1,
        });
      return [row ? [{ id: M }] : [], row ? 1 : 0];
    }
    if (sql.includes('FROM core."campaignPartnershipWorkItem"')) {
      const original = rows.find(
        (row) => (row.params as unknown[])[1] === params?.[1],
      );
      if (!original) return [];
      const source = original.params as unknown[];
      return [
        {
          id: M,
          state: original.state,
          reason: original.reason,
          canonicalMessageId: source[2],
          providerMessageId: source[7],
          messageChannelId: source[4],
          accountIncarnationId: source[6],
          connectedAccountId: source[5],
          messageThreadId: source[3],
          providerThreadId: source[8],
          creatorSender: source[9],
          accountRecipient: source[10],
          baselineGenerationId: source[11],
          providerOccurredAt: source[13],
        },
      ];
    }
    return [];
  });
  const manager = {
    queryRunner: { isTransactionActive: true, isReleased: false, query },
  };
  const service = new CampaignEmailInboundHeldWorkService();
  return {
    query,
    rows,
    collisions,
    manager,
    service,
    setReady: (value: boolean) => {
      ready = value;
    },
    setIncarnation: (value: string) => {
      incarnation = value;
    },
  };
};

describe('canonical importer HELD reply receipt', () => {
  it('writes a source-qualified neutral HELD receipt, never PENDING, in the supplied transaction', async () => {
    const f = make();
    await expect(
      f.service.recordInTransaction(input, f.manager as never),
    ).resolves.toEqual('HELD');
    const sql = f.query.mock.calls.find(([text]) =>
      text.includes('INSERT INTO core."campaignPartnershipWorkItem"'),
    )?.[0];
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(f.rows).toHaveLength(1);
    expect(JSON.stringify(f.rows[0])).toContain('provider-1');
    expect(JSON.stringify(f.rows[0])).not.toContain('PENDING');
  });
  it('reuses the exact provider receipt, separates a colliding canonical UUID on another channel and never rewrites the first', async () => {
    const f = make();
    await expect(
      f.service.recordInTransaction(input, f.manager as never),
    ).resolves.toBe('HELD');
    await expect(
      f.service.recordInTransaction(input, f.manager as never),
    ).resolves.toBe('HELD');
    expect(f.rows).toHaveLength(1);
    await expect(
      f.service.recordInTransaction(
        { ...input, channelId: A },
        f.manager as never,
      ),
    ).resolves.toBe('HELD');
    expect(f.rows).toHaveLength(2);
    expect((f.rows[0].params as unknown[])[1]).not.toEqual(
      (f.rows[1].params as unknown[])[1],
    );
  });
  it('separates the same provider ID after reconnect into a new account incarnation', async () => {
    const f = make();
    await f.service.recordInTransaction(input, f.manager as never);
    f.setIncarnation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await expect(
      f.service.recordInTransaction(input, f.manager as never),
    ).resolves.toBe('HELD');
    expect(f.rows).toHaveLength(2);
    expect((f.rows[0].params as unknown[])[1]).not.toEqual(
      (f.rows[1].params as unknown[])[1],
    );
  });
  it('quarantines a previously pending receipt on provider replay mapped to another canonical message', async () => {
    const f = make();
    await expect(
      f.service.recordInTransaction(input, f.manager as never),
    ).resolves.toBe('HELD');
    f.rows[0].state = 'PENDING';
    await expect(
      f.service.recordInTransaction(
        { ...input, messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        f.manager as never,
      ),
    ).resolves.toBe('HELD');
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({
      state: 'HELD',
      reason: 'PROVIDER_ID_COLLISION',
      contextGeneration: 1,
    });
    expect(f.collisions).toHaveLength(1);
    expect(f.collisions[0]).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const generation = f.rows[0].contextGeneration;
    await f.service.recordInTransaction(
      { ...input, messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      f.manager as never,
    );
    expect(f.collisions).toHaveLength(1);
    expect(f.rows[0].contextGeneration).toBe(generation);
  });
  it('holds PENDING and retains distinct same-canonical conflicting snapshots; exact replays stay idempotent', async () => {
    const f = make();
    expect(await f.service.recordInTransaction(input, f.manager as never)).toBe(
      'HELD',
    );
    f.rows[0].state = 'PENDING';
    const changedTime = {
      ...input,
      providerOccurredAt: new Date('2026-09-28T11:30:00Z'),
    };
    expect(
      await f.service.recordInTransaction(changedTime, f.manager as never),
    ).toBe('HELD');
    expect(f.rows[0]).toMatchObject({
      state: 'HELD',
      reason: 'PROVIDER_ID_COLLISION',
    });
    expect(f.collisions).toHaveLength(1);
    expect(
      await f.service.recordInTransaction(changedTime, f.manager as never),
    ).toBe('HELD');
    expect(f.collisions).toHaveLength(1);
    const changedSender = {
      ...changedTime,
      from: 'second-creator@example.test',
    };
    expect(
      await f.service.recordInTransaction(changedSender, f.manager as never),
    ).toBe('HELD');
    expect(f.collisions).toHaveLength(2);
    expect(f.collisions[0][13]).not.toEqual(f.collisions[1][13]);
  });
  it('retains already completed or unknown original work and still records same-canonical conflicting evidence', async () => {
    for (const state of ['COMPLETED', 'FAILED']) {
      const f = make();
      await f.service.recordInTransaction(input, f.manager as never);
      f.rows[0].state = state;
      expect(
        await f.service.recordInTransaction(
          { ...input, providerOccurredAt: new Date('2026-09-28T11:30:00Z') },
          f.manager as never,
        ),
      ).toBe('HELD');
      expect(f.rows[0].state).toBe(state);
      expect(f.collisions).toHaveLength(1);
    }
  });
  it('retains an already completed original and still records the later collision', async () => {
    const f = make();
    await f.service.recordInTransaction(input, f.manager as never);
    f.rows[0].state = 'COMPLETED';
    await f.service.recordInTransaction(
      { ...input, messageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      f.manager as never,
    );
    expect(f.rows[0].state).toBe('COMPLETED');
    expect(f.collisions).toHaveLength(1);
  });
  it('does not insert when schema/frontier is missing or event is historical', async () => {
    const f = make();
    f.setReady(false);
    await expect(
      f.service.recordInTransaction(input, f.manager as never),
    ).resolves.toBe('SKIPPED');
    f.setReady(true);
    await expect(
      f.service.recordInTransaction(
        { ...input, providerOccurredAt: new Date('2026-09-28T10:00:00Z') },
        f.manager as never,
      ),
    ).resolves.toBe('SKIPPED');
    expect(f.rows).toHaveLength(0);
  });
});
