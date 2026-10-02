import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  messageChannelId: '00000000-0000-4000-8000-000000000002',
  threadExternalId: 'thread',
  fromHandle: ' Creator@Example.com ',
  inboundEvidenceId: '00000000-0000-4000-8000-000000000003',
};
const match = {
  workspaceId: input.workspaceId,
  campaignId: '00000000-0000-4000-8000-000000000004',
  enrollmentId: '00000000-0000-4000-8000-000000000005',
  campaignCreatorId: '00000000-0000-4000-8000-000000000006',
  messageChannelId: input.messageChannelId,
  enrollmentState: 'ACTIVE',
};

const fixture = (
  matches: Record<string, unknown>[] = [match],
  workspace = [{ id: input.workspaceId }],
) => {
  const progression = {
    terminalizeReplyInTransaction: jest
      .fn()
      .mockResolvedValue({ status: 'PROCESSING_IN_FLIGHT' }),
  };
  const query = jest.fn(
    async (sql: string, _parameters?: readonly unknown[]) => {
      if (sql.includes('FROM core.workspace')) return workspace;
      if (sql.includes('FROM core."outboundEmailAttempt"')) return matches;
      throw new Error(`Unexpected query: ${sql}`);
    },
  );
  const manager = { queryRunner: undefined as any };
  manager.queryRunner = { isTransactionActive: true, manager, query };
  return {
    service: new CampaignReplyService(progression as never),
    progression,
    query,
    manager,
  };
};

describe('CampaignReplyService', () => {
  it('locks workspace first, before accepted attempt matching and progression, without changing legacy stage', async () => {
    const { service, progression, query, manager } = fixture([
      match,
      { ...match, attemptId: 'second-accepted' },
    ]);
    await service.reconcileInboundMessageInTransaction(input, manager as never);
    expect(query.mock.calls[0][0]).toContain(
      'core.workspace WHERE id=$1 FOR UPDATE',
    );
    expect(query.mock.calls[0][1]).toEqual([input.workspaceId]);
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE OF a,e,auth,act');
    expect(query.mock.calls[1][1]).toEqual([
      input.workspaceId,
      input.messageChannelId,
      'thread',
      'creator@example.com',
    ]);
    expect(progression.terminalizeReplyInTransaction).toHaveBeenCalledTimes(1);
    expect(progression.terminalizeReplyInTransaction).toHaveBeenCalledWith(
      {
        workspaceId: input.workspaceId,
        campaignId: match.campaignId,
        enrollmentId: match.enrollmentId,
        inboundEvidenceId: input.inboundEvidenceId,
      },
      manager,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed when workspace is missing, without locking an attempt', async () => {
    const { service, progression, query, manager } = fixture([match], []);
    await service.reconcileInboundMessageInTransaction(input, manager as never);
    expect(query).toHaveBeenCalledTimes(1);
    expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
  });

  it('does not infer Campaign from ambiguous accepted evidence or from no accepted match', async () => {
    for (const matches of [
      [],
      [match, { ...match, campaignId: 'other', enrollmentId: 'other' }],
    ]) {
      const { service, progression, manager } = fixture(matches);
      await service.reconcileInboundMessageInTransaction(
        input,
        manager as never,
      );
      expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
    }
  });

  it('withholds attribution when an active and historical Campaign share accepted thread evidence', async () => {
    const { service, progression, query, manager } = fixture([
      match,
      {
        ...match,
        campaignId: 'historical',
        enrollmentId: 'historical',
        enrollmentState: 'REPLIED',
      },
    ]);
    await service.reconcileInboundMessageInTransaction(input, manager as never);
    expect(query.mock.calls[1][0]).toContain('e.state AS "enrollmentState"');
    expect(query.mock.calls[1][0]).not.toContain("e.state='ACTIVE'");
    expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
  });

  it('does not terminalize a sole historical accepted enrollment', async () => {
    const { service, progression, manager } = fixture([
      { ...match, enrollmentState: 'REPLIED' },
    ]);
    await service.reconcileInboundMessageInTransaction(input, manager as never);
    expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
  });

  it('does not read or write for an empty thread or sender', async () => {
    const { service, query, manager } = fixture();
    await service.reconcileInboundMessageInTransaction(
      { ...input, threadExternalId: ' ' },
      manager as never,
    );
    await service.reconcileInboundMessageInTransaction(
      { ...input, fromHandle: ' ' },
      manager as never,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
