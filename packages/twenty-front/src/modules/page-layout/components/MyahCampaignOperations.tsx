import { MyahCampaignEmailAccounts } from '@/page-layout/components/MyahCampaignEmailAccounts';
import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { FieldsWidget } from '@/page-layout/widgets/fields/components/FieldsWidget';
import { t } from '@lingui/core/macro';

const CAMPAIGN_OPERATIONS_STATUS_FIELD_NAMES = ['lifecycleStatus'] as const;

type MyahCampaignOperationsProps = {
  campaignId: string;
  title: string;
  fieldsWidget: PageLayoutWidget;
};

export const MyahCampaignOperations = ({
  campaignId,
  title,
  fieldsWidget,
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
          <FieldsWidget
            widget={fieldsWidget}
            includeFieldNames={CAMPAIGN_OPERATIONS_STATUS_FIELD_NAMES}
          />
          <MyahCampaignEmailAccounts campaignId={campaignId} />
        </>
      }
    />
  );
};
