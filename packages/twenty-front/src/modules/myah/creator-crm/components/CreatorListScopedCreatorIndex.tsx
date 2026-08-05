import { CreatorListBulkActionsContext } from '@/myah/creator-crm/contexts/CreatorListBulkActionsContext';
import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';
import { useCreatorListContextFromId } from '@/myah/creator-crm/hooks/useCreatorListContext';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useResetFocusStackToRecordIndex } from '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useViewOrDefaultView } from '@/views/hooks/useViewOrDefaultView';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { PageFocusId } from '@/types/PageFocusId';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath, ViewFilterOperand, ViewType } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { IconArrowLeft, IconRefresh } from 'twenty-ui/icon';
import { Button, IconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const CREATOR_LIST_PANE_MEMBERSHIP_FILTER_ID =
  'b1a160cf-7c5a-4137-b55e-f676c0e9d955';

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
  const navigate = useNavigate();
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
  const views = useAtomStateValue(viewsSelector);
  const firstCreatorTableView = views.find(
    (view) =>
      view.objectMetadataId === creatorObjectMetadataItem?.id &&
      view.type === ViewType.TABLE,
  );

  const [selectedCreatorView, setSelectedCreatorView] = useState<
    { creatorListId: string; viewId: string } | undefined
  >();
  const selectedCreatorViewId =
    selectedCreatorView?.creatorListId === creatorListId
      ? selectedCreatorView.viewId
      : (defaultCreatorView?.id ?? firstCreatorTableView?.id);
  const { resetFocusStackToRecordIndex } = useResetFocusStackToRecordIndex();
  const { applyCreatorBulkRelationship } = useApplyCreatorBulkRelationship();
  const createdCreatorKeys = useMemo(() => new Set<string>(), []);

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
        { creatorListId, viewId: selectedCreatorViewId },
      ),
    [creatorListId, selectedCreatorViewId],
  );
  const handleOpenCreatorRecord = useCallback(
    ({ recordId }: RecordIndexOpenRequest) => {
      navigate(creatorShowUrl(recordId));
    },
    [creatorShowUrl, navigate],
  );

  const handleCreatorViewChange = useCallback(
    (viewId: string) => {
      setSelectedCreatorView({ creatorListId, viewId });
    },
    [creatorListId],
  );
  const handleCreatorCreated = useCallback(
    async (creator: { id: string }) => {
      if (!creatorListContext) {
        return;
      }

      const creatorKey = `${creatorListId}:${creator.id}`;
      if (createdCreatorKeys.has(creatorKey)) {
        return;
      }

      createdCreatorKeys.add(creatorKey);

      try {
        await applyCreatorBulkRelationship({
          target: creatorListContext.target,
          creatorIdsToAdd: [creator.id],
        });
      } catch (error) {
        createdCreatorKeys.delete(creatorKey);
        throw error;
      }
    },
    [
      applyCreatorBulkRelationship,
      createdCreatorKeys,
      creatorListContext,
      creatorListId,
    ],
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
          onOpenRecordFromIndexView={
            isMobile ? handleOpenCreatorRecord : undefined
          }
          onRecordCreated={handleCreatorCreated}
          initialQueryOnlyRecordFilters={[creatorListRelationFilter]}
          headerTitle={creatorListContext.target.label}
          headerActionButton={
            isMobile ? (
              <IconButton
                Icon={IconArrowLeft}
                ariaLabel={t`Back to Creator Lists`}
                dataTestId="creator-list-pane-back"
                onClick={handleClose}
              />
            ) : undefined
          }
        />
      </CreatorListBulkActionsContext.Provider>
    );

  return scopeContent;
};
