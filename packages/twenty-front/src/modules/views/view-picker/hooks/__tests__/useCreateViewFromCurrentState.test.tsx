import { act, renderHook } from '@testing-library/react';

import { useCreateViewFromCurrentState } from '@/views/view-picker/hooks/useCreateViewFromCurrentState';
import { viewPickerTypeComponentState } from '@/views/view-picker/states/viewPickerTypeComponentState';
import { ViewType } from '@/views/types/ViewType';

const mockChangeView = jest.fn();
const mockCloseAndResetViewPicker = jest.fn();
const mockCreateViewFromCurrentView = jest.fn();
const mockStore = { get: jest.fn(), set: jest.fn() };

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: (state: unknown) => state,
  }),
);
jest.mock('@/views/hooks/useChangeView', () => ({
  useChangeView: (onViewChange?: (viewId: string) => void) => ({
    changeView: onViewChange ?? mockChangeView,
  }),
}));
jest.mock('@/views/hooks/useCreateViewFromCurrentView', () => ({
  useCreateViewFromCurrentView: () => ({
    createViewFromCurrentView: mockCreateViewFromCurrentView,
  }),
}));
jest.mock('@/views/view-picker/hooks/useCloseAndResetViewPicker', () => ({
  useCloseAndResetViewPicker: () => ({
    closeAndResetViewPicker: mockCloseAndResetViewPicker,
  }),
}));
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));

describe('useCreateViewFromCurrentState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateViewFromCurrentView.mockResolvedValue('new-view');
    mockStore.get.mockImplementation((state) =>
      state === viewPickerTypeComponentState ? ViewType.CALENDAR : undefined,
    );
  });

  it('persists TABLE when a scoped picker is forced to Table', async () => {
    const onViewChange = jest.fn();
    const { result } = renderHook(() =>
      useCreateViewFromCurrentState(onViewChange, ViewType.TABLE),
    );

    await act(async () => {
      await result.current.createViewFromCurrentState();
    });

    expect(mockCreateViewFromCurrentView).toHaveBeenCalledWith(
      expect.objectContaining({ type: ViewType.TABLE }),
      false,
    );
    expect(onViewChange).toHaveBeenCalledWith('new-view');
  });
});
