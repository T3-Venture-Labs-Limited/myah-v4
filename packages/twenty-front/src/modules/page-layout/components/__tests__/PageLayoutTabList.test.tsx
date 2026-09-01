import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PageLayoutType } from '~/generated-metadata/graphql';

import { PageLayoutTabList } from '@/page-layout/components/PageLayoutTabList';
import { type PageLayoutTab } from '@/page-layout/types/PageLayoutTab';

const mockNavigate = jest.fn();
const mockSetActiveTabId = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('twenty-ui/icon', () => ({
  IconPlus: () => null,
  useIcons: () => ({ getIcon: () => undefined }),
}));

jest.mock('@/page-layout/components/PageLayoutTabListVisibleTabs', () => ({
  PageLayoutTabListVisibleTabs: ({
    onSelectTab,
  }: {
    onSelectTab: (tabId: string) => void;
  }) => (
    <button onClick={() => onSelectTab('agent-tab')} type="button">
      Select Agent
    </button>
  ),
}));

jest.mock(
  '@/ui/layout/tab-list/components/TabListFromUrlOptionalEffect',
  () => ({
    TabListFromUrlOptionalEffect: () => null,
  }),
);

jest.mock('@/ui/layout/tab-list/components/TabListHiddenMeasurements', () => ({
  TabListHiddenMeasurements: () => null,
}));

jest.mock('@/ui/utilities/dimensions/components/NodeDimension', () => ({
  NodeDimension: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/ui/layout/tab-list/components/TabListDropdown', () => ({
  TabListDropdown: () => null,
}));

jest.mock(
  '@/page-layout/components/PageLayoutTabListReorderableOverflowDropdown',
  () => ({
    PageLayoutTabListReorderableOverflowDropdown: () => null,
  }),
);

jest.mock('@/page-layout/hooks/useIsPageLayoutInEditMode', () => ({
  useIsPageLayoutInEditMode: () => false,
}));

jest.mock('@/ui/layout/tab-list/hooks/useTabListMeasurements', () => ({
  useTabListMeasurements: () => ({
    hasHiddenTabs: false,
    hiddenTabs: [],
    hiddenTabsCount: 0,
    onAddButtonWidthChange: jest.fn(),
    onContainerWidthChange: jest.fn(),
    onMoreButtonWidthChange: jest.fn(),
    onTabWidthChange: jest.fn(),
    visibleTabCount: 2,
  }),
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));

jest.mock('@/ui/layout/dropdown/hooks/useOpenDropdown', () => ({
  useOpenDropdown: () => ({ openDropdown: jest.fn() }),
}));

jest.mock('@/ui/utilities/pointer-event/hooks/useClickOutsideListener', () => ({
  useClickOutsideListener: () => ({ toggleClickOutside: jest.fn() }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentState', () => ({
  useAtomComponentState: () => ['home-tab', mockSetActiveTabId],
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

jest.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: () => 'layout-1',
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => undefined,
  }),
);

jest.mock(
  '@/side-panel/pages/page-layout/hooks/useNavigatePageLayoutSidePanel',
  () => ({
    useNavigatePageLayoutSidePanel: () => ({
      navigatePageLayoutSidePanel: jest.fn(),
    }),
  }),
);

// The mocked visible-tab renderer consumes only id and title; production fills
// the remaining generated metadata properties before PageLayoutTabList mounts.
const tabs = [
  { id: 'home-tab', position: 0, title: 'Home' },
  { id: 'agent-tab', position: 1, title: 'Agent' },
] as unknown as PageLayoutTab[];

describe('PageLayoutTabList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets Router navigation own active-tab changes when tabs behave as links', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PageLayoutTabList
          behaveAsLinks
          componentInstanceId="tab-list-1"
          isInSidePanel={false}
          isReorderEnabled={false}
          pageLayoutType={PageLayoutType.RECORD_PAGE}
          tabs={tabs}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Agent' }));

    expect(mockNavigate).toHaveBeenCalledWith('#agent-tab');
    expect(mockSetActiveTabId).not.toHaveBeenCalled();
  });

  it('updates active-tab state directly when tabs do not behave as links', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PageLayoutTabList
          behaveAsLinks={false}
          componentInstanceId="tab-list-1"
          isInSidePanel={false}
          isReorderEnabled={false}
          pageLayoutType={PageLayoutType.RECORD_PAGE}
          tabs={tabs}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Agent' }));

    expect(mockNavigate).toHaveBeenCalledWith('#agent-tab');
    expect(mockSetActiveTabId).toHaveBeenCalledWith('agent-tab');
  });
});
