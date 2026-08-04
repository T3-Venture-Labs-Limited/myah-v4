import { useCreatorListContextFromId } from '@/myah/creator-crm/hooks/useCreatorListContext';
import { CreatorListBulkActionsContext } from '@/myah/creator-crm/contexts/CreatorListBulkActionsContext';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { useResetFocusStackToRecordIndex } from '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useViewOrDefaultView } from '@/views/hooks/useViewOrDefaultView';
import { PageFocusId } from '@/types/PageFocusId';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useCallback, useMemo, useState } from 'react';
import { AppPath, ViewFilterOperand } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const CREATOR_LIST_PANE_MEMBERSHIP_FILTER_ID =
  'b1a160cf-7c5a-4137-b55e-f676c0e9d955';

const StyledScopeHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledScopeTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledScopeState = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  justify-content: center;
  min-height: ${themeCssVariables.spacing[12]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: center;
`;

type CreatorListScopedCreatorIndexProps = {
  creatorListId: string;
  onClose: () => void;
};

export const CreatorListScopedCreatorIndex = ({
  creatorListId,
  onClose,
}: CreatorListScopedCreatorIndexProps) => {
  const isMobile = useIsMobile();
  const { objectMetadataItems } = useObjectMetadataItems();
  const creatorObjectMetadataItem = objectMetadataItems.find(
    (item) => item.nameSingular === 'creator',
  );
  const creatorListObjectMetadataItem = objectMetadataItems.find(
    (item) => item.nameSingular === 'creatorList',
  );
  const creatorPermissions = useObjectPermissionsForObject(
    creatorObjectMetadataItem?.id ?? '',
  );
  const creatorListPermissions = useObjectPermissionsForObject(
    creatorListObjectMetadataItem?.id ?? '',
  );
  const { view: defaultCreatorView } = useViewOrDefaultView({
    objectMetadataItemId: creatorObjectMetadataItem?.id ?? '',
  });
  const [selectedCreatorView, setSelectedCreatorView] = useState<
    { creatorListId: string; viewId: string } | undefined
  >();
  const selectedCreatorViewId =
    selectedCreatorView?.creatorListId === creatorListId
      ? selectedCreatorView.viewId
      : defaultCreatorView?.id;
  const { resetFocusStackToRecordIndex } = useResetFocusStackToRecordIndex();

  const creatorListContext = useCreatorListContextFromId(creatorListId);
  const {
    loading: isCreatorListLoading,
    error: creatorListError,
    refetch: refetchCreatorList,
  } = useFindOneRecord({
    objectNameSingular: 'creatorList',
    objectRecordId: creatorListId,
    recordGqlFields: { id: true, name: true },
  });
  const creatorListRelationFilter = useMemo<RecordFilter | undefined>(() => {
    if (!creatorListContext) {
      return undefined;
    }

    return {
      id: CREATOR_LIST_PANE_MEMBERSHIP_FILTER_ID,
      fieldMetadataId: creatorListContext.filter.fieldMetadataId,
      relationTargetFieldMetadataId:
        creatorListContext.filter.relationTargetFieldMetadataId,
      type: 'RELATION',
      operand: ViewFilterOperand.IS,
      value: creatorListContext.target.id,
      displayValue: '',
      label: `List: ${creatorListContext.target.label}`,
      subFieldName: null,
    };
  }, [creatorListContext]);
  const creatorShowUrl = useCallback(
    (creatorId: string) =>
      getAppPath(
        AppPath.RecordShowPage,
        {
          objectNameSingular: 'creator',
          objectRecordId: creatorId,
        },
        { viewId: selectedCreatorViewId },
      ),
    [selectedCreatorViewId],
  );

  const handleCreatorViewChange = useCallback(
    (viewId: string) => {
      setSelectedCreatorView({ creatorListId, viewId });
    },
    [creatorListId],
  );
  const handleClose = useCallback(() => {
    resetFocusStackToRecordIndex(PageFocusId.RecordIndex);
    onClose();
  }, [onClose, resetFocusStackToRecordIndex]);

  const scopeContent =
    !creatorObjectMetadataItem || !creatorListObjectMetadataItem ? (
      <StyledScopeState>{t`Creator List is unavailable.`}</StyledScopeState>
    ) : !creatorPermissions.canReadObjectRecords ? (
      <StyledScopeState>
        {t`You do not have permission to view Creators.`}
      </StyledScopeState>
    ) : !creatorListPermissions.canReadObjectRecords ? (
      <StyledScopeState>
        {t`You do not have permission to view Creator Lists.`}
      </StyledScopeState>
    ) : isCreatorListLoading ? (
      <StyledScopeState>{t`Loading Creator List…`}</StyledScopeState>
    ) : creatorListError ? (
      <StyledScopeState>
        {t`Unable to load Creator List.`}
        <Button
          Icon={IconRefresh}
          ariaLabel={t`Retry`}
          onClick={() => void refetchCreatorList()}
          title={t`Retry`}
          variant="secondary"
        />
      </StyledScopeState>
    ) : !creatorListContext || !creatorListRelationFilter ? (
      <StyledScopeState>{t`Creator List is unavailable.`}</StyledScopeState>
    ) : !selectedCreatorViewId ? (
      <StyledScopeState>{t`Loading Creator view…`}</StyledScopeState>
    ) : (
      <CreatorListBulkActionsContext.Provider value={creatorListContext}>
        <RecordIndexSurface
          key={creatorListId}
          contextStoreInstanceId={`creator-list-pane-${creatorListId}`}
          objectNameSingular="creator"
          viewId={selectedCreatorViewId}
          onViewChange={handleCreatorViewChange}
          indexIdentifierUrl={creatorShowUrl}
          initialQueryOnlyRecordFilters={[creatorListRelationFilter]}
        />
      </CreatorListBulkActionsContext.Provider>
    );

  return (
    <>
      <StyledScopeHeader>
        <StyledScopeTitle tabIndex={-1}>
          {creatorListContext
            ? `List: ${creatorListContext.target.label}`
            : t`Creator List`}
        </StyledScopeTitle>
        <Button
          ariaLabel={
            isMobile ? t`Back to Creator Lists` : t`Close Creator List`
          }
          onClick={handleClose}
          title={isMobile ? t`Back to Creator Lists` : t`Close Creator List`}
        />
      </StyledScopeHeader>
      {scopeContent}
    </>
  );
};
