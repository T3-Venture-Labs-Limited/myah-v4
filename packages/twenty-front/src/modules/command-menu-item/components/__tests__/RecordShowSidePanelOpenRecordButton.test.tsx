import { fireEvent, render, screen } from '@testing-library/react';

import { RecordShowSidePanelOpenRecordButton } from '@/command-menu-item/components/RecordShowSidePanelOpenRecordButton';
import { AppPath } from 'twenty-shared/types';

const mockCloseSidePanelMenu = jest.fn();
const mockCloseDropdown = jest.fn();
const mockNavigate = jest.fn();
const mockSetActiveTabId = jest.fn();
const mockStore = { get: jest.fn(), set: jest.fn() };
const mockHotkeyConfigurations: Array<{ callback: () => void }> = [];
let mockShouldCloseAfterCreation = false;

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockCloseSidePanelMenu }),
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: mockCloseDropdown }),
}));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (componentState: { key: string }) =>
      componentState.key === 'side-panel/should-close-after-creation'
        ? mockShouldCloseAfterCreation
        : 'home',
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue', () => ({
  useAtomFamilyStateValue: () => ({ id: 'record-id' }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: () => 'parent-view-state',
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetActiveTabId,
}));

jest.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: () => 'command-menu-id',
  }),
);

jest.mock(
  '@/ui/utilities/state/component-state/hooks/useComponentInstanceStateContext',
  () => ({
    useComponentInstanceStateContext: () => ({
      instanceId: 'side-panel-page-id',
    }),
  }),
);

jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: ({ callback }: { callback: () => void }) => {
    mockHotkeyConfigurations.push({ callback });
  },
}));

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({ title, onClick }: { title: string; onClick: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
}));

describe('RecordShowSidePanelOpenRecordButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHotkeyConfigurations.length = 0;
    mockShouldCloseAfterCreation = false;
  });

  it('closes a scoped creation panel without navigating for both Done actions', () => {
    mockShouldCloseAfterCreation = true;

    render(
      <RecordShowSidePanelOpenRecordButton
        objectNameSingular="person"
        recordId="record-id"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    mockHotkeyConfigurations[0]?.callback();

    expect(mockCloseDropdown).toHaveBeenCalledTimes(2);
    expect(mockCloseSidePanelMenu).toHaveBeenCalledTimes(2);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockStore.set).not.toHaveBeenCalled();
  });

  it('keeps the default Open action intact', () => {
    render(
      <RecordShowSidePanelOpenRecordButton
        objectNameSingular="person"
        recordId="record-id"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(mockSetActiveTabId).toHaveBeenCalledWith('timeline');
    expect(mockStore.set).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(AppPath.RecordShowPage, {
      objectNameSingular: 'person',
      objectRecordId: 'record-id',
    });
    expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
    expect(mockCloseSidePanelMenu).toHaveBeenCalledTimes(1);
  });
});
