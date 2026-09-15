import { WorkspaceCampaignCapacityTimeZoneAuthorizationService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone-authorization.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      authContext: {
        workspace: { id: '11111111-1111-4111-8111-111111111111' },
      },
    })),
  }),
);

describe('WorkspaceCampaignCapacityTimeZoneAuthorizationService', () => {
  const service = new WorkspaceCampaignCapacityTimeZoneAuthorizationService();

  it('allows only a trusted matching-workspace supplied active manager read', async () => {
    const manager = {} as any;
    manager.queryRunner = {
      manager,
      isTransactionActive: true,
      isReleased: false,
      query: jest.fn(),
    };

    await expect(
      service.assertReadAllowedInTransaction(
        { workspaceId: '11111111-1111-4111-8111-111111111111' },
        manager,
      ),
    ).resolves.toBeUndefined();
    expect(manager.queryRunner.query).not.toHaveBeenCalled();
  });

  it('rejects every mutation before SQL', async () => {
    const query = jest.fn();

    await expect(
      service.assertMutationAllowedInTransaction(
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          campaignCapacityTimeZone: 'UTC',
        },
        { queryRunner: { query } } as never,
      ),
    ).rejects.toThrow(
      'Workspace campaign capacity timezone mutation is unsupported',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
