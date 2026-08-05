import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { contextStoreRecordShowParentViewComponentState } from '@/context-store/states/contextStoreRecordShowParentViewComponentState';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import {
  type RecordIndexOpenRequest,
  useRecordIndexContextOrThrow,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';
import { currentRecordSortsComponentState } from '@/object-record/record-sort/states/currentRecordSortsComponentState';
import { canOpenObjectInSidePanel } from '@/object-record/utils/canOpenObjectInSidePanel';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';
import { useStore } from 'jotai';
import { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath, SidePanelPages } from 'twenty-shared/types';
import { useIsMobile } from 'twenty-ui/utilities';
import { useNavigateApp } from '~/hooks/useNavigateApp';

export const useOpenRecordFromIndexView = () => {
  const { recordIndexId } = useRecordIndexContextOrThrow();

  const {
    objectNameSingular,
    indexIdentifierUrl,
    onOpenRecordFromIndexView,
    shouldPreserveParentViewStateOnOpen,
    shouldUseIndexIdentifierUrlOnFullPageOpen,
  } = useRecordIndexContextOrThrow();

  const navigate = useNavigateApp();
  const navigateTo = useNavigate();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const isMobile = useIsMobile();

  const currentRecordFilters = useAtomComponentStateCallbackState(
    currentRecordFiltersComponentState,
    recordIndexId,
  );

  const queryOnlyRecordFilters = useAtomComponentStateCallbackState(
    queryOnlyRecordFiltersComponentState,
    recordIndexId,
  );

  const currentRecordSorts = useAtomComponentStateCallbackState(
    currentRecordSortsComponentState,
    recordIndexId,
  );

  const currentRecordFilterGroups = useAtomComponentStateCallbackState(
    currentRecordFilterGroupsComponentState,
    recordIndexId,
  );

  const { closeSidePanelMenu } = useSidePanelMenu();

  const store = useStore();
  const contextStoreInstance = useContext(ContextStoreComponentInstanceContext);
  const { currentView } = useGetCurrentViewOnly();

  const openRecordFromIndexView = useCallback(
    (request: RecordIndexOpenRequest) => {
      const { recordId } = request;
      if (onOpenRecordFromIndexView && !shouldPreserveParentViewStateOnOpen) {
        onOpenRecordFromIndexView(request);
        return;
      }

      const recordIndexOpenRecordIn =
        contextStoreInstance?.instanceId &&
        contextStoreInstance.instanceId !== MAIN_CONTEXT_STORE_INSTANCE_ID
          ? (currentView?.openRecordIn ?? ViewOpenRecordIn.SIDE_PANEL)
          : store.get(recordIndexOpenRecordInState.atom);

      const currentParentViewFilters = store.get(currentRecordFilters);

      const queryOnlyParentViewFilters = store.get(queryOnlyRecordFilters);

      const parentViewFilters =
        queryOnlyParentViewFilters.length === 0
          ? currentParentViewFilters
          : [...currentParentViewFilters, ...queryOnlyParentViewFilters];

      const parentViewSorts = store.get(currentRecordSorts);

      const parentViewFilterGroups = store.get(currentRecordFilterGroups);

      store.set(
        contextStoreRecordShowParentViewComponentState.atomFamily({
          instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
        }),
        {
          parentViewComponentId: recordIndexId,
          parentViewObjectNameSingular: objectNameSingular,
          parentViewFilterGroups,
          parentViewFilters,
          parentViewSorts,
        },
      );
      if (onOpenRecordFromIndexView) {
        onOpenRecordFromIndexView(request);
        return;
      }

      if (
        !isMobile &&
        recordIndexOpenRecordIn === ViewOpenRecordIn.SIDE_PANEL &&
        canOpenObjectInSidePanel(objectNameSingular)
      ) {
        openRecordInSidePanel({
          recordId,
          objectNameSingular,
          resetNavigationStack: true,
        });
      } else {
        const isSidePanelAiChat =
          store.get(sidePanelPageState.atom) === SidePanelPages.AskAI;

        if (!isSidePanelAiChat) {
          closeSidePanelMenu();
        }

        if (shouldUseIndexIdentifierUrlOnFullPageOpen) {
          navigateTo(indexIdentifierUrl(recordId));
        } else {
          navigate(AppPath.RecordShowPage, {
            objectNameSingular,
            objectRecordId: recordId,
          });
        }
      }
    },
    [
      currentRecordFilters,
      queryOnlyRecordFilters,
      currentRecordSorts,
      currentRecordFilterGroups,
      recordIndexId,
      objectNameSingular,
      navigate,
      openRecordInSidePanel,
      isMobile,
      closeSidePanelMenu,
      store,
      currentView?.openRecordIn,
      contextStoreInstance?.instanceId,
      onOpenRecordFromIndexView,
      shouldPreserveParentViewStateOnOpen,
      shouldUseIndexIdentifierUrlOnFullPageOpen,
      indexIdentifierUrl,
      navigateTo,
    ],
  );

  return { openRecordFromIndexView };
};
