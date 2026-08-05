import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useStore } from 'jotai';
import { useUpdateCurrentView } from '@/views/hooks/useUpdateCurrentView';
import { type GraphQLView } from '@/views/types/GraphQLView';
import { type ViewOpenRecordIn } from '~/generated-metadata/graphql';
import { viewPickerInputNameComponentState } from '@/views/view-picker/states/viewPickerInputNameComponentState';
import { viewPickerSelectedIconComponentState } from '@/views/view-picker/states/viewPickerSelectedIconComponentState';
import { useCallback, useContext } from 'react';

export const useUpdateObjectViewOptions = () => {
  const store = useStore();

  const contextStoreInstance = useContext(ContextStoreComponentInstanceContext);

  const setRecordIndexOpenRecordIn = useSetAtomState(
    recordIndexOpenRecordInState,
  );

  const setViewPickerInputName = useSetAtomComponentState(
    viewPickerInputNameComponentState,
  );

  const setViewPickerSelectedIcon = useSetAtomComponentState(
    viewPickerSelectedIconComponentState,
  );

  const { updateCurrentView } = useUpdateCurrentView();

  const setAndPersistOpenRecordIn = useCallback(
    (openRecordIn: ViewOpenRecordIn, view: GraphQLView | undefined) => {
      if (!view) return;
      if (
        (contextStoreInstance?.instanceId ?? MAIN_CONTEXT_STORE_INSTANCE_ID) ===
        MAIN_CONTEXT_STORE_INSTANCE_ID
      ) {
        setRecordIndexOpenRecordIn(openRecordIn);
        store.set(recordIndexOpenRecordInState.atom, openRecordIn);
      }
      updateCurrentView({
        openRecordIn,
      });
    },
    [
      contextStoreInstance?.instanceId,
      setRecordIndexOpenRecordIn,
      store,
      updateCurrentView,
    ],
  );

  const setAndPersistViewName = useCallback(
    (viewName: string, view: GraphQLView | undefined) => {
      if (!view) return;
      setViewPickerInputName(viewName);
      updateCurrentView({
        name: viewName,
      });
    },
    [setViewPickerInputName, updateCurrentView],
  );

  const setAndPersistViewIcon = useCallback(
    (viewIcon: string, view: GraphQLView | undefined) => {
      if (!view) return;
      setViewPickerSelectedIcon(viewIcon);
      updateCurrentView({
        icon: viewIcon,
      });
    },
    [setViewPickerSelectedIcon, updateCurrentView],
  );

  return {
    setAndPersistOpenRecordIn,
    setAndPersistViewName,
    setAndPersistViewIcon,
  };
};
