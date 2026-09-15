import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { graphql, type GraphQLInputObjectType } from 'graphql';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CampaignInfluencerResolver } from 'src/modules/myah-campaign/resolvers/campaign-influencer.resolver';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
);

describe('CampaignInfluencerResolver', () => {
  const authContext = { workspace: { id: 'workspace' } } as never;
  const service = {
    snapshot: jest.fn(),
    attachCampaignCreatorLists: jest.fn(),
    addDirectCampaignCreators: jest.fn(),
    detachCampaignCreatorList: jest.fn(),
    campaignCreatorListRemovalImpact: jest.fn(),
    creatorListMembershipRemovalImpact: jest.fn(),
    campaignCreatorListAdditionCandidates: jest.fn(),
    approveCampaignCreatorListAdditions: jest.fn(),
    addCreatorListMemberIntent: jest.fn(),
    addCreatorListMembersIntent: jest.fn(),
    removeCreatorListMemberIntent: jest.fn(),
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

  it('accepts a two-ID detach mutation and delegates it through the executable schema', async () => {
    const snapshot = {
      campaignCreators: [],
      campaignCreatorLists: [],
    };
    service.detachCampaignCreatorList.mockResolvedValue(snapshot);
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        CampaignInfluencerResolver,
        { provide: CampaignInfluencerService, useValue: service },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([CampaignInfluencerResolver]);
    const resolver = moduleRef.get(CampaignInfluencerResolver);
    const detachInput = schema.getType(
      'DetachCampaignCreatorListInput',
    ) as GraphQLInputObjectType;

    expect(detachInput.getFields().confirmedCreatorIds.type.toString()).toBe(
      '[UUID!]',
    );
    expect(detachInput.getFields().confirmationToken.type.toString()).toBe(
      'String',
    );

    const result = await graphql({
      schema,
      source: `mutation DetachCampaignCreatorList($input: DetachCampaignCreatorListInput!) {
        detachCampaignCreatorList(input: $input) {
          campaignCreatorLists { id campaignId creatorListId }
        }
      }`,
      rootValue: { detachCampaignCreatorList: snapshot },
      variableValues: {
        input: {
          campaignId: '11111111-1111-4111-8111-111111111111',
          creatorListId: '22222222-2222-4222-8222-222222222222',
        },
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      detachCampaignCreatorList: { campaignCreatorLists: [] },
    });
    await resolver.detachCampaignCreatorList({
      campaignId: '11111111-1111-4111-8111-111111111111',
      creatorListId: '22222222-2222-4222-8222-222222222222',
    });
    expect(service.detachCampaignCreatorList).toHaveBeenCalledWith(
      {
        campaignId: '11111111-1111-4111-8111-111111111111',
        creatorListId: '22222222-2222-4222-8222-222222222222',
      },
      authContext,
    );
    await moduleRef.close();
  });

  it.each([
    ['campaignInfluencerSnapshot', 'snapshot'],
    ['attachCampaignCreatorLists', 'attachCampaignCreatorLists'],
    ['addDirectCampaignCreators', 'addDirectCampaignCreators'],
    ['detachCampaignCreatorList', 'detachCampaignCreatorList'],
    ['campaignCreatorListRemovalImpact', 'campaignCreatorListRemovalImpact'],
    [
      'creatorListMembershipRemovalImpact',
      'creatorListMembershipRemovalImpact',
    ],
    [
      'campaignCreatorListAdditionCandidates',
      'campaignCreatorListAdditionCandidates',
    ],
    [
      'approveCampaignCreatorListAdditions',
      'approveCampaignCreatorListAdditions',
    ],
    ['addCreatorListMemberIntent', 'addCreatorListMemberIntent'],
    ['addCreatorListMembersIntent', 'addCreatorListMembersIntent'],
    ['removeCreatorListMemberIntent', 'removeCreatorListMemberIntent'],
  ])(
    'delegates %s with unchanged server auth context',
    async (method, serviceMethod) => {
      const resolver = new CampaignInfluencerResolver(service as never);
      service[serviceMethod as keyof typeof service].mockResolvedValue({});
      const input = {
        campaignId: '11111111-1111-4111-8111-111111111111',
        creatorListIds: ['22222222-2222-4222-8222-222222222222'],
        creatorIds: ['44444444-4444-4444-8444-444444444444'],
        creatorListId: '22222222-2222-4222-8222-222222222222',
        creatorId: '44444444-4444-4444-8444-444444444444',
      };

      await (
        resolver[method as keyof CampaignInfluencerResolver] as (
          ...args: never[]
        ) => Promise<unknown>
      )(input as never);

      expect(
        service[serviceMethod as keyof typeof service],
      ).toHaveBeenCalledWith(expect.anything(), authContext);
    },
  );
});
