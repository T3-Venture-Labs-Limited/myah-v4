import { getCommandMenuIdFromRecordIndexId } from '@/command-menu-item/utils/getCommandMenuIdFromRecordIndexId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { lastShowPageRecordIdState } from '@/object-record/record-field/ui/states/lastShowPageRecordId';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { RecordIndexContainer } from '@/object-record/record-index/components/RecordIndexContainer';
import { RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect } from '@/object-record/record-index/components/RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect';
import { RecordIndexEmptyStateNotShared } from '@/object-record/record-index/components/RecordIndexEmptyStateNotShared';
import {
  RecordIndexContextProvider,
  type RecordIndexOpenRequest,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { RecordIndexLoadBaseOnContextStoreEffect } from '@/object-record/record-index/components/RecordIndexLoadBaseOnContextStoreEffect';
import { RecordIndexPageHeader } from '@/object-record/record-index/components/RecordIndexPageHeader';
import { RecordIndexSurfaceContextStoreInitEffect } from '@/object-record/record-index/components/RecordIndexSurfaceContextStoreInitEffect';
import { RecordIndexViewBar } from '@/object-record/record-index/components/RecordIndexViewBar';
import { RecordIndexViewFieldsSSESyncEffect } from '@/object-record/record-index/components/RecordIndexViewFieldsSSESyncEffect';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { getRecordIndexIdFromObjectNamePluralAndViewIdAndContextStoreInstanceId } from '@/object-record/utils/getRecordIndexIdFromObjectNamePluralAndViewId';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { RECORD_INDEX_DRAG_SELECT_BOUNDARY_CLASS } from '@/ui/utilities/drag-select/constants/RecordIndecDragSelectBoundaryClass';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { PageTitleEffect } from '@/ui/utilities/page-title/components/PageTitleEffect';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { ViewType } from '@/views/types/ViewType';
import { ViewBarControlIdsProvider } from '@/views/contexts/ViewBarControlIdsContext';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

const StyledIndexContainer = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
`;

export type RecordIndexSurfaceProps = {
  contextStoreInstanceId: string;
  objectNameSingular: string;
  viewId: string;
  indexIdentifierUrl: (recordId: string) => string;
  onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
  shouldPreserveParentViewStateOnOpen?: boolean;
  shouldUseIndexIdentifierUrlOnFullPageOpen?: boolean;
  onRecordCreated?: (record: ObjectRecord) => Promise<void>;
  onViewChange?: (viewId: string) => void;
  initialQueryOnlyRecordFilters?: RecordFilter[];
  headerTitle?: string;
  headerActionButton?: ReactNode;
};

type RecordIndexSurfaceInstanceProps = RecordIndexSurfaceProps;

type RecordIndexSurfaceInitialQueryOnlyRecordFiltersEffectProps = {
  initialQueryOnlyRecordFilters: RecordFilter[];
  recordIndexId: string;
  onInitialized: () => void;
};

const RecordIndexSurfaceInitialQueryOnlyRecordFiltersEffect = ({
  initialQueryOnlyRecordFilters,
  recordIndexId,
  onInitialized,
}: RecordIndexSurfaceInitialQueryOnlyRecordFiltersEffectProps) => {
  const setQueryOnlyRecordFilters = useSetAtomComponentState(
    queryOnlyRecordFiltersComponentState,
    recordIndexId,
  );

  useEffect(() => {
    setQueryOnlyRecordFilters(initialQueryOnlyRecordFilters);
    onInitialized();

    return () => {
      setQueryOnlyRecordFilters([]);
    };
  }, [initialQueryOnlyRecordFilters, onInitialized, setQueryOnlyRecordFilters]);

  return null;
};

const RecordIndexSurfaceInstance = ({
  contextStoreInstanceId,
  objectNameSingular,
  viewId,
  indexIdentifierUrl,
  onOpenRecordFromIndexView,
  shouldPreserveParentViewStateOnOpen,
  shouldUseIndexIdentifierUrlOnFullPageOpen,
  onRecordCreated,
  onViewChange,
  initialQueryOnlyRecordFilters = [],
  headerTitle,
  headerActionButton,
}: RecordIndexSurfaceInstanceProps) => {
  const store = useStore();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const objectPermissions = getObjectPermissionsForObject(
    objectPermissionsByObjectMetadataId,
    objectMetadataItem.id,
  );
  const recordIndexId =
    getRecordIndexIdFromObjectNamePluralAndViewIdAndContextStoreInstanceId(
      objectMetadataItem.namePlural,
      viewId,
      contextStoreInstanceId,
    );
  const isIsolatedSurface =
    contextStoreInstanceId !== MAIN_CONTEXT_STORE_INSTANCE_ID;
  const {
    fieldDefinitionByFieldMetadataItemId,
    fieldMetadataItemByFieldMetadataItemId,
    labelIdentifierFieldMetadataItem,
    recordFieldByFieldMetadataItemId,
  } = useRecordIndexFieldMetadataDerivedStates(
    objectMetadataItem,
    recordIndexId,
  );
  const [isContextStoreInitialized, setIsContextStoreInitialized] =
    useState(false);
  const [
    areInitialQueryOnlyRecordFiltersInitialized,
    setAreInitialQueryOnlyRecordFiltersInitialized,
  ] = useState(false);
  const handleIndexRecordsLoaded = useCallback(() => {
    store.set(lastShowPageRecordIdState.atom, null);
  }, [store]);
  const handleInitialQueryOnlyRecordFiltersInitialized = useCallback(() => {
    setAreInitialQueryOnlyRecordFiltersInitialized(true);
  }, []);

  return (
    <ContextStoreComponentInstanceContext.Provider
      value={{ instanceId: contextStoreInstanceId }}
    >
      {isIsolatedSurface && (
        <RecordIndexSurfaceContextStoreInitEffect
          contextStoreInstanceId={contextStoreInstanceId}
          objectMetadataItemId={objectMetadataItem.id}
          viewId={viewId}
          onInitialized={() => setIsContextStoreInitialized(true)}
        />
      )}
      {(!isIsolatedSurface || isContextStoreInitialized) && (
        <ViewBarControlIdsProvider viewBarId={recordIndexId}>
          <RecordIndexContextProvider
            value={{
              objectPermissionsByObjectMetadataId,
              recordIndexId,
              viewBarInstanceId: recordIndexId,
              objectNamePlural: objectMetadataItem.namePlural,
              objectNameSingular,
              objectMetadataItem,
              onIndexRecordsLoaded: handleIndexRecordsLoaded,
              indexIdentifierUrl,
              onOpenRecordFromIndexView,
              shouldPreserveParentViewStateOnOpen,
              shouldUseIndexIdentifierUrlOnFullPageOpen,
              onViewChange,
              onRecordCreated,
              recordFieldByFieldMetadataItemId,
              labelIdentifierFieldMetadataItem,
              fieldMetadataItemByFieldMetadataItemId,
              fieldDefinitionByFieldMetadataItemId,
            }}
          >
            <ViewComponentInstanceContext.Provider
              value={{ instanceId: recordIndexId }}
            >
              <RecordComponentInstanceContextsWrapper
                componentInstanceId={recordIndexId}
              >
                {isIsolatedSurface && (
                  <RecordIndexSurfaceInitialQueryOnlyRecordFiltersEffect
                    initialQueryOnlyRecordFilters={
                      initialQueryOnlyRecordFilters
                    }
                    recordIndexId={recordIndexId}
                    onInitialized={
                      handleInitialQueryOnlyRecordFiltersInitialized
                    }
                  />
                )}
                <CommandMenuComponentInstanceContext.Provider
                  value={{
                    instanceId:
                      getCommandMenuIdFromRecordIndexId(recordIndexId),
                  }}
                >
                  <PageTitleEffect
                    key={recordIndexId}
                    title={headerTitle ?? objectMetadataItem.labelPlural}
                  />
                  <PageCardLayout
                    header={
                      <RecordIndexPageHeader
                        contextStoreInstanceId={contextStoreInstanceId}
                        headerActionButton={headerActionButton}
                        headerTitle={headerTitle}
                      />
                    }
                    secondaryBar={
                      objectPermissions.canReadObjectRecords &&
                      (!isIsolatedSurface ||
                        areInitialQueryOnlyRecordFiltersInitialized) && (
                        <RecordIndexViewBar
                          recordIndexViewTypeOverride={
                            isIsolatedSurface ? ViewType.TABLE : undefined
                          }
                        />
                      )
                    }
                  >
                    <StyledIndexContainer
                      className={RECORD_INDEX_DRAG_SELECT_BOUNDARY_CLASS}
                    >
                      {objectPermissions.canReadObjectRecords ? (
                        (!isIsolatedSurface ||
                          areInitialQueryOnlyRecordFiltersInitialized) && (
                          <>
                            <RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect />
                            <RecordIndexContainer
                              recordIndexViewTypeOverride={
                                isIsolatedSurface ? ViewType.TABLE : undefined
                              }
                            />
                          </>
                        )
                      ) : (
                        <RecordIndexEmptyStateNotShared />
                      )}
                    </StyledIndexContainer>
                  </PageCardLayout>
                </CommandMenuComponentInstanceContext.Provider>
                <RecordIndexLoadBaseOnContextStoreEffect
                  recordIndexId={recordIndexId}
                  skipGlobalIndexStates={isIsolatedSurface}
                />
                <RecordIndexViewFieldsSSESyncEffect
                  recordIndexId={recordIndexId}
                  skipGlobalIndexStates={isIsolatedSurface}
                />
              </RecordComponentInstanceContextsWrapper>
            </ViewComponentInstanceContext.Provider>
          </RecordIndexContextProvider>
        </ViewBarControlIdsProvider>
      )}
    </ContextStoreComponentInstanceContext.Provider>
  );
};

export const RecordIndexSurface = ({
  contextStoreInstanceId,
  objectNameSingular,
  viewId,
  indexIdentifierUrl,
  onOpenRecordFromIndexView,
  shouldPreserveParentViewStateOnOpen,
  shouldUseIndexIdentifierUrlOnFullPageOpen,
  onRecordCreated,
  onViewChange,
  initialQueryOnlyRecordFilters,
  headerTitle,
  headerActionButton,
}: RecordIndexSurfaceProps) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const recordIndexId =
    getRecordIndexIdFromObjectNamePluralAndViewIdAndContextStoreInstanceId(
      objectMetadataItem.namePlural,
      viewId,
      contextStoreInstanceId,
    );
  const scopeKey = `${recordIndexId}-${JSON.stringify(
    initialQueryOnlyRecordFilters ?? [],
  )}`;

  return (
    <RecordIndexSurfaceInstance
      key={scopeKey}
      contextStoreInstanceId={contextStoreInstanceId}
      objectNameSingular={objectNameSingular}
      viewId={viewId}
      indexIdentifierUrl={indexIdentifierUrl}
      onOpenRecordFromIndexView={onOpenRecordFromIndexView}
      shouldPreserveParentViewStateOnOpen={shouldPreserveParentViewStateOnOpen}
      shouldUseIndexIdentifierUrlOnFullPageOpen={
        shouldUseIndexIdentifierUrlOnFullPageOpen
      }
      onViewChange={onViewChange}
      onRecordCreated={onRecordCreated}
      initialQueryOnlyRecordFilters={initialQueryOnlyRecordFilters}
      headerActionButton={headerActionButton}
      headerTitle={headerTitle}
    />
  );
};
