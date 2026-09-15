import { MyahCampaignEmailAccounts } from '@/page-layout/components/MyahCampaignEmailAccounts';
import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { t } from '@lingui/core/macro';

type MyahCampaignOperationsProps = {
  campaignId: string;
  title: string;
  fieldsWidget: PageLayoutWidget;
};

export const MyahCampaignOperations = ({
  campaignId,
  title,
  fieldsWidget: _fieldsWidget,
}: MyahCampaignOperationsProps) => {
  const campaignOperationsFields = [
    {
      fieldName: 'emailSignature',
      placeholder: t`Enter email signature`,
      showFormattingControls: true,
    },
  ] as const;

  return (
    <MyahCampaignRichTextSettings
      campaignId={campaignId}
      title={title}
      fields={campaignOperationsFields}
      modalIdPrefix="campaign-operations-unsaved-changes"
      copy={{
        keepEditing: t`Keep editing`,
        saveSuccess: t`Email signature saved.`,
        saveError: t`Email signature could not be saved.`,
        unsavedChangesSubtitle: t`Your Email signature changes have not been saved.`,
      }}
      contentBeforeFields={
        <>
          <MyahCampaignEmailAccounts campaignId={campaignId} />
        </>
      }
    />
  );
};
