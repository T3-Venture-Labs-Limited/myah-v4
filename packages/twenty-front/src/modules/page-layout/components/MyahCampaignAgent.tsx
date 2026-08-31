import { styled } from '@linaria/react';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { RichTextFieldEditor } from '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor';
import { useRecordShowContainerData } from '@/object-record/record-show/hooks/useRecordShowContainerData';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

const CAMPAIGN_AGENT_FIELD_NAMES = [
  'campaignBrief',
  'communicationGuidelines',
  'replyRules',
  'escalationBoundaries',
  'additionalNotes',
] as const;

const StyledSurface = styled.section`
  background: ${themeCssVariables.background.primary};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  min-width: 0;
`;

const StyledFieldRow = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[5]};
  grid-template-columns: 220px minmax(0, 1fr);
  min-width: 0;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    gap: ${themeCssVariables.spacing[2]};
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledGuidance = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledLabel = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow-wrap: anywhere;
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const StyledEditorCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  max-height: 280px;
  min-height: 112px;
  min-width: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledSkeletonBlock = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.md};
`;

const StyledSkeletonGuidance = styled(StyledSkeletonBlock)`
  height: ${themeCssVariables.spacing[8]};
  margin-top: ${themeCssVariables.spacing[2]};
`;

const StyledSkeletonEditor = styled(StyledSkeletonBlock)`
  height: 112px;
`;

type MyahCampaignAgentProps = {
  campaignId: string;
  title: string;
};

export const MyahCampaignAgent = ({
  campaignId,
  title,
}: MyahCampaignAgentProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const { recordLoading } = useRecordShowContainerData({
    objectRecordId: campaignId,
  });

  const campaignMetadata = objectMetadataItems.find(
    (objectMetadataItem) => objectMetadataItem.nameSingular === 'campaign',
  );

  const campaignAgentFields = CAMPAIGN_AGENT_FIELD_NAMES.flatMap(
    (fieldName) => {
      const fieldMetadataItem = campaignMetadata?.fields.find(
        (field) => field.name === fieldName,
      );

      return fieldMetadataItem ? [{ fieldMetadataItem, fieldName }] : [];
    },
  );

  const isReady =
    recordLoading === false &&
    campaignAgentFields.length === CAMPAIGN_AGENT_FIELD_NAMES.length;

  return (
    <StyledSurface>
      <StyledTitle>{title}</StyledTitle>
      {isReady ? (
        <StyledFields>
          {campaignAgentFields.map(({ fieldMetadataItem, fieldName }) => {
            const labelId = `campaign-agent-${fieldMetadataItem.id}-label`;

            return (
              <StyledFieldRow
                aria-labelledby={labelId}
                key={fieldMetadataItem.id}
                role="group"
              >
                <StyledGuidance>
                  <StyledLabel id={labelId}>
                    {fieldMetadataItem.label}
                  </StyledLabel>
                  <StyledDescription>
                    {fieldMetadataItem.description}
                  </StyledDescription>
                </StyledGuidance>
                <StyledEditorCard>
                  <RichTextFieldEditor
                    editorMinHeight={80}
                    fieldName={fieldName}
                    objectNameSingular="campaign"
                    recordId={campaignId}
                  />
                </StyledEditorCard>
              </StyledFieldRow>
            );
          })}
        </StyledFields>
      ) : (
        <StyledFields data-testid="campaign-agent-loading">
          {CAMPAIGN_AGENT_FIELD_NAMES.map((fieldName) => (
            <StyledFieldRow key={fieldName}>
              <StyledSkeletonGuidance />
              <StyledSkeletonEditor />
            </StyledFieldRow>
          ))}
        </StyledFields>
      )}
    </StyledSurface>
  );
};
