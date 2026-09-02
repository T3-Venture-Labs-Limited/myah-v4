import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { RecordFieldListComponentInstanceContext } from '@/object-record/record-field-list/states/contexts/RecordFieldListComponentInstanceContext';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { FieldsWidgetCellEditModePortal } from '@/page-layout/widgets/fields/components/FieldsWidgetCellEditModePortal';
import { FieldsWidgetCellHoveredPortal } from '@/page-layout/widgets/fields/components/FieldsWidgetCellHoveredPortal';
import { FieldsWidgetFieldList } from '@/page-layout/widgets/fields/components/FieldsWidgetFieldList';
import { FieldsWidgetGroupContainer } from '@/page-layout/widgets/fields/components/FieldsWidgetGroupContainer';
import { useFieldsWidgetGroupsForDisplay } from '@/page-layout/widgets/fields/hooks/useFieldsWidgetGroupsForDisplay';
import { useFieldsWidgetHiddenFieldsForDisplay } from '@/page-layout/widgets/fields/hooks/useFieldsWidgetHiddenFieldsForDisplay';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';
import { SidePanelProvider } from '@/ui/layout/side-panel/contexts/SidePanelContext';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
} from 'twenty-ui/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type FieldsConfiguration } from '~/generated-metadata/graphql';
import { isDefined } from 'twenty-shared/utils';

const StyledContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledPropertyBox = styled.div`
  align-self: stretch;
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-bottom: ${themeCssVariables.spacing[3]};
  padding-top: ${themeCssVariables.spacing[3]};
`;

const StyledInlineFieldsPropertyBox = styled.div<{
  hasMoreGroup: boolean;
}>`
  align-self: stretch;
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-bottom: ${({ hasMoreGroup }) =>
    hasMoreGroup ? themeCssVariables.spacing[3] : '0'};
  padding-top: 0;
`;

type FieldsWidgetProps = {
  widget: PageLayoutWidget;
  includeFieldNames?: readonly string[];
};

export const FieldsWidget = ({
  widget,
  includeFieldNames,
}: FieldsWidgetProps) => {
  const targetRecord = useTargetRecord();
  const { isInSidePanel } = useLayoutRenderingContext();

  const instanceId = `fields-${widget.id}-${targetRecord.id}${isInSidePanel ? '-side-panel' : ''}`;

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: targetRecord.targetObjectNameSingular,
  });

  const fieldsConfiguration = widget.configuration as FieldsConfiguration;

  const { groups, displayMode } = useFieldsWidgetGroupsForDisplay({
    widgetId: widget.id,
    viewId: fieldsConfiguration.viewId ?? null,
    objectNameSingular: targetRecord.targetObjectNameSingular,
  });

  const { hiddenFields } = useFieldsWidgetHiddenFieldsForDisplay({
    widgetId: widget.id,
    viewId: fieldsConfiguration.viewId ?? null,
    objectNameSingular: targetRecord.targetObjectNameSingular,
  });

  const includedFieldNames = isDefined(includeFieldNames)
    ? new Set(includeFieldNames)
    : null;

  const groupsToDisplay = includedFieldNames
    ? (() => {
        let nextGlobalIndex = 0;

        return groups
          .map((group) => ({
            ...group,
            fields: group.fields
              .filter(({ fieldMetadataItem }) =>
                includedFieldNames.has(fieldMetadataItem.name),
              )
              .map((field) => ({
                ...field,
                globalIndex: nextGlobalIndex++,
              })),
          }))
          .filter((group) => group.fields.length > 0);
      })()
    : groups;

  const hiddenFieldsToDisplay = includedFieldNames
    ? hiddenFields.filter(({ fieldMetadataItem }) =>
        includedFieldNames.has(fieldMetadataItem.name),
      )
    : hiddenFields;

  const shouldShowHiddenFields =
    fieldsConfiguration.shouldAllowUserToSeeHiddenFields === true &&
    hiddenFieldsToDisplay.length > 0;

  const visibleFields = groupsToDisplay.flatMap((group) => group.fields);

  const hiddenFieldsWithOffsetGlobalIndex = shouldShowHiddenFields
    ? hiddenFieldsToDisplay.map((field, index) => ({
        ...field,
        globalIndex: includedFieldNames
          ? visibleFields.length + index
          : field.globalIndex + visibleFields.length,
      }))
    : [];

  const flattenedFieldMetadataItems = [
    ...visibleFields.map((field) => field.fieldMetadataItem),
    ...hiddenFieldsWithOffsetGlobalIndex.map(
      (field) => field.fieldMetadataItem,
    ),
  ];

  const hasFieldsToDisplay =
    groupsToDisplay.length > 0 ||
    (includedFieldNames !== null && shouldShowHiddenFields);

  if (!hasFieldsToDisplay) {
    return (
      <SidePanelProvider value={{ isInSidePanel }}>
        <StyledContainer>
          <AnimatedPlaceholderEmptyContainer>
            <AnimatedPlaceholder type="noRecord" />
            <AnimatedPlaceholderEmptyTextContainer>
              <AnimatedPlaceholderEmptyTitle>
                {t`No fields to display`}
              </AnimatedPlaceholderEmptyTitle>
              <AnimatedPlaceholderEmptySubTitle>
                {t`Configure this widget to display fields`}
              </AnimatedPlaceholderEmptySubTitle>
            </AnimatedPlaceholderEmptyTextContainer>
          </AnimatedPlaceholderEmptyContainer>
        </StyledContainer>
      </SidePanelProvider>
    );
  }

  return (
    <RecordFieldsScopeContextProvider value={{ scopeInstanceId: instanceId }}>
      <StyledContainer>
        <RecordFieldListComponentInstanceContext.Provider
          value={{
            instanceId,
          }}
        >
          {displayMode === 'inline' ? (
            <StyledInlineFieldsPropertyBox
              hasMoreGroup={shouldShowHiddenFields}
            >
              <FieldsWidgetFieldList
                fields={groupsToDisplay.flatMap((group) => group.fields)}
                instanceId={instanceId}
              />
            </StyledInlineFieldsPropertyBox>
          ) : (
            groupsToDisplay.map((group) => (
              <FieldsWidgetGroupContainer key={group.id} title={group.name}>
                <StyledPropertyBox>
                  <FieldsWidgetFieldList
                    fields={group.fields}
                    instanceId={instanceId}
                  />
                </StyledPropertyBox>
              </FieldsWidgetGroupContainer>
            ))
          )}

          {shouldShowHiddenFields && (
            <FieldsWidgetGroupContainer
              title={t`More (${hiddenFieldsWithOffsetGlobalIndex.length})`}
              defaultExpanded={false}
            >
              <StyledPropertyBox>
                <FieldsWidgetFieldList
                  fields={hiddenFieldsWithOffsetGlobalIndex}
                  instanceId={instanceId}
                />
              </StyledPropertyBox>
            </FieldsWidgetGroupContainer>
          )}

          <FieldsWidgetCellHoveredPortal
            objectMetadataItem={objectMetadataItem}
            recordId={targetRecord.id}
            flattenedFieldMetadataItems={flattenedFieldMetadataItems}
          />
          <FieldsWidgetCellEditModePortal
            objectMetadataItem={objectMetadataItem}
            recordId={targetRecord.id}
            flattenedFieldMetadataItems={flattenedFieldMetadataItems}
          />
        </RecordFieldListComponentInstanceContext.Provider>
      </StyledContainer>
    </RecordFieldsScopeContextProvider>
  );
};
