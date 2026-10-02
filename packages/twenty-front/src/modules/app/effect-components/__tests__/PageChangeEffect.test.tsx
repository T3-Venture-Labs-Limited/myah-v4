import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { RecordShowPageRoute } from '~/pages/object-record/RecordShowPageRoute';
import { isMatchingLocation } from '~/utils/isMatchingLocation';
import { pageLayoutsWithRelationsSelector } from '@/page-layout/states/pageLayoutsWithRelationsSelector';
import { getRecordFieldInputInstanceId } from '@/object-record/utils/getRecordFieldInputId';
import { RecordTitleCellContainerType } from '@/object-record/record-title-cell/types/RecordTitleCellContainerType';
import { isTitleCellInEditModeComponentState } from '@/object-record/record-title-cell/states/isTitleCellInEditModeComponentState';
import { PageChangeEffect } from '@/app/effect-components/PageChangeEffect';
import { usePageChangeEffectNavigateLocation } from '~/hooks/usePageChangeEffectNavigateLocation';

const navigate = jest.fn();
const noOp = jest.fn();
const mockPushFocusItemToFocusStack = jest.fn();
const mockResetFocusStackToFocusItem = jest.fn();
const mockAtomStateValue = jest.fn().mockReturnValue(true);
const getReturnToPath = jest.fn().mockReturnValue('');
const store = { get: jest.fn(), set: jest.fn() };
const { useNavigate: useActualNavigate } =
  jest.requireActual('react-router-dom');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
}));

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => store,
}));

jest.mock('~/hooks/usePageChangeEffectNavigateLocation');
jest.mock('@/app/hooks/useExecuteTasksOnAnyLocationChange', () => ({
  useExecuteTasksOnAnyLocationChange: () => ({
    executeTasksOnAnyLocationChange: noOp,
  }),
}));
jest.mock('@/auth/hooks/useReturnToPath', () => ({
  useReturnToPath: () => ({
    saveReturnToPath: noOp,
    getReturnToPath,
    clearReturnToPath: noOp,
  }),
}));
jest.mock('@/auth/hooks/useIsOnAuthOrOnboardingPage', () => ({
  useIsOnAuthOrOnboardingPage: () => false,
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: noOp }),
}));
jest.mock(
  '@/object-record/record-table/hooks/internal/useResetTableRowSelection',
  () => ({
    useResetTableRowSelection: () => ({ resetTableRowSelection: noOp }),
  }),
);
jest.mock(
  '@/object-record/record-table/hooks/useFocusedRecordTableRow',
  () => ({
    useFocusedRecordTableRow: () => ({ unfocusRecordTableRow: noOp }),
  }),
);
jest.mock('@/object-record/record-table/hooks/useActiveRecordTableRow', () => ({
  useActiveRecordTableRow: () => ({ deactivateRecordTableRow: noOp }),
}));
jest.mock(
  '@/object-record/record-board/hooks/useResetRecordBoardSelection',
  () => ({
    useResetRecordBoardSelection: () => ({ resetRecordBoardSelection: noOp }),
  }),
);
jest.mock(
  '@/object-record/record-board/hooks/useActiveRecordBoardCard',
  () => ({
    useActiveRecordBoardCard: () => ({ deactivateBoardCard: noOp }),
  }),
);
jest.mock(
  '@/object-record/record-board/hooks/useFocusedRecordBoardCard',
  () => ({
    useFocusedRecordBoardCard: () => ({ unfocusBoardCard: noOp }),
  }),
);
jest.mock(
  '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex',
  () => ({
    useResetFocusStackToRecordIndex: () => ({
      resetFocusStackToRecordIndex: noOp,
    }),
  }),
);
jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: mockPushFocusItemToFocusStack,
  }),
}));
jest.mock('@/ui/utilities/focus/hooks/useResetFocusStackToFocusItem', () => ({
  useResetFocusStackToFocusItem: () => ({
    resetFocusStackToFocusItem: mockResetFocusStackToFocusItem,
  }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => '',
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (...args: unknown[]) => mockAtomStateValue(...args),
}));
jest.mock(
  '@/object-record/utils/getRecordIndexIdFromObjectNamePluralAndViewId',
  () => ({
    getRecordIndexIdFromObjectNamePluralAndViewId: () => '',
  }),
);
jest.mock('~/modules/app/utils/getPageLayoutIdForLocation', () => ({
  getPageLayoutIdForLocation: () => undefined,
}));
jest.mock('~/utils/isMatchingLocation', () => ({
  isMatchingLocation: jest.fn(() => false),
}));
jest.mock('~/pages/object-record/RecordShowPage', () => ({
  RecordShowPage: () => <div>Other record</div>,
}));

describe('PageChangeEffect', () => {
  beforeEach(() => {
    navigate.mockReset();
    store.get.mockClear();
    store.set.mockClear();
    mockPushFocusItemToFocusStack.mockClear();
    mockResetFocusStackToFocusItem.mockClear();
    mockAtomStateValue.mockReturnValue(true);
    jest.mocked(isMatchingLocation).mockReturnValue(false);
    jest.mocked(usePageChangeEffectNavigateLocation).mockReturnValue(undefined);
  });

  const renderEffect = () =>
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/myah']}
      >
        <RouteTransitionEffect />
        <PageChangeEffect />
      </MemoryRouter>,
    );

  const RouteTransitionEffect = ({ destination }: { destination?: string }) => {
    const navigateToDestination = useActualNavigate();
    // Keep the test transition guard synchronous with its navigation call.
    // oxlint-disable-next-line twenty/no-state-useref
    const previousDestinationRef = useRef<string | undefined>(undefined);

    useEffect(() => {
      navigate.mockImplementation(navigateToDestination);

      if (
        destination !== previousDestinationRef.current &&
        destination !== undefined
      ) {
        previousDestinationRef.current = destination;
        navigateToDestination(destination);
      }
    }, [destination, navigateToDestination]);

    return null;
  };

  const expectInboxRedirectAfterDestinationAppears = async () => {
    const view = renderEffect();

    await waitFor(() => expect(navigate).not.toHaveBeenCalled());

    jest
      .mocked(usePageChangeEffectNavigateLocation)
      .mockReturnValue('/myah/inbox');
    view.rerender(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/myah']}
      >
        <RouteTransitionEffect />
        <PageChangeEffect />
      </MemoryRouter>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenLastCalledWith('/myah/inbox');

    view.rerender(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/myah']}
      >
        <RouteTransitionEffect />
        <PageChangeEffect />
      </MemoryRouter>,
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  };

  it('opens the created Campaign title exactly once after the generic URL redirects to the dedicated page', async () => {
    const realIsMatchingLocation = jest.requireActual(
      '~/utils/isMatchingLocation',
    ).isMatchingLocation;
    jest.mocked(isMatchingLocation).mockImplementation(realIsMatchingLocation);
    mockAtomStateValue.mockImplementation((atom: unknown) =>
      atom === pageLayoutsWithRelationsSelector ? [] : true,
    );

    const Create = () => {
      const navigateToRecord = useActualNavigate();
      return (
        <>
          <button
            onClick={() =>
              navigateToRecord('/object/campaign/campaign-id', {
                state: {
                  isNewRecord: true,
                  objectRecordId: 'campaign-id',
                  labelIdentifierFieldName: 'name',
                },
              })
            }
          >
            Create Campaign result
          </button>
          <button onClick={() => navigateToRecord(1)}>Forward</button>
        </>
      );
    };
    const Destination = () => {
      const location = useLocation();
      const navigateBack = useActualNavigate();
      return (
        <>
          <div data-testid="campaign-location">{`${location.pathname}:${JSON.stringify(location.state)}`}</div>
          <button onClick={() => navigateBack(-1)}>Back</button>
        </>
      );
    };

    render(
      <MemoryRouter initialEntries={['/previous']}>
        <PageChangeEffect />
        <Routes>
          <Route path="/previous" element={<Create />} />
          <Route
            path={AppPath.RecordShowPage}
            element={<RecordShowPageRoute />}
          />
          <Route path="/myah/campaigns/:campaignId" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Campaign result' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('campaign-location')).toHaveTextContent(
        '/myah/campaigns/campaign-id',
      ),
    );
    expect(screen.getByTestId('campaign-location')).toHaveTextContent(
      '"isNewRecord":true',
    );
    const instanceId = getRecordFieldInputInstanceId({
      recordId: 'campaign-id',
      fieldName: 'name',
      prefix: RecordTitleCellContainerType.PageHeader,
    });
    expect(mockPushFocusItemToFocusStack).toHaveBeenCalledTimes(1);
    expect(mockPushFocusItemToFocusStack).toHaveBeenCalledWith(
      expect.objectContaining({ focusId: instanceId }),
    );
    expect(store.set).toHaveBeenCalledWith(
      isTitleCellInEditModeComponentState.atomFamily({ instanceId }),
      true,
    );
    expect(mockResetFocusStackToFocusItem).toHaveBeenCalledTimes(1);
    expect(
      mockPushFocusItemToFocusStack.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      mockResetFocusStackToFocusItem.mock.invocationCallOrder[0],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Forward' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByTestId('campaign-location')).toHaveTextContent(
      '/myah/campaigns/campaign-id',
    );
    expect(mockPushFocusItemToFocusStack).toHaveBeenCalledTimes(1);
  });

  it('navigates to Inbox exactly once when the destination appears', async () => {
    await expectInboxRedirectAfterDestinationAppears();
  });

  it('navigates again when the route moves away while the target is unchanged', async () => {
    const target = '/myah/inbox?tab=tasks#priority';
    jest.mocked(usePageChangeEffectNavigateLocation).mockReturnValue(target);

    const view = render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={[target]}
      >
        <RouteTransitionEffect />
        <PageChangeEffect />
      </MemoryRouter>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenLastCalledWith(target);

    view.rerender(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={[target]}
      >
        <RouteTransitionEffect />
        <PageChangeEffect />
      </MemoryRouter>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));

    view.rerender(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={[target]}
      >
        <RouteTransitionEffect destination="/myah" />
        <PageChangeEffect />
      </MemoryRouter>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(navigate).toHaveBeenLastCalledWith(target);
  });
});
