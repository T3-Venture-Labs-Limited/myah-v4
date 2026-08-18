import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

import { SidePanelList } from '@/side-panel/components/SidePanelList';
import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { SidePanelTopBar } from '@/side-panel/components/SidePanelTopBar';
import {
  SidePanelSearchResultList,
  type SidePanelSearchResultListProps,
} from '@/side-panel/pages/search/components/SidePanelSearchResultList';
import { SidePanelSearchRecordsPage } from '@/side-panel/pages/search/components/SidePanelSearchRecordsPage';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { sidePanelPageInfoState } from '@/side-panel/states/sidePanelPageInfoState';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { sidePanelSearchFocusRestoreElementState } from '@/side-panel/states/sidePanelSearchFocusRestoreElementState';
import { sidePanelSearchState } from '@/side-panel/states/sidePanelSearchState';
import { SidePanelPages } from 'twenty-shared/types';
import { IconDotsVertical } from 'twenty-ui/icon';

const closeCommandMenuMock = jest.fn();
const closeSidePanelMenuMock = jest.fn();
const navigateMock = jest.fn();
const openRecordInSidePanelMock = jest.fn();

jest.mock('@/command-menu-item/hooks/useCloseCommandMenu', () => ({
  useCloseCommandMenu: () => ({
    closeCommandMenu: closeCommandMenuMock,
  }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: openRecordInSidePanelMock,
  }),
}));

jest.mock('@/side-panel/pages/search/hooks/useSidePanelSearchRecords', () => ({
  useSidePanelSearchRecords: () => ({
    searchResultItems: [
      {
        id: 'campaign-id',
        label: 'Launch',
        objectNameSingular: 'campaign',
        recordId: 'campaign-id',
        imageUrl: null,
        objectLabel: 'Campaign',
        avatarType: 'rounded',
      },
    ],
    loading: false,
    noResults: false,
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateMock,
}));

jest.mock('@/side-panel/components/SidePanelTopBarInputFocusEffect', () => ({
  SidePanelTopBarInputFocusEffect: () => null,
}));

jest.mock('@/side-panel/components/SidePanelTopBarRightCornerIcon', () => ({
  SidePanelTopBarRightCornerIcon: () => null,
}));

jest.mock('@/side-panel/hooks/useSidePanelContextChips', () => ({
  useSidePanelContextChips: () => ({ contextChips: [] }),
}));

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({
    closeSidePanelMenu: closeSidePanelMenuMock,
  }),
}));

const searchResultItems: SidePanelSearchResultListProps['items'] = [
  {
    id: 'campaign-id',
    label: 'Launch',
    objectNameSingular: 'campaign',
    recordId: 'campaign-id',
    imageUrl: null,
    objectLabel: 'Campaign',
    avatarType: 'rounded',
  },
  {
    id: 'creator-list-id',
    label: 'Launch',
    objectNameSingular: 'creatorList',
    recordId: 'creator-list-id',
    imageUrl: null,
    objectLabel: 'Creator List',
    avatarType: 'rounded',
  },
];

const renderSearchResultList = (onActivate = jest.fn()) => {
  const store = createStore();

  return {
    onActivate,
    ...render(
      <JotaiProvider store={store}>
        <MemoryRouter>
          <SidePanelList
            selectableItemIds={searchResultItems.map((item) => item.id)}
            role="listbox"
            ariaLabel="Search results"
            status="2 results found"
          >
            <SidePanelSearchResultList
              items={searchResultItems}
              onActivate={onActivate}
            />
          </SidePanelList>
        </MemoryRouter>
      </JotaiProvider>,
    ),
  };
};

const createSearchResultListStore = () => {
  const store = createStore();
  const navigationStack = [
    {
      page: SidePanelPages.SearchRecords,
      pageTitle: 'Search',
      pageIcon: IconDotsVertical,
      pageId: 'search-records',
    },
  ];

  store.set(sidePanelPageState.atom, SidePanelPages.SearchRecords);
  store.set(sidePanelNavigationStackState.atom, navigationStack);
  store.set(sidePanelPageInfoState.atom, {
    title: 'Search',
    Icon: IconDotsVertical,
    instanceId: 'search-records',
  });

  return store;
};

const renderSearchResultListWithInput = (
  initialItems = searchResultItems,
  onActivate = jest.fn(),
) => {
  const store = createSearchResultListStore();

  const renderContent = (items: SidePanelSearchResultListProps['items']) => (
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={store}>
        <SidePanelTopBar />
        <SidePanelList
          selectableItemIds={items.map((item) => item.id)}
          role="listbox"
          ariaLabel="Search results"
        >
          <SidePanelSearchResultList items={items} onActivate={onActivate} />
        </SidePanelList>
      </JotaiProvider>
    </I18nProvider>
  );

  const rendered = render(renderContent(initialItems));

  return {
    onActivate,
    rerender: (items: SidePanelSearchResultListProps['items']) => {
      rendered.rerender(renderContent(items));
    },
    store,
  };
};

describe('SidePanelSearchResultList', () => {
  it('provides roving listbox focus and keyboard activation for search results', async () => {
    const { onActivate } = renderSearchResultList();

    const firstOption = screen.getByRole('option', {
      name: 'Launch, Campaign',
    });
    const secondOption = screen.getByRole('option', {
      name: 'Launch, Creator List',
    });

    expect(
      screen.getByRole('listbox', { name: 'Search results' }),
    ).toBeVisible();

    await waitFor(() => {
      expect(firstOption).toHaveAttribute('tabindex', '0');
      expect(secondOption).toHaveAttribute('tabindex', '-1');
    });

    act(() => firstOption.focus());

    fireEvent.keyDown(firstOption, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(secondOption).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(secondOption);
    });

    fireEvent.keyDown(secondOption, { key: 'ArrowDown' });
    expect(secondOption).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(secondOption);

    fireEvent.keyDown(secondOption, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(firstOption);
    });

    fireEvent.keyDown(firstOption, { key: 'Home' });
    expect(firstOption).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(firstOption);

    fireEvent.keyDown(firstOption, { key: 'End' });
    await waitFor(() => {
      expect(secondOption).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(secondOption);
    });

    fireEvent.keyDown(secondOption, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenLastCalledWith(searchResultItems[1]);

    const spaceEvent = createEvent.keyDown(secondOption, { key: ' ' });
    fireEvent(secondOption, spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenLastCalledWith(searchResultItems[1]);

    onActivate.mockClear();
    fireEvent.click(screen.getAllByText('Launch')[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(searchResultItems[0]);
  });

  it('activates the selected result once when Enter is pressed in the Search input', async () => {
    const { onActivate } = renderSearchResultListWithInput();

    const input = screen.getByTestId(SIDE_PANEL_FOCUS_ID);
    const firstOption = screen.getByRole('option', {
      name: 'Launch, Campaign',
    });

    input.focus();

    await waitFor(() => {
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(searchResultItems[0]);
  });

  it('closes Search with one Escape when a result option is focused', () => {
    closeSidePanelMenuMock.mockClear();

    const { store } = renderSearchResultListWithInput();
    const input = screen.getByTestId(SIDE_PANEL_FOCUS_ID);
    const firstOption = screen.getByRole('option', {
      name: 'Launch, Campaign',
    });

    fireEvent.change(input, { target: { value: 'company' } });
    act(() => firstOption.focus());

    fireEvent.keyDown(firstOption, { key: 'Escape' });

    expect(store.get(sidePanelSearchState.atom)).toBe('company');
    expect(closeSidePanelMenuMock).toHaveBeenCalledTimes(1);
  });

  it('reconciles focused replacements without stealing input focus', async () => {
    const replacementItems: SidePanelSearchResultListProps['items'] = [
      {
        ...searchResultItems[0],
        id: 'replacement-id',
        label: 'Replacement',
        recordId: 'replacement-id',
      },
    ];
    const nextReplacementItems: SidePanelSearchResultListProps['items'] = [
      {
        ...searchResultItems[0],
        id: 'next-replacement-id',
        label: 'Next replacement',
        recordId: 'next-replacement-id',
      },
    ];

    const { rerender } = renderSearchResultListWithInput();
    const input = screen.getByTestId(SIDE_PANEL_FOCUS_ID);

    input.focus();
    rerender(replacementItems);

    expect(document.activeElement).toBe(input);

    const replacementOption = screen.getByRole('option', {
      name: 'Replacement, Campaign',
    });
    act(() => replacementOption.focus());

    rerender(nextReplacementItems);

    const nextReplacementOption = screen.getByRole('option', {
      name: 'Next replacement, Campaign',
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(nextReplacementOption);
    });

    rerender([]);

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    rerender(replacementItems);

    expect(document.activeElement).toBe(input);
  });

  it('announces opt-in search result status changes', () => {
    const store = createStore();
    const { rerender } = render(
      <JotaiProvider store={store}>
        <MemoryRouter>
          <SidePanelList
            selectableItemIds={[]}
            role="listbox"
            ariaLabel="Search results"
            status="Loading search results"
          >
            {null}
          </SidePanelList>
        </MemoryRouter>
      </JotaiProvider>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading search results');

    rerender(
      <JotaiProvider store={store}>
        <MemoryRouter>
          <SidePanelList
            selectableItemIds={[]}
            role="listbox"
            ariaLabel="Search results"
            status="2 results found"
          >
            {null}
          </SidePanelList>
        </MemoryRouter>
      </JotaiProvider>,
    );
    expect(status).toHaveTextContent('2 results found');

    rerender(
      <JotaiProvider store={store}>
        <MemoryRouter>
          <SidePanelList
            selectableItemIds={[]}
            role="listbox"
            ariaLabel="Search results"
            status="No results found"
          >
            {null}
          </SidePanelList>
        </MemoryRouter>
      </JotaiProvider>,
    );
    expect(status).toHaveTextContent('No results found');
  });

  it('clears the Search focus restore element before navigating to a record page', () => {
    jest.clearAllMocks();

    const store = createStore();
    const searchButton = document.createElement('button');
    searchButton.textContent = 'Search';
    document.body.append(searchButton);
    searchButton.focus();
    store.set(sidePanelSearchFocusRestoreElementState.atom, {
      restoreElement: searchButton,
    });

    closeCommandMenuMock.mockImplementation(() => {
      expect(
        store.get(sidePanelSearchFocusRestoreElementState.atom),
      ).toBeNull();
    });
    navigateMock.mockImplementation(() => {
      expect(
        store.get(sidePanelSearchFocusRestoreElementState.atom),
      ).toBeNull();
    });

    render(
      <I18nProvider i18n={i18n}>
        <JotaiProvider store={store}>
          <MemoryRouter>
            <SidePanelSearchRecordsPage />
          </MemoryRouter>
        </JotaiProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('Launch'));

    expect(closeCommandMenuMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
