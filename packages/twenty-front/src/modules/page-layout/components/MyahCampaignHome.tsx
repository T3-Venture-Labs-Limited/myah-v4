import { MyahCampaignActivity } from '@/page-layout/components/MyahCampaignActivity';
import { MyahCampaignReadiness } from '@/page-layout/components/MyahCampaignReadiness';

type MyahCampaignHomeProps = {
  campaignId: string | undefined;
};

export const MyahCampaignHome = ({ campaignId }: MyahCampaignHomeProps) => {
  if (!campaignId) {
    return null;
  }

  return (
    <>
      <MyahCampaignReadiness campaignId={campaignId} />
      <MyahCampaignActivity campaignId={campaignId} />
    </>
  );
};
