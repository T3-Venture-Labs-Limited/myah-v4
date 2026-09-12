import {
  CampaignMailboxDeletionFenceError,
  CampaignMailboxDeletionFenceService,
} from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';

const managerWith = (query: jest.Mock) => {
  const manager: any = {};
  manager.queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    manager,
    query,
  };
  return manager;
};

describe('CampaignMailboxDeletionFenceService', () => {
  it('locks workspace, account, sorted channels, then attempts', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'workspace' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'account' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValueOnce([]);
    const service = new CampaignMailboxDeletionFenceService();

    await expect(
      service.assertDeletionAllowedInTransaction(
        {
          workspaceId: 'workspace',
          connectedAccountId: 'account',
          messageChannelIds: ['b', 'a'],
        },
        managerWith(query),
      ),
    ).resolves.toEqual(['a', 'b']);
    expect(query.mock.calls[0][0]).toContain('core.workspace');
    expect(query.mock.calls[1][1]).toEqual([
      'campaign-mailbox:workspace:workspace',
    ]);
    expect(query.mock.calls[2][1]).toEqual([
      'campaign-mailbox:account:account',
    ]);
    expect(query.mock.calls[4][1]).toEqual(['campaign-mailbox:channel:a']);
    expect(query.mock.calls[5][1]).toEqual(['campaign-mailbox:channel:b']);
    expect(query.mock.calls[7][0]).toContain('outboundEmailAttempt');
  });

  it.each(['PROCESSING', 'UNKNOWN', 'ACCEPTED-unprojected'])(
    'refuses %s evidence',
    async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'workspace' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'account' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'channel' }])
        .mockResolvedValueOnce([{ attemptId: 'attempt' }]);

      await expect(
        new CampaignMailboxDeletionFenceService().assertDeletionAllowedInTransaction(
          {
            workspaceId: 'workspace',
            connectedAccountId: 'account',
            messageChannelIds: ['channel'],
          },
          managerWith(query),
        ),
      ).rejects.toBeInstanceOf(CampaignMailboxDeletionFenceError);
    },
  );
});
