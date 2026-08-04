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
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { RecordIndexLoadBaseOnContextStoreEffect } from '@/object-record/record-index/components/RecordIndexLoadBaseOnContextStoreEffect';
import {
  RecordIndexPageHeader,
  type RecordIndexPageHeaderProps,
} from '@/object-record/record-index/components/RecordIndexPageHeader';
import { RecordIndexSurfaceContextStoreInitEffect } from '@/object-record/record-index/components/RecordIndexSurfaceContextStoreInitEffect';
import { RecordIndexViewBar } from '@/object-record/record-index/components/RecordIndexViewBar';
import { RecordIndexViewFieldsSSESyncEffect } from '@/object-record/record-index/components/RecordIndexViewFieldsSSESyncEffect';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { getRecordIndexIdFromObjectNamePluralAndViewId } from '@/object-record/utils/getRecordIndexIdFromObjectNamePluralAndViewId';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { RECORD_INDEX_DRAG_SELECT_BOUNDARY_CLASS } from '@/ui/utilities/drag-select/constants/RecordIndecDragSelectBoundaryClass';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { ViewType } from '@/views/types/ViewType';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

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
  initialQueryOnlyRecordFilters?: RecordFilter[];
  creatorListContext?: RecordIndexPageHeaderProps['creatorListContext'];
};


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
  initialQueryOnlyRecordFilters = [],
  creatorListContext,
}: RecordIndexSurfaceProps) => {
  const store = useStore();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const objectPermissions = getObjectPermissionsForObject(
    objectPermissionsByObjectMetadataId,
    objectMetadataItem.id,
  );
  const recordIndexId = getRecordIndexIdFromObjectNamePluralAndViewId(
    objectMetadataItem.namePlural,
    contextStoreInstanceId === MAIN_CONTEXT_STORE_INSTANCE_ID
      ? viewId
      : `${viewId}-${contextStoreInstanceId}`,
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
  const [areInitialQueryOnlyRecordFiltersInitialized, setAreInitialQueryOnlyRecordFiltersInitialized] =
    useState(false);
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
                  initialQueryOnlyRecordFilters={initialQueryOnlyRecordFilters}
                  recordIndexId={recordIndexId}
                  onInitialized={handleInitialQueryOnlyRecordFiltersInitialized}
                />
              )}
              <CommandMenuComponentInstanceContext.Provider
                value={{
                  instanceId: getCommandMenuIdFromRecordIndexId(recordIndexId),
                }}
              >
                <PageTitle title={objectMetadataItem.labelPlural} />
                <PageCardLayout
                  header={
                    <RecordIndexPageHeader
                      contextStoreInstanceId={contextStoreInstanceId}
                      creatorListContext={creatorListContext}
                    />
                  }
                  secondaryBar={
                    objectPermissions.canReadObjectRecords && (
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
      )}
    </ContextStoreComponentInstanceContext.Provider>
  );
};

export const RecordIndexSurface = (props: RecordIndexSurfaceProps) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: props.objectNameSingular,
  });
  const recordIndexId = getRecordIndexIdFromObjectNamePluralAndViewId(
    objectMetadataItem.namePlural,
    props.contextStoreInstanceId === MAIN_CONTEXT_STORE_INSTANCE_ID
      ? props.viewId
      : `${props.viewId}-${props.contextStoreInstanceId}`,
  );
  const scopeKey = `${recordIndexId}-${JSON.stringify(
    props.initialQueryOnlyRecordFilters ?? [],
  )}`;

  return <RecordIndexSurfaceInstance key={scopeKey} {...props} />;
};
