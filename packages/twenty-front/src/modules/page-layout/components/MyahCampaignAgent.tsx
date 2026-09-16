import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';

type MyahCampaignAgentProps = {
  campaignId: string;
  title: string;
};

const StyledGuidanceRegion = styled.section`
  height: 100%;
  min-height: 0;
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

  const campaignAgentFields = [
    {
      fieldName: 'campaignBrief',
      placeholder: t`Enter instructions`,
      showFormattingControls: false,
    },
    {
      fieldName: 'communicationGuidelines',
      placeholder: t`Enter instructions`,
      showFormattingControls: false,
    },
    {
      fieldName: 'replyRules',
      placeholder: t`Enter instructions`,
      showFormattingControls: false,
    },
    {
      fieldName: 'escalationBoundaries',
      placeholder: t`Enter instructions`,
      showFormattingControls: false,
    },
    {
      fieldName: 'additionalNotes',
      placeholder: t`Enter instructions`,
      showFormattingControls: false,
    },
  ] as const;

  return (
    <StyledGuidanceRegion
      aria-label="Campaign AI guidance"
      ref={guidanceRegionRef}
      tabIndex={-1}
    >
      <MyahCampaignRichTextSettings
        campaignId={campaignId}
        copy={{
          saveSuccess: t`Campaign Agent settings saved.`,
          saveError: t`Campaign Agent settings could not be saved.`,
          unsavedChangesSubtitle: t`Your Campaign Agent changes have not been saved.`,
        }}
        fields={campaignAgentFields}
        modalIdPrefix="campaign-agent-unsaved-changes"
        title={title}
      />
    </StyledGuidanceRegion>
  );
};
