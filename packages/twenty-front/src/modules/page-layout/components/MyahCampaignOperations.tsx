import { MyahCampaignInstagramAccount } from '@/myah/agent/components/MyahCampaignInstagramAccount';
import { MyahCampaignEmailAccounts } from '@/page-layout/components/MyahCampaignEmailAccounts';
import { MyahCampaignExecutionControls } from '@/page-layout/components/MyahCampaignExecutionControls';
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
      description={t`Review linked email accounts, the Instagram account, sender readiness, and the saved email signature.`}
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
          <MyahCampaignInstagramAccount campaignId={campaignId} />
        </>
      }
      sidebar={
        <>
          <p>
            {t`Email and Instagram delivery settings. Reply drafting, the preferred channel and approval live in the Agent tab. Shared account limits remain authoritative.`}
          </p>
          <MyahCampaignExecutionControls
            campaignId={campaignId}
            variant="review"
          />
        </>
      }
    />
  );
};
