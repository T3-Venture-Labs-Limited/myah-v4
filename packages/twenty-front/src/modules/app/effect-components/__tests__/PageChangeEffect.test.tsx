import { render, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { PageChangeEffect } from '@/app/effect-components/PageChangeEffect';
import { usePageChangeEffectNavigateLocation } from '~/hooks/usePageChangeEffectNavigateLocation';

const navigate = jest.fn();
const noOp = jest.fn();
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
jest.mock(
  '@/object-record/record-title-cell/hooks/useOpenNewRecordTitleCell',
  () => ({
    useOpenNewRecordTitleCell: () => ({ openNewRecordTitleCell: noOp }),
  }),
);
jest.mock('@/ui/utilities/focus/hooks/useResetFocusStackToFocusItem', () => ({
  useResetFocusStackToFocusItem: () => ({ resetFocusStackToFocusItem: noOp }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => '',
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => true,
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
  isMatchingLocation: () => false,
}));

describe('PageChangeEffect', () => {
  beforeEach(() => {
    navigate.mockReset();
    store.get.mockClear();
    store.set.mockClear();
    jest
      .mocked(usePageChangeEffectNavigateLocation)
      .mockReturnValue(todayDestinationByState.pending);
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

  const todayDestinationByState = {
    forbidden: '/myah/today',
    missing: undefined,
    pending: undefined,
    ready: '/myah/today',
  } as const;
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

  const expectTodayRedirectAfterResolution = async (
    resolvedState: 'ready' | 'forbidden',
  ) => {
    const view = renderEffect();

    await waitFor(() => expect(navigate).not.toHaveBeenCalled());

    jest
      .mocked(usePageChangeEffectNavigateLocation)
      .mockReturnValue(todayDestinationByState.missing);
    view.rerender(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/myah']}
      >
        <RouteTransitionEffect />
        <PageChangeEffect />
      </MemoryRouter>,
    );
    await waitFor(() => expect(navigate).not.toHaveBeenCalled());

    jest
      .mocked(usePageChangeEffectNavigateLocation)
      .mockReturnValue(todayDestinationByState[resolvedState]);
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
    expect(navigate).toHaveBeenLastCalledWith('/myah/today');

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

  it('navigates to Today exactly once when Today becomes ready', async () => {
    await expectTodayRedirectAfterResolution('ready');
  });

  it('navigates to Today exactly once when Today is forbidden', async () => {
    await expectTodayRedirectAfterResolution('forbidden');
  });

  it('navigates again when the route moves away while the target is unchanged', async () => {
    const target = '/myah/today?tab=tasks#priority';
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
