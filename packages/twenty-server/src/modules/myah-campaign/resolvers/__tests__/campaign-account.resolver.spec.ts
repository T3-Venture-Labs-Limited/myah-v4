import { GUARDS_METADATA, PIPES_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  CampaignEmailAccountCampaignInput,
  CampaignEmailAccountLinkInput,
  LinkCampaignEmailAccountInput,
} from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CampaignAccountResolver } from 'src/modules/myah-campaign/resolvers/campaign-account.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
);

describe('CampaignAccountResolver', () => {
  const authContext = { workspace: { id: 'workspace' } } as never;
  const service = {
    list: jest.fn(),
    candidates: jest.fn(),
    link: jest.fn(),
    setDefault: jest.fn(),
    remove: jest.fn(),
  };
  const campaignId = '11111111-1111-4111-8111-111111111111';
  const connectedAccountId = '22222222-2222-4222-8222-222222222222';
  const campaignAccountId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkspaceAuthContext as jest.Mock).mockReturnValue(authContext);
  });

  it.each([
    [CampaignEmailAccountCampaignInput, {}],
    [CampaignEmailAccountLinkInput, { campaignAccountId }],
    [LinkCampaignEmailAccountInput, { connectedAccountId }],
  ])('validates UUID fields for %s', async (Input, fields) => {
    const input = Object.assign(new Input(), {
      ...fields,
      campaignId: 'not-a-uuid',
    });

    await expect(validate(input)).resolves.toHaveLength(1);
  });

  it.each([
    [LinkCampaignEmailAccountInput, 'connectedAccountId'],
    [CampaignEmailAccountLinkInput, 'campaignAccountId'],
  ])('validates the secondary UUID field for %s', async (Input, field) => {
    const input = Object.assign(new Input(), {
      campaignId,
      [field]: 'not-a-uuid',
    });

    await expect(validate(input)).resolves.toHaveLength(1);
  });

  it('requires workspace authentication, custom permission guards, and resolver validation', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CampaignAccountResolver),
    ).toEqual([WorkspaceAuthGuard, CustomPermissionGuard]);
    expect(
      Reflect.getMetadata(PIPES_METADATA, CampaignAccountResolver),
    ).toEqual([ResolverValidationPipe]);
  });

  it.each([
    ['campaignEmailAccounts', 'list', { campaignId }],
    ['campaignEmailAccountCandidates', 'candidates', { campaignId }],
    ['linkCampaignEmailAccount', 'link', { campaignId, connectedAccountId }],
    [
      'setDefaultCampaignEmailAccount',
      'setDefault',
      { campaignId, campaignAccountId },
    ],
    ['removeCampaignEmailAccount', 'remove', { campaignId, campaignAccountId }],
  ])(
    'forwards %s input and the unchanged server auth context',
    async (method, serviceMethod, input) => {
      const result = [{ id: 'campaign-account' }];
      const resolver = new CampaignAccountResolver(service as never);
      service[serviceMethod as keyof typeof service].mockResolvedValue(result);

      await expect(
        (
          resolver[method as keyof CampaignAccountResolver] as (
            input: never,
          ) => Promise<unknown>
        )(input as never),
      ).resolves.toBe(result);

      expect(
        service[serviceMethod as keyof typeof service],
      ).toHaveBeenCalledWith(
        serviceMethod === 'list' || serviceMethod === 'candidates'
          ? input.campaignId
          : input,
        authContext,
      );
    },
  );
});
