import { t } from '@lingui/core/macro';

import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';

type MyahCampaignAgentProps = {
  campaignId: string;
  title: string;
};

export const MyahCampaignAgent = ({
  campaignId,
  title,
}: MyahCampaignAgentProps) => {
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
  );
};
