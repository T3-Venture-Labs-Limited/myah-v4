import { t } from '@lingui/core/macro';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';
import { MyahCampaignOfferPreview } from '@/page-layout/components/MyahCampaignOfferPreview';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { MyahCampaignActivity } from '@/page-layout/components/MyahCampaignActivity';
import { MyahCampaignReadiness } from '@/page-layout/components/MyahCampaignReadiness';

type MyahCampaignHomeProps = {
  campaignId: string | undefined;
};

export const MyahCampaignHome = ({ campaignId }: MyahCampaignHomeProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const campaignMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'campaign',
  );
  const permissions = useObjectPermissionsForObject(campaignMetadata?.id ?? '');
  const isEditMode = useIsPageLayoutInEditMode();
  const { isInSidePanel } = useLayoutRenderingContext();
  const factFields = ['campaignBrief', 'additionalNotes'] as const;
  const canEditFacts =
    !isEditMode &&
    !!campaignMetadata &&
    permissions.canReadObjectRecords &&
    permissions.canUpdateObjectRecords &&
    factFields.every((name) => {
      const fieldId = campaignMetadata.fields.find(
        (field) => field.name === name,
      )?.id;
      return (
        fieldId !== undefined &&
        permissions.restrictedFields[fieldId]?.canRead !== false &&
        permissions.restrictedFields[fieldId]?.canUpdate !== false
      );
    });

  if (!campaignId) {
    return null;
  }

  return (
    <>
      {canEditFacts ? (
        <MyahCampaignRichTextSettings
          campaignId={campaignId}
          description={t`Edit the existing Campaign brief and notes; Creator-specific agreements remain separate.`}
          copy={{
            saveLabel: t`Save brief and notes`,
            saveSuccess: t`Campaign facts saved.`,
            saveError: t`Campaign facts could not be saved.`,
            unsavedChangesSubtitle: t`Your Campaign facts have not been saved.`,
          }}
          fields={[
            {
              fieldName: 'campaignBrief',
              placeholder: t`Enter campaign brief`,
              showFormattingControls: false,
            },
            {
              fieldName: 'additionalNotes',
              placeholder: t`Enter campaign notes`,
              showFormattingControls: false,
            },
          ]}
          modalIdPrefix="campaign-facts-unsaved-changes"
          contentAfterFields={<MyahCampaignOfferPreview />}
          interceptSidePanelTabChange={isInSidePanel}
          title={t`Campaign facts`}
          sidebar={<MyahCampaignReadiness campaignId={campaignId} />}
        />
      ) : (
        <MyahCampaignReadiness campaignId={campaignId} />
      )}
      <MyahCampaignActivity campaignId={campaignId} />
    </>
  );
};
