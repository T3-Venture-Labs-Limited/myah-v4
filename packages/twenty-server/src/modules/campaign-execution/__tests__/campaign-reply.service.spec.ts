import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  messageChannelId: '00000000-0000-4000-8000-000000000002',
  threadExternalId: 'thread',
  fromHandle: 'creator@example.com',
  inboundEvidenceId: '00000000-0000-4000-8000-000000000003',
};

describe('CampaignReplyService', () => {
  it('does nothing for ambiguous or mismatched evidence', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const manager = {
      queryRunner: undefined as any,
      createQueryBuilder: jest.fn(),
    };
    manager.queryRunner = {
      isTransactionActive: true,
      manager,
      query: jest.fn(async () => []),
    };
    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(input, manager as never);
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

  it('terminalizes one exact match and uses an unquoted QueryBuilder target for stage CAS', async () => {
    const progression = {
      terminalizeReplyInTransaction: jest.fn(async () => ({
        status: 'REPLIED',
      })),
    };
    const execute = jest.fn();
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const manager = {
      queryRunner: undefined as any,
      createQueryBuilder: jest.fn(() => builder),
    };
    manager.queryRunner = {
      isTransactionActive: true,
      manager,
      query: jest.fn(async () => [
        {
          workspaceId: input.workspaceId,
          campaignId: '00000000-0000-4000-8000-000000000004',
          enrollmentId: '00000000-0000-4000-8000-000000000005',
          campaignCreatorId: '00000000-0000-4000-8000-000000000006',
        },
      ]),
    };
    await new CampaignReplyService(
      progression as never,
    ).reconcileInboundMessageInTransaction(input, manager as never);
    expect(progression.terminalizeReplyInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ inboundEvidenceId: input.inboundEvidenceId }),
      manager,
    );
    expect(builder.update).toHaveBeenCalledWith(
      expect.stringMatching(/^workspace_[^.]+\.campaignCreator$/),
    );
    expect(execute).toHaveBeenCalled();
  });
});
