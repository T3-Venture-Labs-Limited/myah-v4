import { GUARDS_METADATA } from '@nestjs/common/constants';

import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
);

describe('CampaignInfluencerResolver', () => {
  const authContext = { workspace: { id: 'workspace' } } as never;
  const service = {
    snapshot: jest.fn(),
    attachCampaignCreatorLists: jest.fn(),
    addDirectCampaignCreators: jest.fn(),
    campaignCreatorListRemovalImpact: jest.fn(),
    detachCampaignCreatorList: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkspaceAuthContext as jest.Mock).mockReturnValue(authContext);
  });

  it('requires workspace authentication and custom permission guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignInfluencerResolver),
    ).toEqual([WorkspaceAuthGuard, CustomPermissionGuard]);
  });

  it.each([
    ['campaignInfluencerSnapshot', 'snapshot'],
    ['attachCampaignCreatorLists', 'attachCampaignCreatorLists'],
    ['addDirectCampaignCreators', 'addDirectCampaignCreators'],
    ['campaignCreatorListRemovalImpact', 'campaignCreatorListRemovalImpact'],
    ['detachCampaignCreatorList', 'detachCampaignCreatorList'],
  ])('delegates %s with server auth context', async (method, serviceMethod) => {
    const resolver = new CampaignInfluencerResolver(service as never);
    service[serviceMethod as keyof typeof service].mockResolvedValue({});
    const input = {
      campaignId: 'c',
      creatorListIds: ['l'],
      creatorIds: ['u'],
      creatorListId: 'l',
      confirmedCreatorIds: [],
    };
    await (
      resolver[method as keyof CampaignInfluencerResolver] as (
        ...args: never[]
      ) => Promise<unknown>
    )(input as never);
    expect(service[serviceMethod as keyof typeof service]).toHaveBeenCalledWith(
      expect.anything(),
      authContext,
    );
  });
});
