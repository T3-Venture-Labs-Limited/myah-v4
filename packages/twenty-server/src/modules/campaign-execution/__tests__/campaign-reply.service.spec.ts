import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  messageChannelId: '00000000-0000-4000-8000-000000000002',
  threadExternalId: 'thread',
  fromHandle: 'creator@example.com',
  inboundEvidenceId: '00000000-0000-4000-8000-000000000003',
};

describe('CampaignReplyService', () => {
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
