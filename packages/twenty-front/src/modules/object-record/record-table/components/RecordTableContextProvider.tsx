import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { visibleRecordFieldsComponentSelector } from '@/object-record/record-field/states/visibleRecordFieldsComponentSelector';
import { type RecordUpdateHookParams } from '@/object-record/record-field/ui/contexts/FieldContext';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';
import { RECORD_TABLE_CELL_INPUT_ID_PREFIX } from '@/object-record/record-table/constants/RecordTableCellInputIdPrefix';
import { RECORD_TABLE_COLUMN_MIN_WIDTH } from '@/object-record/record-table/constants/RecordTableColumnMinWidth';
import { RecordTableContextProvider as RecordTableContextInternalProvider } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableUpdateContext } from '@/object-record/record-table/contexts/RecordTableUpdateContext';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';
import { type ReactNode, useCallback, useContext } from 'react';

type RecordTableContextProviderProps = {
  viewBarId: string;
  recordTableId: string;
  objectNameSingular: string;
  onRecordIdentifierClick?: (
    rowIndex: number,
    recordId: string,
    activationElement?: HTMLElement,
  ) => void;
  children: ReactNode;
};

type MainRecordTableContextProviderProps = RecordTableContextProviderProps;

type ScopedRecordTableContextProviderProps = RecordTableContextProviderProps;

type RecordTableContextProviderContentProps =
  RecordTableContextProviderProps & {
    triggerEvent: 'CLICK' | 'MOUSE_DOWN';
  };

const RecordTableContextProviderContent = ({
  viewBarId,
  recordTableId,
  objectNameSingular,
  onRecordIdentifierClick,
  children,
  triggerEvent,
}: RecordTableContextProviderContentProps) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { objectMetadataItems } = useObjectMetadataItems();

  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  const visibleRecordFields = useAtomComponentSelectorValue(
    visibleRecordFieldsComponentSelector,
  );

  const { updateOneRecord } = useUpdateOneRecord();

  const updateRecord = useCallback(
    ({ variables }: RecordUpdateHookParams) => {
      updateOneRecord({
        objectNameSingular,
        idToUpdate: variables.where.id as string,
        updateOneRecordInput: variables.updateOneRecordInput,
      });
    },
    [objectNameSingular, updateOneRecord],
  );

  return (
    <RecordFieldsScopeContextProvider
      value={{ scopeInstanceId: RECORD_TABLE_CELL_INPUT_ID_PREFIX }}
    >
      <RecordTableContextInternalProvider
        value={{
          viewBarId,
          objectMetadataItem,
          objectMetadataItems,
          recordTableId,
          objectNameSingular,
          objectPermissions,
          visibleRecordFields: visibleRecordFields.map((field) => ({
            ...field,
            size: Math.max(field.size, RECORD_TABLE_COLUMN_MIN_WIDTH),
          })),
          onRecordIdentifierClick,
          triggerEvent,
        }}
      >
        <RecordTableUpdateContext.Provider value={updateRecord}>
          {children}
        </RecordTableUpdateContext.Provider>
      </RecordTableContextInternalProvider>
    </RecordFieldsScopeContextProvider>
  );
};

const MainRecordTableContextProvider = ({
  viewBarId,
  recordTableId,
  objectNameSingular,
  onRecordIdentifierClick,
  children,
}: MainRecordTableContextProviderProps) => {
  const recordIndexOpenRecordIn = useAtomStateValue(
    recordIndexOpenRecordInState,
  );
  const triggerEvent =
    recordIndexOpenRecordIn === ViewOpenRecordIn.SIDE_PANEL
      ? 'CLICK'
      : 'MOUSE_DOWN';

  return (
    <RecordTableContextProviderContent
      viewBarId={viewBarId}
      recordTableId={recordTableId}
      objectNameSingular={objectNameSingular}
      onRecordIdentifierClick={onRecordIdentifierClick}
      triggerEvent={triggerEvent}
    >
      {children}
    </RecordTableContextProviderContent>
  );
};

const ScopedRecordTableContextProvider = ({
  viewBarId,
  recordTableId,
  objectNameSingular,
  onRecordIdentifierClick,
  children,
}: ScopedRecordTableContextProviderProps) => {
  const { currentView } = useGetCurrentViewOnly();
  const triggerEvent =
    (currentView?.openRecordIn ?? ViewOpenRecordIn.SIDE_PANEL) ===
    ViewOpenRecordIn.SIDE_PANEL
      ? 'CLICK'
      : 'MOUSE_DOWN';

  return (
    <RecordTableContextProviderContent
      viewBarId={viewBarId}
      recordTableId={recordTableId}
      objectNameSingular={objectNameSingular}
      onRecordIdentifierClick={onRecordIdentifierClick}
      triggerEvent={triggerEvent}
    >
      {children}
    </RecordTableContextProviderContent>
  );
};

export const RecordTableContextProvider = ({
  viewBarId,
  recordTableId,
  objectNameSingular,
  onRecordIdentifierClick,
  children,
}: RecordTableContextProviderProps) => {
  const contextStoreInstance = useContext(ContextStoreComponentInstanceContext);
  return contextStoreInstance?.instanceId &&
    contextStoreInstance.instanceId !== MAIN_CONTEXT_STORE_INSTANCE_ID ? (
    <ScopedRecordTableContextProvider
      viewBarId={viewBarId}
      recordTableId={recordTableId}
      objectNameSingular={objectNameSingular}
      onRecordIdentifierClick={onRecordIdentifierClick}
    >
      {children}
    </ScopedRecordTableContextProvider>
  ) : (
    <MainRecordTableContextProvider
      viewBarId={viewBarId}
      recordTableId={recordTableId}
      objectNameSingular={objectNameSingular}
      onRecordIdentifierClick={onRecordIdentifierClick}
    >
      {children}
    </MainRecordTableContextProvider>
  );
};
