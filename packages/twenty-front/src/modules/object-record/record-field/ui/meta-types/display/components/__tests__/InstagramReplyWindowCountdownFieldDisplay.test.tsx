import { render, screen } from '@testing-library/react';

import { InstagramReplyWindowCountdownFieldDisplay } from '@/object-record/record-field/ui/meta-types/display/components/InstagramReplyWindowCountdownFieldDisplay';
import { useDateTimeFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/useDateTimeFieldDisplay';
import { useCurrentMinute } from '@/object-record/record-field/ui/hooks/useCurrentMinute';

jest.mock(
  '@/object-record/record-field/ui/meta-types/hooks/useDateTimeFieldDisplay',
  () => ({ useDateTimeFieldDisplay: jest.fn() }),
);
jest.mock('@/object-record/record-field/ui/hooks/useCurrentMinute', () => ({
  useCurrentMinute: jest.fn(),
}));

describe('InstagramReplyWindowCountdownFieldDisplay', () => {
  beforeEach(() => {
    jest.mocked(useDateTimeFieldDisplay).mockReturnValue({
      fieldValue: '2026-07-16T11:17:00.000Z',
    } as never);
    jest
      .mocked(useCurrentMinute)
      .mockReturnValue(new Date('2026-07-15T12:00:00.000Z'));
  });

  it('exposes both the countdown status and exact deadline accessibly', () => {
    render(<InstagramReplyWindowCountdownFieldDisplay />);

    expect(screen.getByText('23h 17m left')).toHaveAttribute(
      'aria-label',
      '23h 17m left. Reply window ends at 2026-07-16T11:17:00.000Z',
    );
  });
});
