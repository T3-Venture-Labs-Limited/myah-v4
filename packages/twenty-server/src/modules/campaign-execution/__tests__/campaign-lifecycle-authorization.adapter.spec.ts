import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignLifecycleWriteAuthorizationAdapter } from 'src/modules/campaign-execution/adapters/campaign-lifecycle-authorization.adapter';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

const workspaceId = '11111111-1111-4111-8111-111111111111';

const context = () => {
  const manager = {} as any;
  const query = jest.fn();
  manager.queryRunner = {
    manager,
    query,
    isTransactionActive: true,
    isReleased: false,
  };

  return {
    query,
    value: {
      manager,
      workspaceId,
      campaignId: '22222222-2222-4222-8222-222222222222',
      actorPermissionContext: {
        rolePermissionConfig: { intersectionOf: ['role-id'] },
      },
    } as any,
  };
};

describe('CampaignLifecycleWriteAuthorizationAdapter', () => {
  it('denies lifecycleStatus when object update is allowed but the field is restricted, with zero writes', async () => {
    jest.mocked(getWorkspaceContext).mockReturnValue({
      objectIdByNameSingular: { campaign: 'campaign-object-id' },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: {
          lifecycle: {
            id: 'lifecycle-field-id',
            objectMetadataId: 'campaign-object-id',
            name: 'lifecycleStatus',
            isActive: true,
          },
        },
      },
      permissionsPerRoleId: {
        'role-id': {
          'campaign-object-id': {
            canUpdateObjectRecords: true,
            restrictedFields: {
              'lifecycle-field-id': { canRead: null, canUpdate: false },
            },
          },
        },
      },
    } as never);
    const { query, value } = context();

    await expect(
      new CampaignLifecycleWriteAuthorizationAdapter().assertCampaignWriteAllowedInTransaction(
        value,
      ),
    ).rejects.toThrow('Campaign lifecycle update permission is required');
    expect(query).not.toHaveBeenCalled();
  });
});
