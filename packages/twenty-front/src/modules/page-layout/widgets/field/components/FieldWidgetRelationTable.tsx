import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { buildFieldWidgetRelationTableScope } from '@/page-layout/widgets/field/utils/buildFieldWidgetRelationTableScope';
import { RecordFilterValueDependenciesContext } from '@/object-record/record-filter/contexts/RecordFilterValueDependenciesContext';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { RECORD_TABLE_ROW_HEIGHT } from '@/object-record/record-table/constants/RecordTableRowHeight';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { RecordTableWidgetRendererContent } from '@/page-layout/widgets/record-table/components/RecordTableWidgetRendererContent';
import { isFieldWidget } from '@/page-layout/widgets/field/utils/isFieldWidget';
import { useCurrentWidget } from '@/page-layout/widgets/hooks/useCurrentWidget';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';

const FIELD_WIDGET_RELATION_TABLE_MAX_VISIBLE_RECORDS = 20;

const FIELD_WIDGET_RELATION_TABLE_MAX_HEIGHT_IN_PX =
  (FIELD_WIDGET_RELATION_TABLE_MAX_VISIBLE_RECORDS + 2) *
  RECORD_TABLE_ROW_HEIGHT;

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-height: ${FIELD_WIDGET_RELATION_TABLE_MAX_HEIGHT_IN_PX}px;
  min-height: 0;
`;

type FieldWidgetRelationTableProps = {
  fieldDefinition: FieldDefinition<FieldRelationMetadata>;
  recordId: string;
};

export const FieldWidgetRelationTable = ({
  fieldDefinition,
  recordId,
}: FieldWidgetRelationTableProps) => {
  const widget = useCurrentWidget();

  const isPageLayoutInEditMode = useIsPageLayoutInEditMode();
  const { objectMetadataItems } = useObjectMetadataItems();
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const viewId = isFieldWidget(widget)
    ? widget.configuration.viewId
    : undefined;

  const relationObjectMetadataId =
    fieldDefinition.metadata.relationObjectMetadataId;
  const recordPageObjectMetadataNameSingular =
    fieldDefinition.metadata.objectMetadataNameSingular;

  const source = objectMetadataItems.find(
    (item) => item.nameSingular === recordPageObjectMetadataNameSingular,
  );
  const target = objectMetadataItems.find(
    (item) => item.id === relationObjectMetadataId,
  );
  const scope = buildFieldWidgetRelationTableScope({
    recordId,
    source,
    target,
    definition: fieldDefinition,
    permissions: isDefined(currentUserWorkspace?.objectsPermissions)
      ? objectPermissionsByObjectMetadataId
      : undefined,
  });

  if (
    !isDefined(viewId) ||
    !isDefined(recordPageObjectMetadataNameSingular) ||
    !isDefined(currentWorkspace?.id) ||
    !isDefined(scope)
  ) {
    return null;
  }

  return (
    <RecordFilterValueDependenciesContext.Provider
      value={{
        currentRecord: {
          id: recordId,
          objectMetadataNameSingular: recordPageObjectMetadataNameSingular,
        },
      }}
    >
      <StyledContainer>
        <RecordTableWidgetRendererContent
          objectMetadataId={relationObjectMetadataId}
          viewId={viewId}
          widgetId={widget.id}
          isReadOnly={isPageLayoutInEditMode}
          isEmptyStateHidden
          queryOnlyRecordFilters={[scope.filter]}
          requiredCreationInput={scope.creationInput}
          scopeInstanceId={`${currentWorkspace.id}-${widget.id}-${recordId}`}
        />
      </StyledContainer>
    </RecordFilterValueDependenciesContext.Provider>
  );
};
