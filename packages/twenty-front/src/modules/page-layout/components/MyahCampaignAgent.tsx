import { styled } from '@linaria/react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { MyahCampaignAgentSettings } from '@/myah/agent/components/MyahCampaignAgentSettings';

type MyahCampaignAgentProps = {
  campaignId: string;
  title: string;
};

const StyledGuidanceRegion = styled.section`
  height: 100%;
  min-height: 0;
  overflow-y: auto;
`;

const getGuidanceFocusCampaignId = (state: unknown) => {
  if (typeof state !== 'object' || state === null) return undefined;

  const campaignId = (state as Record<string, unknown>)
    .myahCampaignAgentGuidanceFocusCampaignId;

  return typeof campaignId === 'string' ? campaignId : undefined;
};

export const MyahCampaignAgent = ({
  campaignId,
  title,
}: MyahCampaignAgentProps) => {
  const location = useLocation();
  const guidanceRegionRef = useRef<HTMLElement>(null);
  const guidanceFocusCampaignId = getGuidanceFocusCampaignId(location.state);

  useEffect(() => {
    if (guidanceFocusCampaignId === campaignId)
      guidanceRegionRef.current?.focus();
  }, [campaignId, guidanceFocusCampaignId]);

  return (
    <StyledGuidanceRegion
      aria-label={title}
      ref={guidanceRegionRef}
      tabIndex={-1}
    >
      <MyahCampaignAgentSettings campaignId={campaignId} />
    </StyledGuidanceRegion>
  );
};
