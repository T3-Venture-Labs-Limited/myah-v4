import { styled } from '@linaria/react';
import { useAtom } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { useBlocker } from 'react-router-dom';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { RichTextFieldEditor } from '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useRecordShowContainerData } from '@/object-record/record-show/hooks/useRecordShowContainerData';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { t } from '@lingui/core/macro';
import { Button } from 'twenty-ui/input';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

const CAMPAIGN_AGENT_FIELD_NAMES = [
  'campaignBrief',
  'communicationGuidelines',
  'replyRules',
  'escalationBoundaries',
  'additionalNotes',
] as const;

const CAMPAIGN_AGENT_UNSAVED_CHANGES_MODAL_ID =
  'campaign-agent-unsaved-changes';

type CampaignAgentFieldName = (typeof CAMPAIGN_AGENT_FIELD_NAMES)[number];
type CampaignAgentBodies = Record<CampaignAgentFieldName, string>;
type CampaignAgentRichTextValue = {
  blocknote?: string | null;
  markdown?: string | null;
};
type CampaignAgentRecord = Partial<
  Record<CampaignAgentFieldName, CampaignAgentRichTextValue>
> & {
  id?: string;
};

type CampaignAgentField = {
  fieldMetadataItem: {
    description: string | null;
    id: string;
    label: string;
  };
  fieldName: CampaignAgentFieldName;
};

const StyledSurface = styled.section`
  background: ${themeCssVariables.background.primary};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  height: 100%;
  min-width: 0;
  overflow: hidden;
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
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding-bottom: ${themeCssVariables.spacing[4]};
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

const StyledActions = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  margin: 0 calc(-1 * ${themeCssVariables.spacing[4]})
    calc(-1 * ${themeCssVariables.spacing[4]});
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
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

type MyahCampaignAgentEditorProps = {
  campaignAgentFields: CampaignAgentField[];
  campaignId: string;
  persistedBodies: CampaignAgentBodies;
  title: string;
};

const MyahCampaignAgentEditor = ({
  campaignAgentFields,
  campaignId,
  persistedBodies,
  title,
}: MyahCampaignAgentEditorProps) => {
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { openModal } = useModal();
  const [draftBodies, setDraftBodies] =
    useState<CampaignAgentBodies>(persistedBodies);
  const [savedBodies, setSavedBodies] =
    useState<CampaignAgentBodies>(persistedBodies);
  const [isSaving, setIsSaving] = useState(false);

  const dirtyFieldNames = useMemo(
    () =>
      CAMPAIGN_AGENT_FIELD_NAMES.filter(
        (fieldName) => draftBodies[fieldName] !== savedBodies[fieldName],
      ),
    [draftBodies, savedBodies],
  );
  const isDirty = dirtyFieldNames.length > 0;
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      openModal(CAMPAIGN_AGENT_UNSAVED_CHANGES_MODAL_ID);
    }
  }, [blocker.state, openModal]);

  useEffect(() => {
    if (!isDirty && blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker, isDirty]);

  const handleSave = async () => {
    if (!isDirty || isSaving) {
      return;
    }

    const draftBodiesToSave = { ...draftBodies };
    const updateOneRecordInput = Object.fromEntries(
      dirtyFieldNames.map((fieldName) => [
        fieldName,
        {
          blocknote: draftBodiesToSave[fieldName],
          markdown: null,
        },
      ]),
    );

    setIsSaving(true);

    try {
      await updateOneRecord({
        idToUpdate: campaignId,
        objectNameSingular: 'campaign',
        updateOneRecordInput,
      });
      setSavedBodies(draftBodiesToSave);
      enqueueSuccessSnackBar({
        message: t`Campaign Agent settings saved.`,
      });
    } catch {
      enqueueErrorSnackBar({
        message: t`Campaign Agent settings could not be saved.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (!isSaving && blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  const handleKeepEditing = () => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  return (
    <StyledSurface>
      <StyledTitle>{title}</StyledTitle>
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
                  onBodyChange={(blocknote) => {
                    setDraftBodies((currentDraftBodies) => ({
                      ...currentDraftBodies,
                      [fieldName]: blocknote,
                    }));
                  }}
                  recordId={campaignId}
                  shouldPersistChanges={false}
                  showFormattingControls={false}
                />
              </StyledEditorCard>
            </StyledFieldRow>
          );
        })}
      </StyledFields>
      <StyledActions>
        <Button
          accent="brand"
          disabled={!isDirty || isSaving}
          isLoading={isSaving}
          onClick={handleSave}
          title={t`Save`}
        />
      </StyledActions>
      <ConfirmationModal
        confirmButtonText={t`Discard changes`}
        loading={isSaving}
        modalInstanceId={CAMPAIGN_AGENT_UNSAVED_CHANGES_MODAL_ID}
        onClose={handleKeepEditing}
        onConfirmClick={handleDiscardChanges}
        subtitle={t`Your Campaign Agent changes have not been saved.`}
        title={t`Discard unsaved changes?`}
      />
    </StyledSurface>
  );
};

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
  const [campaignRecord] = useAtom(
    recordStoreFamilyState.atomFamily(campaignId),
  );

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
  ) as CampaignAgentField[];
  const campaignAgentRecord = campaignRecord as
    | CampaignAgentRecord
    | null
    | undefined;
  const isRecordHydrated =
    campaignAgentRecord !== null &&
    campaignAgentRecord !== undefined &&
    CAMPAIGN_AGENT_FIELD_NAMES.every(
      (fieldName) => fieldName in campaignAgentRecord,
    );
  const isReady =
    recordLoading === false &&
    campaignAgentFields.length === CAMPAIGN_AGENT_FIELD_NAMES.length &&
    isRecordHydrated;
  if (isReady) {
    const persistedBodies = Object.fromEntries(
      CAMPAIGN_AGENT_FIELD_NAMES.map((fieldName) => [
        fieldName,
        campaignAgentRecord[fieldName]?.blocknote ?? '',
      ]),
    ) as CampaignAgentBodies;

    return (
      <MyahCampaignAgentEditor
        campaignAgentFields={campaignAgentFields}
        campaignId={campaignId}
        key={campaignId}
        persistedBodies={persistedBodies}
        title={title}
      />
    );
  }

  return (
    <StyledSurface>
      <StyledTitle>{title}</StyledTitle>
      <StyledFields data-testid="campaign-agent-loading">
        {CAMPAIGN_AGENT_FIELD_NAMES.map((fieldName) => (
          <StyledFieldRow key={fieldName}>
            <StyledSkeletonGuidance />
            <StyledSkeletonEditor />
          </StyledFieldRow>
        ))}
      </StyledFields>
      <StyledActions>
        <Button accent="brand" disabled title={t`Save`} />
      </StyledActions>
    </StyledSurface>
  );
};
