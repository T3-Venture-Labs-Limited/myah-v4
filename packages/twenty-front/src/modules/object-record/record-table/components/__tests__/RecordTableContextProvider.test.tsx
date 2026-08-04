import { render, screen } from '@testing-library/react';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { RecordTableContextProvider } from '@/object-record/record-table/components/RecordTableContextProvider';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';

const mockUseGetCurrentViewOnly = jest.fn();
const mockUseAtomStateValue = jest.fn();

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'creator-object', nameSingular: 'creator' },
  }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canReadObjectRecords: true }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: jest.fn() }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue', () => ({
  useAtomComponentSelectorValue: () => [],
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockUseAtomStateValue(),
}));

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => mockUseGetCurrentViewOnly(),
}));

const RecordTableTriggerEvent = () => {
  const { triggerEvent } = useRecordTableContextOrThrow();

  return <output data-testid="record-table-trigger-event">{triggerEvent}</output>;
};

const renderRecordTable = (contextStoreInstanceId: string) =>
  render(
    <ContextStoreComponentInstanceContext.Provider
      value={{ instanceId: contextStoreInstanceId }}
    >
      <RecordTableContextProvider
        objectNameSingular="creator"
        recordTableId="creator-table"
        viewBarId="creator-view"
      >
        <RecordTableTriggerEvent />
      </RecordTableContextProvider>
    </ContextStoreComponentInstanceContext.Provider>,
  );

describe('RecordTableContextProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomStateValue.mockReturnValue(ViewOpenRecordIn.SIDE_PANEL);
    mockUseGetCurrentViewOnly.mockReturnValue({
      currentView: { openRecordIn: ViewOpenRecordIn.RECORD_PAGE },
    });
  });

  it('uses the isolated current view mode instead of the main index mode', () => {
    renderRecordTable('creator-list-pane-list-a');

    expect(screen.getByTestId('record-table-trigger-event')).toHaveTextContent(
      'MOUSE_DOWN',
    );
  });

  it('keeps the main index trigger tied to its global index mode', () => {
    renderRecordTable(MAIN_CONTEXT_STORE_INSTANCE_ID);

    expect(screen.getByTestId('record-table-trigger-event')).toHaveTextContent(
      'CLICK',
    );
  });
});
