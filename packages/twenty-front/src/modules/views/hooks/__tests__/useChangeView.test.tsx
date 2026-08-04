import { fireEvent, render, screen } from '@testing-library/react';

import { useSetViewInUrl } from '@/views/hooks/useSetViewInUrl';
import { useChangeView } from '@/views/hooks/useChangeView';

const mockSetViewInUrl = jest.fn();

jest.mock('@/views/hooks/useSetViewInUrl', () => ({
  useSetViewInUrl: jest.fn(),
}));

const ChangeViewButton = ({
  onViewChange,
}: {
  onViewChange?: (viewId: string) => void;
}) => {
  const { changeView } = useChangeView(onViewChange);

  return (
    <button onClick={() => changeView('creator-secondary-view')}>
      Change view
    </button>
  );
};

describe('useChangeView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSetViewInUrl as jest.Mock).mockReturnValue({
      setViewInUrl: mockSetViewInUrl,
    });
  });

  it('uses a scoped callback instead of changing the shared URL', () => {
    const onViewChange = jest.fn();

    render(<ChangeViewButton onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change view' }));

    expect(onViewChange).toHaveBeenCalledWith('creator-secondary-view');
    expect(mockSetViewInUrl).not.toHaveBeenCalled();
  });

  it('keeps URL navigation for callers without a scoped callback', () => {
    render(<ChangeViewButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Change view' }));

    expect(mockSetViewInUrl).toHaveBeenCalledWith('creator-secondary-view');
  });
});
