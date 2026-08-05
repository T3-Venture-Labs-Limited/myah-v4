import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { useCommandMenuHotKeys } from '@/command-menu/hooks/useCommandMenuHotKeys';
import { useKeyboardShortcutMenu } from '@/keyboard-shortcut-menu/hooks/useKeyboardShortcutMenu';
import { useHandleSidePanelEscape } from '@/side-panel/hooks/useHandleSidePanelEscape';
import { useOpenAskAiPageInSidePanel } from '@/side-panel/hooks/useOpenAskAiPageInSidePanel';
import { useOpenRecordsSearchPageInSidePanel } from '@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';

jest.mock('@/keyboard-shortcut-menu/hooks/useKeyboardShortcutMenu', () => ({
  useKeyboardShortcutMenu: jest.fn(),
}));

jest.mock('@/side-panel/hooks/useHandleSidePanelEscape', () => ({
  useHandleSidePanelEscape: jest.fn(),
}));

jest.mock('@/side-panel/hooks/useOpenAskAiPageInSidePanel', () => ({
  useOpenAskAiPageInSidePanel: jest.fn(),
}));

jest.mock('@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel', () => ({
  useOpenRecordsSearchPageInSidePanel: jest.fn(),
}));

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: jest.fn(),
}));

const mockOpenAskAiPage = jest.fn();
const mockOpenRecordsSearchPage = jest.fn();
const mockToggleSidePanelMenu = jest.fn();
const mockOpenSidePanelMenu = jest.fn();
const mockCloseSidePanelMenu = jest.fn();
const mockNavigateSidePanelMenu = jest.fn();
const mockHandleSidePanelEscape = jest.fn();
const mockCloseKeyboardShortcutMenu = jest.fn();
const mockOpenKeyboardShortcutMenu = jest.fn();
const mockToggleKeyboardShortcutMenu = jest.fn();

type MockedNonHotkeyDependencies = {
  useKeyboardShortcutMenu: jest.MockedFunction<typeof useKeyboardShortcutMenu>;
  useHandleSidePanelEscape: jest.MockedFunction<
    typeof useHandleSidePanelEscape
  >;
  useOpenAskAiPageInSidePanel: jest.MockedFunction<
    typeof useOpenAskAiPageInSidePanel
  >;
  useOpenRecordsSearchPageInSidePanel: jest.MockedFunction<
    typeof useOpenRecordsSearchPageInSidePanel
  >;
  useSidePanelMenu: jest.MockedFunction<typeof useSidePanelMenu>;
};

const configureMockedNonHotkeyDependencies = ({
  useKeyboardShortcutMenu: mockUseKeyboardShortcutMenu,
  useHandleSidePanelEscape: mockUseHandleSidePanelEscape,
  useOpenAskAiPageInSidePanel: mockUseOpenAskAiPageInSidePanel,
  useOpenRecordsSearchPageInSidePanel: mockUseOpenRecordsSearchPageInSidePanel,
  useSidePanelMenu: mockUseSidePanelMenu,
}: MockedNonHotkeyDependencies) => {
  mockUseKeyboardShortcutMenu.mockReturnValue({
    closeKeyboardShortcutMenu: mockCloseKeyboardShortcutMenu,
    openKeyboardShortcutMenu: mockOpenKeyboardShortcutMenu,
    toggleKeyboardShortcutMenu: mockToggleKeyboardShortcutMenu,
  });
  mockUseHandleSidePanelEscape.mockReturnValue(mockHandleSidePanelEscape);
  mockUseOpenAskAiPageInSidePanel.mockReturnValue({
    openAskAiPage: mockOpenAskAiPage,
  });
  mockUseOpenRecordsSearchPageInSidePanel.mockReturnValue({
    openRecordsSearchPage: mockOpenRecordsSearchPage,
  });
  mockUseSidePanelMenu.mockReturnValue({
    closeSidePanelMenu: mockCloseSidePanelMenu,
    navigateSidePanelMenu: mockNavigateSidePanelMenu,
    openSidePanelMenu: mockOpenSidePanelMenu,
    toggleSidePanelMenu: mockToggleSidePanelMenu,
  });
};

const HotkeyHarness = () => {
  const [value, setValue] = React.useState('');

  useCommandMenuHotKeys();

  return (
    <textarea
      aria-label="Inbox reply"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
};

describe('useCommandMenuHotKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureMockedNonHotkeyDependencies({
      useKeyboardShortcutMenu: jest.mocked(useKeyboardShortcutMenu),
      useHandleSidePanelEscape: jest.mocked(useHandleSidePanelEscape),
      useOpenAskAiPageInSidePanel: jest.mocked(useOpenAskAiPageInSidePanel),
      useOpenRecordsSearchPageInSidePanel: jest.mocked(
        useOpenRecordsSearchPageInSidePanel,
      ),
      useSidePanelMenu: jest.mocked(useSidePanelMenu),
    });
  });

  it('allows literal @ entry in a textarea without opening Ask AI', async () => {
    render(<HotkeyHarness />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Inbox reply'), '@');

    expect(screen.getByLabelText('Inbox reply')).toHaveValue('@');
    expect(mockOpenAskAiPage).not.toHaveBeenCalled();
  });

  it('keeps the remaining global shortcuts registered without registering @', () => {
    const mockUseGlobalHotkeys = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('react', () => React);
      jest.doMock('@/ui/utilities/hotkey/hooks/useGlobalHotkeys', () => ({
        useGlobalHotkeys: mockUseGlobalHotkeys,
      }));
      jest.doMock(
        '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement',
        () => ({
          useHotkeysOnFocusedElement: jest.fn(),
        }),
      );

      const { useKeyboardShortcutMenu: useIsolatedKeyboardShortcutMenu } =
        require('@/keyboard-shortcut-menu/hooks/useKeyboardShortcutMenu') as {
          useKeyboardShortcutMenu: typeof useKeyboardShortcutMenu;
        };
      const { useHandleSidePanelEscape: useIsolatedHandleSidePanelEscape } =
        require('@/side-panel/hooks/useHandleSidePanelEscape') as {
          useHandleSidePanelEscape: typeof useHandleSidePanelEscape;
        };
      const {
        useOpenAskAiPageInSidePanel: useIsolatedOpenAskAiPageInSidePanel,
      } = require('@/side-panel/hooks/useOpenAskAiPageInSidePanel') as {
        useOpenAskAiPageInSidePanel: typeof useOpenAskAiPageInSidePanel;
      };
      const {
        useOpenRecordsSearchPageInSidePanel:
          useIsolatedOpenRecordsSearchPageInSidePanel,
      } = require('@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel') as {
        useOpenRecordsSearchPageInSidePanel: typeof useOpenRecordsSearchPageInSidePanel;
      };
      const { useSidePanelMenu: useIsolatedSidePanelMenu } =
        require('@/side-panel/hooks/useSidePanelMenu') as {
          useSidePanelMenu: typeof useSidePanelMenu;
        };

      configureMockedNonHotkeyDependencies({
        useKeyboardShortcutMenu: jest.mocked(useIsolatedKeyboardShortcutMenu),
        useHandleSidePanelEscape: jest.mocked(useIsolatedHandleSidePanelEscape),
        useOpenAskAiPageInSidePanel: jest.mocked(
          useIsolatedOpenAskAiPageInSidePanel,
        ),
        useOpenRecordsSearchPageInSidePanel: jest.mocked(
          useIsolatedOpenRecordsSearchPageInSidePanel,
        ),
        useSidePanelMenu: jest.mocked(useIsolatedSidePanelMenu),
      });

      const {
        useCommandMenuHotKeys: useIsolatedCommandMenuHotKeys,
      } = require('../useCommandMenuHotKeys');

      renderHook(() => useIsolatedCommandMenuHotKeys());
    });

    const registeredKeys = mockUseGlobalHotkeys.mock.calls.flatMap(
      ([{ keys }]) => keys,
    );

    expect(registeredKeys).toEqual(
      expect.arrayContaining(['ctrl+k', 'meta+k', '/']),
    );
    expect(registeredKeys).not.toContain('@');
  });
});
