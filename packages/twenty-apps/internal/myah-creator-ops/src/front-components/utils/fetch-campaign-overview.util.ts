import { z } from 'zod';

import { CAMPAIGN_STATUSES } from 'src/front-components/constants/campaign-statuses';
import { type CampaignOverviewSnapshot } from 'src/front-components/types/campaign-overview-snapshot.type';
import { type CoreApiClientLike } from 'src/front-components/types/core-api-client-like.type';

const campaignOverviewResponseSchema = z.object({
  campaign: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      objective: z.string().nullable(),
      lifecycleStatus: z.enum(CAMPAIGN_STATUSES),
    })
    .nullable(),
  campaignCreators: z.object({
    totalCount: z.number().int().nonnegative(),
  }),
});

export const fetchCampaignOverview = async ({
  client,
  campaignId,
}: {
  client: CoreApiClientLike;
  campaignId: string;
}): Promise<CampaignOverviewSnapshot | null> => {
  const response = campaignOverviewResponseSchema.parse(
    await client.query({
      campaign: {
        __args: { filter: { id: { eq: campaignId } } },
        id: true,
        name: true,
        objective: true,
        lifecycleStatus: true,
      },
      campaignCreators: {
        __args: {
          filter: {
            campaignId: { eq: campaignId },
            creatorId: { is: 'NOT_NULL' },
            deletedAt: { is: 'NULL' },
          },
        },
        totalCount: true,
      },
    }),
  );

  if (response.campaign === null) {
    return null;
  }

  return {
    ...response.campaign,
    effectiveAudienceCount: response.campaignCreators.totalCount,
  };
};
