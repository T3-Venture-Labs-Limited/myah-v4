import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  messageChannelId: '00000000-0000-4000-8000-000000000002',
  threadExternalId: 'thread',
  fromHandle: 'creator@example.com',
  inboundEvidenceId: '00000000-0000-4000-8000-000000000003',
  inboundMessageThreadId: '00000000-0000-4000-8000-000000000007',
};

describe('CampaignReplyService', () => {
  it.each([
    {
      tokens: ['<unrelated>', '<sent@example.com>'],
      classification: 'EXACT',
      triageReady: true,
    },
    { tokens: [], classification: 'THREAD', triageReady: true },
    {
      tokens: [],
      classification: 'THREAD',
      triageReady: true,
      skipProgression: true,
    },
    { tokens: [], classification: 'THREAD', triageReady: false },
  ])(
    'records $classification accepted outreach evidence without ACTIVE progression (triage: $triageReady)',
    async ({ tokens, classification, triageReady, skipProgression }) => {
      const progression = { terminalizeReplyInTransaction: jest.fn() };
      const query = jest.fn(
        async (sql: string, _params?: readonly unknown[]) => {
          if (sql.includes('to_regclass($1)')) return [{ ready: triageReady }];
          if (sql.includes('to_regclass')) return [{ exists: true }];
          if (sql.includes("a.\"attemptState\" IN ('PROCESSING','UNKNOWN')"))
            return [];
          if (
            sql.includes('FROM core."outboundEmailAttempt"') &&
            !sql.includes("e.state='ACTIVE'")
          )
            return [
              {
                workspaceId: input.workspaceId,
                campaignId: 'campaign-a',
                enrollmentId: 'enrollment-a',
                attemptId: 'attempt-a',
                creatorId: 'creator-a',
                providerHeaderMessageId: '<sent@example.com>',
                afterAcceptance: true,
              },
            ];
          return [];
        },
      );
      const manager = { queryRunner: undefined as any };
      manager.queryRunner = { isTransactionActive: true, manager, query };
      const evidenceInput = {
        ...input,
        inReplyToTokens: tokens,
        coveredCreatorIds: ['creator-a'],
        skipProgression,
      };
      const lifecycle = {
        withPreparedSourceMutationInTransaction: jest.fn(async ({ mutate }) =>
          mutate(),
        ),
      };

      await new CampaignReplyService(
        progression as never,
        undefined,
        lifecycle as never,
      ).reconcileInboundMessageInTransaction(evidenceInput, manager as never);
      if (triageReady) {
        expect(
          lifecycle.withPreparedSourceMutationInTransaction,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceType: 'EMAIL_THREAD',
            sourceRecordIds: [input.inboundMessageThreadId],
            nextCreatorIds: ['creator-a'],
            coveredCreatorIds: ['creator-a'],
          }),
        );
      } else {
        expect(
          lifecycle.withPreparedSourceMutationInTransaction,
        ).not.toHaveBeenCalled();
      }

      const insert = query.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
      );
      expect(insert).toBeDefined();
      expect(insert?.[0]).toContain('ON CONFLICT');
      expect(insert?.[1]).toContain(classification);
      if (classification === 'EXACT')
        expect(insert?.[1]).toContain('attempt-a');
      else expect(insert?.[1]).not.toContain('attempt-a');
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes(
            "a.source='CAMPAIGN_SEQUENCE' AND a.\"attemptState\"='ACCEPTED'",
          ),
        ),
      ).toBe(true);
      expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
      expect(
        query.mock.calls.some(([sql]) => sql.includes("e.state='ACTIVE'")),
      ).toBe(!skipProgression);
      expect(
        query.mock.calls.some(
          ([sql]) =>
            sql.includes('UPDATE "messageThread"') &&
            sql.includes('"creatorId" IS NULL OR "creatorId"=$1') &&
            sql.includes('"myahCampaignId" IS NULL OR "myahCampaignId"=$2') &&
            sql.includes('("creatorId" IS NULL OR "myahCampaignId" IS NULL)'),
        ),
      ).toBe(triageReady);
    },
  );

  it('retains a pending reply to an UNKNOWN follow-up beside older accepted proof', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const attempts = [
      {
        workspaceId: input.workspaceId,
        campaignId: 'campaign-a',
        enrollmentId: 'enrollment-a',
        attemptId: 'attempt-one',
        attemptState: 'ACCEPTED',
        providerHeaderMessageId: '<sent-one@example.com>',
        creatorId: 'creator-a',
      },
      {
        workspaceId: input.workspaceId,
        campaignId: 'campaign-a',
        enrollmentId: 'enrollment-a',
        attemptId: 'attempt-three',
        attemptState: 'UNKNOWN',
        providerHeaderMessageId: null,
        creatorId: 'creator-a',
      },
    ];
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('to_regclass')) return [{ exists: true }];
      if (
        sql.includes('FROM core."outboundEmailAttempt"') &&
        !sql.includes("e.state='ACTIVE'")
      ) {
        if (sql.includes('a."attemptState"=\'ACCEPTED\'')) {
          return attempts.filter(
            ({ attemptState }) => attemptState === 'ACCEPTED',
          );
        }
        return attempts.filter(
          ({ attemptState }) => attemptState === 'UNKNOWN',
        );
      }
      return [];
    });
    const manager = { queryRunner: undefined as any };
    manager.queryRunner = { isTransactionActive: true, manager, query };

    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(
      {
        ...input,
        inReplyToTokens: [' <sent-three@example.com> '],
      },
      manager as never,
    );

    const evidenceInsert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
    );
    const pendingInsert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO core."myahCampaignReplyPending"'),
    );

    expect(evidenceInsert).toBeUndefined();
    expect(pendingInsert?.[0]).toContain('ON CONFLICT');
    expect(pendingInsert?.[1]).toContain('creator@example.com');
    expect(pendingInsert?.[1]).toContainEqual(['<sent-three@example.com>']);
    expect(pendingInsert?.[1]).toContainEqual(['attempt-three']);
    expect(
      query.mock.calls.some(([sql]) => sql.includes("e.state='ACTIVE'")),
    ).toBe(false);
  });

  it('does not freeze an older enrollment as THREAD evidence while an unresolved follow-up could belong to another enrollment', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ exists: true }];
      if (sql.includes("a.\"attemptState\" IN ('PROCESSING','UNKNOWN')"))
        return [{ attemptId: 'unresolved-b' }];
      if (
        sql.includes('FROM core."outboundEmailAttempt"') &&
        !sql.includes("e.state='ACTIVE'")
      )
        return [
          {
            workspaceId: input.workspaceId,
            campaignId: 'campaign-a',
            enrollmentId: 'enrollment-a',
            attemptId: 'accepted-a',
            providerHeaderMessageId: '<first@example.com>',
          },
        ];
      return [];
    });
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const manager = { queryRunner: undefined as any };
    manager.queryRunner = { isTransactionActive: true, manager, query };

    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(
      { ...input, inReplyToTokens: ['<unresolved-b@example.com>'] },
      manager as never,
    );

    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO core."myahCampaignReplyPending"'),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
      ),
    ).toBe(false);
  });

  it('does not claim an exact parent when tokens match two accepted sends or choose competing enrollments', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const attempts = [
      {
        workspaceId: input.workspaceId,
        campaignId: 'campaign-a',
        enrollmentId: 'enrollment-a',
        attemptId: 'attempt-a',
        providerHeaderMessageId: '<a>',
        afterAcceptance: true,
      },
      {
        workspaceId: input.workspaceId,
        campaignId: 'campaign-a',
        enrollmentId: 'enrollment-a',
        attemptId: 'attempt-b',
        providerHeaderMessageId: '<b>',
        afterAcceptance: true,
      },
    ];
    const query = jest.fn(async (sql: string, _params?: readonly unknown[]) =>
      sql.includes('to_regclass')
        ? [{ exists: true }]
        : sql.includes("a.\"attemptState\" IN ('PROCESSING','UNKNOWN')")
          ? []
          : sql.includes('FROM core."outboundEmailAttempt"') &&
              !sql.includes("e.state='ACTIVE'")
            ? attempts
            : [],
    );
    const manager = { queryRunner: undefined as any };
    manager.queryRunner = { isTransactionActive: true, manager, query };
    const service = new CampaignReplyService(progression as never);
    const evidenceInput = { ...input, inReplyToTokens: ['<a>', '<b>'] };

    await service.reconcileInboundMessageInTransaction(
      evidenceInput,
      manager as never,
    );
    const insert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
    );
    expect(insert?.[1]).toContain('THREAD');
    expect(insert?.[1]).not.toContain('attempt-a');
    expect(insert?.[1]).not.toContain('attempt-b');
    await service.reconcileInboundMessageInTransaction(
      evidenceInput,
      manager as never,
    );
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
      ),
    ).toHaveLength(2);

    attempts[1] = { ...attempts[1], enrollmentId: 'enrollment-b' };
    query.mockClear();
    await service.reconcileInboundMessageInTransaction(
      evidenceInput,
      manager as never,
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
      ),
    ).toBe(false);
  });

  it.each([
    {
      outcome: 'terminal follow-up',
      accepted: [
        {
          campaignId: 'campaign-a',
          enrollmentId: 'enrollment-a',
          attemptId: 'accepted-a',
          providerHeaderMessageId: '<a>',
          afterAcceptance: true,
        },
      ],
      expectedClassification: 'THREAD',
      acceptedGroupCount: 1,
    },
    {
      outcome: 'accepted same-enrollment follow-up',
      accepted: [
        {
          campaignId: 'campaign-a',
          enrollmentId: 'enrollment-a',
          attemptId: 'accepted-a',
          providerHeaderMessageId: '<a>',
          afterAcceptance: true,
        },
        {
          campaignId: 'campaign-a',
          enrollmentId: 'enrollment-a',
          attemptId: 'accepted-b',
          providerHeaderMessageId: '<b>',
          afterAcceptance: false,
        },
      ],
      expectedClassification: 'EXACT',
      acceptedGroupCount: 1,
    },
    {
      outcome: 'accepted competing-enrollment follow-up',
      accepted: [
        {
          campaignId: 'campaign-a',
          enrollmentId: 'enrollment-a',
          attemptId: 'accepted-a',
          providerHeaderMessageId: '<a>',
          afterAcceptance: true,
        },
        {
          campaignId: 'campaign-b',
          enrollmentId: 'enrollment-b',
          attemptId: 'accepted-b',
          providerHeaderMessageId: '<b>',
          afterAcceptance: false,
        },
      ],
      expectedClassification: null,
      acceptedGroupCount: 2,
    },
  ])(
    'replays pending after $outcome without a false Campaign claim',
    async ({ accepted, expectedClassification, acceptedGroupCount }) => {
      const query = jest.fn(
        async (sql: string, _params?: readonly unknown[]) => {
          if (
            sql.includes('FROM core."myahCampaignReplyPending"') &&
            !sql.includes(' AS "hasUnresolved"')
          )
            return [
              {
                messageThreadId: input.inboundMessageThreadId,
                messageChannelId: input.messageChannelId,
                threadExternalId: input.threadExternalId,
                normalizedSender: input.fromHandle,
                inReplyToHeaderMessageIds: ['<b>'],
                candidateAttemptIds: ['accepted-b'],
                candidateOverflow: false,
              },
            ];
          if (sql.includes('to_regclass')) return [{ exists: true }];
          if (sql.includes('AS "hasUnresolved"'))
            return [
              {
                classification: expectedClassification,
                hasUnresolved: false,
                acceptedGroupCount,
              },
            ];
          if (sql.includes("a.\"attemptState\" IN ('PROCESSING','UNKNOWN')"))
            return [];
          if (
            sql.includes('FROM core."outboundEmailAttempt"') &&
            !sql.includes("e.state='ACTIVE'")
          )
            return accepted;
          return [];
        },
      );
      const manager = { queryRunner: undefined as any };
      manager.queryRunner = { isTransactionActive: true, manager, query };

      await new CampaignReplyService({
        terminalizeReplyInTransaction: jest.fn(),
      } as never).reconcilePendingMessageInTransaction(
        {
          workspaceId: input.workspaceId,
          inboundEvidenceId: input.inboundEvidenceId,
        },
        manager as never,
      );

      const attemptLock = query.mock.calls.findIndex(([sql]) =>
        sql.includes('ORDER BY a."attemptId" FOR UPDATE OF a,e'),
      );
      const pendingLock = query.mock.calls.findIndex(
        ([sql]) =>
          sql.includes('FROM core."myahCampaignReplyPending"') &&
          sql.includes('FOR UPDATE SKIP LOCKED'),
      );
      expect(attemptLock).toBeGreaterThan(-1);
      expect(attemptLock).toBeLessThan(pendingLock);

      const evidenceInsert = query.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
      );
      if (expectedClassification === null)
        expect(evidenceInsert).toBeUndefined();
      else expect(evidenceInsert?.[1]).toContain(expectedClassification);
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('DELETE FROM core."myahCampaignReplyPending"'),
        ),
      ).toBe(true);
    },
  );

  it('defers pending replay while the workspace triage marker is migrating', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM core."myahCampaignReplyPending"'))
        return [
          {
            messageThreadId: input.inboundMessageThreadId,
            messageChannelId: input.messageChannelId,
            threadExternalId: input.threadExternalId,
            normalizedSender: input.fromHandle,
          },
        ];
      if (sql.includes('to_regclass($1)')) return [{ ready: true }];
      if (sql.includes('SELECT status FROM "myahInboxTriageMigration"'))
        return [{ status: 'MIGRATING' }];
      return [];
    });
    const manager = { queryRunner: undefined as any };
    manager.queryRunner = { isTransactionActive: true, manager, query };

    await new CampaignReplyService({
      terminalizeReplyInTransaction: jest.fn(),
    } as never).reconcilePendingMessageInTransaction(
      {
        workspaceId: input.workspaceId,
        inboundEvidenceId: input.inboundEvidenceId,
      },
      manager as never,
    );

    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('SELECT status FROM "myahInboxTriageMigration"'),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes('FOR UPDATE SKIP LOCKED') ||
          sql.includes('INSERT INTO core."myahCampaignReplyEvidence"'),
      ),
    ).toBe(false);
  });

  it('does nothing when no accepted Campaign attempt matches inbound evidence', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const query = jest.fn(
      async (_sql: string, _parameters: readonly unknown[]) => [],
    );
    const manager = {
      queryRunner: undefined as any,
      createQueryBuilder: jest.fn(),
    };
    manager.queryRunner = {
      isTransactionActive: true,
      manager,
      query,
    };
    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(input, manager as never);
    expect(query.mock.calls[0][0]).not.toContain('a."campaignExecutionId"');
    expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('collapses multiple accepted attempts for one enrollment into one reply match', async () => {
    const progression = {
      terminalizeReplyInTransaction: jest.fn(async () => ({
        status: 'REPLIED',
      })),
    };
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const match = {
      workspaceId: input.workspaceId,
      campaignId: '00000000-0000-4000-8000-000000000004',
      enrollmentId: '00000000-0000-4000-8000-000000000005',
      campaignCreatorId: '00000000-0000-4000-8000-000000000006',
      messageChannelId: input.messageChannelId,
    };
    const manager = {
      queryRunner: undefined as any,
      createQueryBuilder: jest.fn(() => builder),
    };
    manager.queryRunner = {
      isTransactionActive: true,
      manager,
      query: jest.fn(async () => [match, { ...match, attemptId: 'other' }]),
    };
    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(input, manager as never);
    expect(progression.terminalizeReplyInTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not choose between distinct matching enrollments', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const manager = {
      queryRunner: undefined as any,
      createQueryBuilder: jest.fn(),
    };
    manager.queryRunner = {
      isTransactionActive: true,
      manager,
      query: jest.fn(async () => [
        {
          workspaceId: input.workspaceId,
          campaignId: 'a',
          enrollmentId: 'one',
          messageChannelId: input.messageChannelId,
        },
        {
          workspaceId: input.workspaceId,
          campaignId: 'b',
          enrollmentId: 'two',
          messageChannelId: input.messageChannelId,
        },
      ]),
    };
    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(input, manager as never);
    expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
  });

  it('terminalizes one exact Campaign match and scopes the Campaign Creator stage CAS to that Campaign', async () => {
    const campaignId = '00000000-0000-4000-8000-000000000004';
    const campaignCreatorId = '00000000-0000-4000-8000-000000000006';
    const progression = {
      terminalizeReplyInTransaction: jest.fn(async () => ({
        status: 'REPLIED',
      })),
    };
    const query = jest.fn(
      async (sql: string, _parameters?: readonly unknown[]) => {
        if (sql.includes('FROM core."outboundEmailAttempt"'))
          return [
            {
              workspaceId: input.workspaceId,
              campaignId,
              enrollmentId: '00000000-0000-4000-8000-000000000005',
              campaignCreatorId,
            },
          ];
        if (sql.includes('UPDATE') && sql.includes('"campaignCreator"'))
          return [{ id: campaignCreatorId }];
        return [];
      },
    );
    const manager = {
      queryRunner: undefined as any,
      createQueryBuilder: jest.fn(() => {
        throw new Error('Cannot get entity metadata for alias campaignCreator');
      }),
    };
    manager.queryRunner = {
      isTransactionActive: true,
      manager,
      query,
    };
    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(input, manager as never);
    expect(progression.terminalizeReplyInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ inboundEvidenceId: input.inboundEvidenceId }),
      manager,
    );
    const stageUpdate = query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE') && sql.includes('"campaignCreator"'),
    );
    expect(stageUpdate?.[0]).toContain('id=$1 AND "campaignId"=$2');
    expect(stageUpdate?.[1]).toEqual([campaignCreatorId, campaignId]);
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });
});
