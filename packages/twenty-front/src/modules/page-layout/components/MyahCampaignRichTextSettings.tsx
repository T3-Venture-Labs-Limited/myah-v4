import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useAtom } from 'jotai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import {
  PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT,
  type PageLayoutSidePanelTabChangeDetail,
} from '@/page-layout/constants/PageLayoutSidePanelTabChangeEvent';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { RichTextFieldEditor } from '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useRecordShowContainerData } from '@/object-record/record-show/hooks/useRecordShowContainerData';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

export type MyahCampaignRichTextSettingsField<FieldName extends string> = {
  fieldName: FieldName;
  placeholder: string;
  showFormattingControls: boolean;
};

export type MyahCampaignRichTextSettingsCopy = {
  keepEditing?: string;
  saveLabel?: string;
  saveSuccess: string;
  saveError: string;
  unsavedChangesSubtitle: string;
};

export type MyahCampaignRichTextSettingsProps<FieldName extends string> = {
  campaignId: string;
  title: string;
  description?: string;
  fields: readonly MyahCampaignRichTextSettingsField<FieldName>[];
  copy: MyahCampaignRichTextSettingsCopy;
  modalIdPrefix: string;
  interceptSidePanelTabChange?: boolean;
  contentBeforeFields?: React.ReactNode;
  contentAfterFields?: React.ReactNode;
  sidebar?: React.ReactNode;
};

type CampaignRichTextValue = {
  blocknote?: string | null;
  markdown?: string | null;
};

type CampaignRichTextRecord<FieldName extends string> = Partial<
  Record<FieldName, CampaignRichTextValue>
> & {
  id?: string;
};

type CampaignRichTextBodies<FieldName extends string> = Record<
  FieldName,
  string
>;

type CampaignRichTextEditorVersions<FieldName extends string> = Record<
  FieldName,
  number
>;

type ResolvedCampaignRichTextField<FieldName extends string> =
  MyahCampaignRichTextSettingsField<FieldName> & {
    fieldMetadataItem: {
      description: string | null;
      id: string;
      label: string;
    };
  };

const StyledSurface = styled.section`
  background: ${themeCssVariables.background.primary};
  box-sizing: border-box;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  height: 100%;
  min-width: 0;
  overflow: hidden;
  padding: ${themeCssVariables.spacing[5]};
  width: 100%;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledPageDescription = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: calc(-1 * ${themeCssVariables.spacing[3]}) 0 0;
`;

const StyledLayout = styled.div`
  align-items: start;
  display: grid;
  flex: 1;
  gap: ${themeCssVariables.spacing[7]};
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding-bottom: ${themeCssVariables.spacing[4]};

  &[data-has-sidebar='false'] {
    grid-template-columns: minmax(0, 1fr);
  }

  @container (max-width: 850px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledFields = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[5]};
`;

const StyledSidebar = styled.aside`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  min-width: 0;
  padding: ${themeCssVariables.spacing[5]};
`;

const StyledFieldRow = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
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
  background: ${themeCssVariables.background.primary};
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
  margin: 0 calc(-1 * ${themeCssVariables.spacing[5]})
    calc(-1 * ${themeCssVariables.spacing[5]});
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

type MyahCampaignRichTextSettingsSurfaceProps = {
  actions: React.ReactNode;
  description?: string;
  contentBeforeFields?: React.ReactNode;
  contentAfterFields?: React.ReactNode;
  fields: React.ReactNode;
  modal?: React.ReactNode;
  sidebar?: React.ReactNode;
  title: string;
};

const MyahCampaignRichTextSettingsSurface = ({
  actions,
  description,
  contentBeforeFields,
  contentAfterFields,
  fields,
  modal,
  sidebar,
  title,
}: MyahCampaignRichTextSettingsSurfaceProps) => (
  <StyledSurface data-testid="campaign-rich-text-settings-surface">
    <StyledTitle>{title}</StyledTitle>
    {description !== undefined && description.length > 0 && (
      <StyledPageDescription>{description}</StyledPageDescription>
    )}
    <StyledLayout data-has-sidebar={sidebar != null ? 'true' : 'false'}>
      <StyledFields>
        {contentBeforeFields}
        {fields}
        {contentAfterFields}
      </StyledFields>
      {sidebar != null && <StyledSidebar>{sidebar}</StyledSidebar>}
    </StyledLayout>
    <StyledActions>{actions}</StyledActions>
    {modal}
  </StyledSurface>
);

const createEditorVersions = <FieldName extends string>(
  fields: readonly MyahCampaignRichTextSettingsField<FieldName>[],
): CampaignRichTextEditorVersions<FieldName> =>
  Object.fromEntries(
    fields.map(({ fieldName }) => [fieldName, 0]),
  ) as CampaignRichTextEditorVersions<FieldName>;

type MyahCampaignRichTextSettingsEditorProps<FieldName extends string> = {
  campaignId: string;
  description?: string;
  contentBeforeFields?: React.ReactNode;
  contentAfterFields?: React.ReactNode;
  sidebar?: React.ReactNode;
  copy: MyahCampaignRichTextSettingsCopy;
  fields: readonly ResolvedCampaignRichTextField<FieldName>[];
  modalIdPrefix: string;
  interceptSidePanelTabChange?: boolean;
  persistedBodies: CampaignRichTextBodies<FieldName>;
  title: string;
};

const MyahCampaignRichTextSettingsEditor = <FieldName extends string>({
  campaignId,
  description,
  contentBeforeFields,
  contentAfterFields,
  sidebar,
  copy,
  fields,
  modalIdPrefix,
  interceptSidePanelTabChange,
  persistedBodies,
  title,
}: MyahCampaignRichTextSettingsEditorProps<FieldName>) => {
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { closeModal, openModal } = useModal();
  const [draftBodies, setDraftBodies] =
    useState<CampaignRichTextBodies<FieldName>>(persistedBodies);
  const [savedBodies, setSavedBodies] =
    useState<CampaignRichTextBodies<FieldName>>(persistedBodies);
  const [editorVersions, setEditorVersions] = useState<
    CampaignRichTextEditorVersions<FieldName>
  >(() => createEditorVersions(fields));
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSavedBodies, setPendingSavedBodies] =
    useState<CampaignRichTextBodies<FieldName> | null>(null);
  const unsavedChangesModalId = `${modalIdPrefix}-${campaignId}`;
  // oxlint-disable-next-line twenty/no-state-useref -- Retain the canceled tab's one-shot callback until Save or Discard.
  const pendingSidePanelResume = useRef<(() => void) | null>(null);
  const fieldNames = useMemo(
    () => fields.map(({ fieldName }) => fieldName),
    [fields],
  );

  const dirtyFieldNames = useMemo(
    () =>
      fieldNames.filter(
        (fieldName) => draftBodies[fieldName] !== savedBodies[fieldName],
      ),
    [draftBodies, fieldNames, savedBodies],
  );
  const isDirty = dirtyFieldNames.length > 0;
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!interceptSidePanelTabChange || !isDirty) return;
    const handleSidePanelChange = (event: Event) => {
      const tabEvent = event as CustomEvent<PageLayoutSidePanelTabChangeDetail>;
      if (tabEvent.detail.currentTabId === tabEvent.detail.nextTabId) return;
      event.preventDefault();
      pendingSidePanelResume.current = tabEvent.detail.resume;
      openModal(unsavedChangesModalId);
    };
    window.addEventListener(
      PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT,
      handleSidePanelChange,
    );
    return () =>
      window.removeEventListener(
        PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT,
        handleSidePanelChange,
      );
  }, [interceptSidePanelTabChange, isDirty, openModal, unsavedChangesModalId]);

  useEffect(
    () => () => {
      if (pendingSidePanelResume.current) closeModal(unsavedChangesModalId);
      pendingSidePanelResume.current = null;
    },
    [closeModal, unsavedChangesModalId],
  );

  useEffect(() => {
    if (pendingSavedBodies) {
      return;
    }

    const externallyChangedFieldNames = fieldNames.filter(
      (fieldName) => persistedBodies[fieldName] !== savedBodies[fieldName],
    );

    if (externallyChangedFieldNames.length === 0) {
      return;
    }

    const cleanExternallyChangedFieldNames = externallyChangedFieldNames.filter(
      (fieldName) => draftBodies[fieldName] === savedBodies[fieldName],
    );

    setSavedBodies(persistedBodies);

    if (cleanExternallyChangedFieldNames.length === 0) {
      return;
    }

    setDraftBodies((currentDraftBodies) => {
      const nextDraftBodies = { ...currentDraftBodies };

      for (const fieldName of cleanExternallyChangedFieldNames) {
        nextDraftBodies[fieldName] = persistedBodies[fieldName];
      }

      return nextDraftBodies;
    });
    setEditorVersions((currentVersions) => {
      const nextVersions = { ...currentVersions };

      for (const fieldName of cleanExternallyChangedFieldNames) {
        nextVersions[fieldName] += 1;
      }

      return nextVersions;
    });
  }, [
    draftBodies,
    fieldNames,
    pendingSavedBodies,
    persistedBodies,
    savedBodies,
  ]);

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
      openModal(unsavedChangesModalId);
    }
  }, [blocker.state, openModal, unsavedChangesModalId]);

  useEffect(() => {
    if (!isDirty && blocker.state === 'blocked') {
      closeModal(unsavedChangesModalId);
      blocker.proceed();
    }
  }, [blocker, closeModal, isDirty, unsavedChangesModalId]);

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
    setPendingSavedBodies(draftBodiesToSave);

    try {
      await updateOneRecord({
        idToUpdate: campaignId,
        objectNameSingular: 'campaign',
        updateOneRecordInput,
      });
      setSavedBodies(draftBodiesToSave);
      setPendingSavedBodies(null);
      enqueueSuccessSnackBar({ message: copy.saveSuccess });
    } catch {
      enqueueErrorSnackBar({ message: copy.saveError });
      setPendingSavedBodies(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (
      isSaving ||
      (blocker.state !== 'blocked' && !pendingSidePanelResume.current)
    ) {
      return;
    }

    const resume = pendingSidePanelResume.current;
    pendingSidePanelResume.current = null;
    setDraftBodies(savedBodies);
    setEditorVersions((currentVersions) => {
      const nextVersions = { ...currentVersions };

      for (const fieldName of dirtyFieldNames) {
        nextVersions[fieldName] += 1;
      }

      return nextVersions;
    });
    if (resume) {
      closeModal(unsavedChangesModalId);
      resume();
    }
  };

  const handleKeepEditing = () => {
    if (pendingSidePanelResume.current) {
      pendingSidePanelResume.current = null;
      closeModal(unsavedChangesModalId);
    }
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const editorRows = fields.map(
    ({ fieldMetadataItem, fieldName, placeholder, showFormattingControls }) => {
      const labelId = `campaign-settings-${fieldMetadataItem.id}-label`;

      return (
        <StyledFieldRow
          aria-labelledby={labelId}
          key={fieldMetadataItem.id}
          role="group"
        >
          <StyledGuidance>
            <StyledLabel id={labelId}>{fieldMetadataItem.label}</StyledLabel>
            <StyledDescription>
              {fieldMetadataItem.description}
            </StyledDescription>
          </StyledGuidance>
          <StyledEditorCard data-testid="campaign-rich-text-settings-editor-card">
            <RichTextFieldEditor
              editorMinHeight={80}
              fieldName={fieldName}
              key={`${fieldName}-${editorVersions[fieldName]}`}
              objectNameSingular="campaign"
              onBodyChange={(blocknote) =>
                setDraftBodies((current) => ({
                  ...current,
                  [fieldName]: blocknote,
                }))
              }
              placeholder={placeholder}
              recordId={campaignId}
              shouldPersistChanges={false}
              showFormattingControls={showFormattingControls}
            />
          </StyledEditorCard>
        </StyledFieldRow>
      );
    },
  );

  return (
    <MyahCampaignRichTextSettingsSurface
      actions={
        <Button
          accent="brand"
          disabled={!isDirty || isSaving}
          isLoading={isSaving}
          onClick={handleSave}
          title={copy.saveLabel ?? t`Save`}
        />
      }
      contentBeforeFields={contentBeforeFields}
      contentAfterFields={contentAfterFields}
      description={description}
      sidebar={sidebar}
      fields={editorRows}
      modal={
        <ConfirmationModal
          cancelButtonText={copy.keepEditing}
          confirmButtonText={t`Discard changes`}
          loading={isSaving}
          modalInstanceId={unsavedChangesModalId}
          onClose={handleKeepEditing}
          onConfirmClick={handleDiscardChanges}
          subtitle={copy.unsavedChangesSubtitle}
          title={t`Discard unsaved changes?`}
        />
      }
      title={title}
    />
  );
};

export const MyahCampaignRichTextSettings = <FieldName extends string>({
  campaignId,
  description,
  contentBeforeFields,
  contentAfterFields,
  sidebar,
  copy,
  fields,
  modalIdPrefix,
  interceptSidePanelTabChange,
  title,
}: MyahCampaignRichTextSettingsProps<FieldName>): React.ReactElement => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const { recordLoading } = useRecordShowContainerData({
    objectRecordId: campaignId,
  });
  const [recordInStore] = useAtom(
    recordStoreFamilyState.atomFamily(campaignId),
  );

  const campaignMetadata = objectMetadataItems.find(
    (objectMetadataItem) => objectMetadataItem.nameSingular === 'campaign',
  );
  const resolvedFields = fields.flatMap((field) => {
    const fieldMetadataItem = campaignMetadata?.fields.find(
      (metadataField) => metadataField.name === field.fieldName,
    );

    return fieldMetadataItem ? [{ ...field, fieldMetadataItem }] : [];
  }) as ResolvedCampaignRichTextField<FieldName>[];
  const campaignRecord = recordInStore as
    | CampaignRichTextRecord<FieldName>
    | null
    | undefined;
  const isRecordHydrated =
    campaignRecord !== null &&
    campaignRecord !== undefined &&
    fields.every(({ fieldName }) => fieldName in campaignRecord);
  const isReady =
    recordLoading === false &&
    resolvedFields.length === fields.length &&
    isRecordHydrated;
  const skeletonRows = fields.map(({ fieldName }) => (
    <StyledFieldRow key={fieldName}>
      <StyledSkeletonGuidance />
      <StyledSkeletonEditor />
    </StyledFieldRow>
  ));

  if (!isReady) {
    return (
      <MyahCampaignRichTextSettingsSurface
        actions={
          <Button accent="brand" disabled title={copy.saveLabel ?? t`Save`} />
        }
        contentBeforeFields={contentBeforeFields}
        contentAfterFields={contentAfterFields}
        description={description}
        sidebar={sidebar}
        fields={skeletonRows}
        title={title}
      />
    );
  }

  const persistedBodies = Object.fromEntries(
    fields.map(({ fieldName }) => [
      fieldName,
      campaignRecord[fieldName]?.blocknote ?? '',
    ]),
  ) as CampaignRichTextBodies<FieldName>;

  return (
    <MyahCampaignRichTextSettingsEditor
      campaignId={campaignId}
      contentBeforeFields={contentBeforeFields}
      contentAfterFields={contentAfterFields}
      description={description}
      sidebar={sidebar}
      copy={copy}
      fields={resolvedFields}
      key={campaignId}
      modalIdPrefix={modalIdPrefix}
      interceptSidePanelTabChange={interceptSidePanelTabChange}
      persistedBodies={persistedBodies}
      title={title}
    />
  );
};
