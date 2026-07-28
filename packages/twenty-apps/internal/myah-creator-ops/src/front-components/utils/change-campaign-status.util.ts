import { z } from 'zod';

import { CAMPAIGN_STATUSES } from 'src/front-components/constants/campaign-statuses';
import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';
import { type ChangeCampaignStatusResult } from 'src/front-components/types/change-campaign-status-result.type';
import { type CoreApiClientLike } from 'src/front-components/types/core-api-client-like.type';
import { fetchCampaignOverview } from 'src/front-components/utils/fetch-campaign-overview.util';

const updateCampaignsResponseSchema = z.object({
  updateCampaigns: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(CAMPAIGN_STATUSES),
      }),
    )
    .max(1),
});

export const changeCampaignStatus = async ({
  client,
  campaignId,
  targetStatus,
}: {
  client: CoreApiClientLike;
  campaignId: string;
  targetStatus: CampaignStatus;
}): Promise<ChangeCampaignStatusResult> => {
  const { updateCampaigns } = updateCampaignsResponseSchema.parse(
    await client.mutation({
      updateCampaigns: {
        __args: {
          filter: { id: { in: [campaignId] } },
          data: { status: targetStatus },
        },
        id: true,
        status: true,
      },
    }),
  );
  const campaign = updateCampaigns[0];

  if (campaign !== undefined) {
    return { kind: 'updated', campaign };
  }

  return {
    kind: 'conflict',
    campaign: await fetchCampaignOverview({ client, campaignId }),
  };
};
