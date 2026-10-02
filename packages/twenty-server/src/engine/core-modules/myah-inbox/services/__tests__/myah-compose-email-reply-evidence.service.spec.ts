import { MyahComposeEmailSendService } from '../myah-compose-email-send.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const channelId = '00000000-0000-4000-8000-000000000002';
const inboundId = '00000000-0000-4000-8000-000000000003';
const threadId = '00000000-0000-4000-8000-000000000004';
const creatorId = '00000000-0000-4000-8000-000000000005';
const firstSendId = '00000000-0000-4000-8000-000000000006';
const secondSendId = '00000000-0000-4000-8000-000000000007';
const startedAt = new Date('2026-09-29T12:00:00Z');
const receivedAt = new Date('2026-09-29T12:01:00Z');

const firstSend = {
  id: firstSendId,
  creatorId,
  providerHeaderMessageId: '<first@example.test>',
  sendStartedAt: startedAt,
};
const secondSend = {
  id: secondSendId,
  creatorId,
  providerHeaderMessageId: '<second@example.test>',
  sendStartedAt: new Date('2026-09-29T12:02:00Z'),
};
const inbound = (overrides = {}) => ({
  workspaceId,
  messageChannelId: channelId,
  inboundEvidenceId: inboundId,
  inboundMessageThreadId: threadId,
  threadExternalId: 'thread-1',
  fromHandle: ' CREATOR@EXAMPLE.TEST ',
  inReplyToTokens: ['<first@example.test>'],
  coveredCreatorIds: [creatorId],
  ...overrides,
});

const harness = (
  sends: Array<
    Omit<typeof firstSend, 'creatorId'> & { creatorId: string | null }
  > = [firstSend],
  occurredAt = receivedAt,
  ready = true,
  binding = { triageReady: false, campaignBlocked: false },
) => {
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('to_regclass'))
      return [
        {
          exists: sql.includes('myahInboxTriageMigration')
            ? binding.triageReady
            : ready,
          ready: sql.includes('myahInboxTriageMigration')
            ? binding.triageReady
            : ready,
        },
      ];
    if (sql.includes('AS "blocked"'))
      return [{ blocked: binding.campaignBlocked }];
    if (sql.includes('FROM core."myahComposeReplyEvidence"'))
      return [
        {
          creatorId,
          messageChannelId: channelId,
          composeSendId: firstSendId,
        },
      ];
    if (sql.includes('FROM core."myahComposeEmailSend"')) {
      const sender = params?.[3];
      const thread = params?.[2];
      const matches =
        params?.[1] === channelId &&
        (Array.isArray(sender)
          ? sender.includes('creator@example.test')
          : sender === 'creator@example.test') &&
        (Array.isArray(thread)
          ? thread.includes('thread-1')
          : thread === 'thread-1');
      return matches ? sends : [];
    }
    if (sql.includes('FROM "message"') || sql.includes('."message"'))
      return [{ receivedAt: occurredAt }];
    return [];
  });
  const manager = {
    queryRunner: { isTransactionActive: true, query },
  } as never;
  (manager as { queryRunner: { manager?: unknown } }).queryRunner.manager =
    manager;
  const lifecycle = {
    withPreparedSourceMutationInTransaction: jest.fn(async ({ mutate }) =>
      mutate(),
    ),
  };
  const service = new MyahComposeEmailSendService(
    {} as never,
    lifecycle as never,
  );

  return { service, manager, query, lifecycle };
};

const inserted = (query: jest.Mock) =>
  query.mock.calls.filter(([sql]) =>
    sql.includes('INSERT INTO core."myahComposeReplyEvidence"'),
  );

describe('Compose reply evidence', () => {
  it('prepares only matching To-recipient Creator locks on the same channel and thread', async () => {
    const { service, manager, query } = harness();

    const ids = await service.prepareInboundCandidateCreatorsInTransaction(
      {
        workspaceId,
        messageChannelId: channelId,
        candidates: [
          {
            threadExternalId: 'thread-1',
            normalizedSender: 'CREATOR@EXAMPLE.TEST',
          },
        ],
      },
      manager,
    );

    expect(ids).toEqual([creatorId]);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('"messageChannelId"');
    expect(sql).toContain('"resolvedThreadExternalId"');
    expect(sql).toContain('"normalizedTo"');
  });

  it('records an EXACT parent for a To reply, even after a newer send', async () => {
    const { service, manager, query } = harness([firstSend, secondSend]);

    await service.reconcileInboundMessageInTransaction(inbound(), manager);

    expect(inserted(query)).toHaveLength(1);
    expect(inserted(query)[0][1]).toEqual(
      expect.arrayContaining(['EXACT', firstSendId]),
    );
  });

  it('records a THREAD reply when no parent is proven and it arrived after the send started', async () => {
    const { service, manager, query } = harness();

    await service.reconcileInboundMessageInTransaction(
      inbound({ inReplyToTokens: [] }),
      manager,
    );

    expect(inserted(query)).toHaveLength(1);
    expect(inserted(query)[0][1]).toEqual(
      expect.arrayContaining(['THREAD', null, creatorId]),
    );
  });

  it('does not bind a THREAD reply when an earlier candidate send has no Creator', async () => {
    const { service, manager, query } = harness([
      firstSend,
      {
        ...secondSend,
        creatorId: null,
        sendStartedAt: new Date('2026-09-29T12:00:30Z'),
      },
    ]);

    await service.reconcileInboundMessageInTransaction(
      inbound({ inReplyToTokens: [] }),
      manager,
    );

    expect(inserted(query)[0][1][3]).toBeNull();
  });

  it('never borrows a Creator from a send started after a THREAD reply', async () => {
    const { service, manager, query } = harness([
      { ...firstSend, creatorId: null },
      secondSend,
    ]);

    await service.reconcileInboundMessageInTransaction(
      inbound({ inReplyToTokens: [] }),
      manager,
    );

    expect(inserted(query)[0][1][3]).toBeNull();
    expect(inserted(query)[0][1][4]).toBe('THREAD');
  });

  it("does not borrow another send's Creator for an EXACT reply to a send without origin", async () => {
    const { service, manager, query } = harness([
      firstSend,
      { ...secondSend, creatorId: null },
    ]);

    await service.reconcileInboundMessageInTransaction(
      inbound({ inReplyToTokens: ['<second@example.test>'] }),
      manager,
    );

    expect(inserted(query)[0][1][3]).toBeNull();
    expect(inserted(query)[0][1][5]).toBe(secondSendId);
    const selectedCreator = query.mock.calls.find(([sql]) =>
      sql.includes('FROM core."myahComposeReplyEvidence"'),
    )?.[0];
    expect(selectedCreator).toContain(
      `CASE WHEN ev."classification"='EXACT' THEN s."creatorId"`,
    );
    expect(selectedCreator).not.toContain('COALESCE');
  });

  it('does not assign an ambiguous THREAD reply to either Creator', async () => {
    const { service, manager, query } = harness([
      firstSend,
      {
        ...secondSend,
        creatorId: 'other-creator',
        sendStartedAt: new Date('2026-09-29T12:00:30Z'),
      },
    ]);

    await service.reconcileInboundMessageInTransaction(
      inbound({ inReplyToTokens: [] }),
      manager,
    );

    expect(inserted(query)[0][1][3]).toBeNull();
    expect(inserted(query)[0][1][4]).toBe('THREAD');
  });

  it.each([
    ['CC-only recipient', { fromHandle: 'cc@example.test' }],
    ['BCC-only recipient', { fromHandle: 'bcc@example.test' }],
    ['other sender', { fromHandle: 'other@example.test' }],
    ['other thread', { threadExternalId: 'other-thread' }],
    ['other channel', { messageChannelId: 'other-channel' }],
  ])('does not attribute a %s', async (_reason, overrides) => {
    const { service, manager, query } = harness();

    await service.reconcileInboundMessageInTransaction(
      inbound(overrides),
      manager,
    );

    expect(inserted(query)).toHaveLength(0);
  });

  it('does not record thread-only mail received before the send', async () => {
    const { service, manager, query } = harness(
      [firstSend],
      new Date('2026-09-29T11:59:00Z'),
    );

    await service.reconcileInboundMessageInTransaction(
      inbound({ inReplyToTokens: [] }),
      manager,
    );

    expect(inserted(query)).toHaveLength(0);
  });

  it('uses an idempotent insert and only promotes THREAD to EXACT', async () => {
    const { service, manager, query } = harness();

    await service.reconcileInboundMessageInTransaction(inbound(), manager);
    await service.reconcileInboundMessageInTransaction(inbound(), manager);

    expect(inserted(query)).toHaveLength(2);
    expect(inserted(query)[0][0]).toMatch(/ON CONFLICT.*DO UPDATE/s);
    expect(inserted(query)[0][0]).toContain('"classification"=\'THREAD\'');
    expect(inserted(query)[0][0]).toContain(
      'EXCLUDED."classification"=\'EXACT\'',
    );
  });

  it('binds a verified reply to an unlinked thread under covered source/Creator locks without setting a Campaign', async () => {
    const { service, manager, query, lifecycle } = harness(
      [firstSend],
      receivedAt,
      true,
      { triageReady: true, campaignBlocked: false },
    );

    await service.reconcileInboundMessageInTransaction(inbound(), manager);

    expect(
      lifecycle.withPreparedSourceMutationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'EMAIL_THREAD',
        sourceRecordIds: [threadId],
        coveredCreatorIds: [creatorId],
        nextCreatorIds: [creatorId],
      }),
    );
    const update = query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE "messageThread"'),
    );
    expect(update?.[0]).toContain('"creatorId" IS NULL');
    expect(update?.[0]).not.toContain('"myahCampaignId"');
  });

  it('keeps evidence when a concurrent receipt introduced a Creator outside the prepared lock set', async () => {
    const { service, manager, query, lifecycle } = harness(
      [firstSend],
      receivedAt,
      true,
      { triageReady: true, campaignBlocked: false },
    );
    lifecycle.withPreparedSourceMutationInTransaction.mockImplementationOnce(
      async () => {
        throw new Error('Creator lock is not covered');
      },
    );

    await expect(
      service.reconcileInboundMessageInTransaction(
        inbound({ coveredCreatorIds: [] }),
        manager,
      ),
    ).resolves.toBeUndefined();
    expect(inserted(query)).toHaveLength(1);
    expect(
      lifecycle.withPreparedSourceMutationInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('never binds Compose when Campaign evidence or reconciliation is pending', async () => {
    const { service, manager, lifecycle } = harness(
      [firstSend],
      receivedAt,
      true,
      { triageReady: true, campaignBlocked: true },
    );

    await service.reconcileInboundMessageInTransaction(inbound(), manager);

    expect(
      lifecycle.withPreparedSourceMutationInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('skips workspaces without the additive evidence table', async () => {
    const { service, manager, query } = harness([firstSend], receivedAt, false);

    await service.reconcileInboundMessageInTransaction(inbound(), manager);

    expect(inserted(query)).toHaveLength(0);
  });
});
