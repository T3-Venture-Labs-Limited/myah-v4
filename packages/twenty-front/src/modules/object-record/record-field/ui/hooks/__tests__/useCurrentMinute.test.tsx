import { act, render, screen } from '@testing-library/react';

import { useCurrentMinute } from '@/object-record/record-field/ui/hooks/useCurrentMinute';

const CurrentMinute = () => {
  const currentMinute = useCurrentMinute();

  return <time>{currentMinute.toISOString()}</time>;
};

describe('useCurrentMinute', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates subscribers at the next minute boundary', () => {
    render(<CurrentMinute />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('2026-07-15T12:01:00.000Z')).toBeVisible();
  });
});
