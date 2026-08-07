import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';

jest.mock('src/engine/core-modules/auth/storage/workspace-auth-context.storage');

describe('CampaignInfluencerResolver', () => {
  const authContext = { workspace: { id: 'workspace' } } as never;
  const service = {
    snapshot: jest.fn(),
    attachCreatorLists: jest.fn(),
    addDirectCreators: jest.fn(),
    campaignCreatorListRemovalImpact: jest.fn(),
    detachCreatorList: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkspaceAuthContext as jest.Mock).mockReturnValue(authContext);
  });

  it.each([
    ['campaignInfluencerSnapshot', 'snapshot'],
    ['attachCampaignCreatorLists', 'attachCreatorLists'],
    ['addDirectCampaignCreators', 'addDirectCreators'],
    ['campaignCreatorListRemovalImpact', 'campaignCreatorListRemovalImpact'],
    ['detachCampaignCreatorList', 'detachCreatorList'],
  ])('delegates %s with server auth context', async (method, serviceMethod) => {
    const resolver = new CampaignInfluencerResolver(service as never);
    service[serviceMethod as keyof typeof service].mockResolvedValue({});
    const input = { campaignId: 'c', creatorListIds: ['l'], creatorIds: ['u'], creatorListId: 'l', confirmedCreatorIds: [] };
    await (resolver[method as keyof CampaignInfluencerResolver] as (...args: never[]) => Promise<unknown>)(input as never);
    expect(service[serviceMethod as keyof typeof service]).toHaveBeenCalledWith(
      expect.anything(),
      authContext,
    );
  });
});
