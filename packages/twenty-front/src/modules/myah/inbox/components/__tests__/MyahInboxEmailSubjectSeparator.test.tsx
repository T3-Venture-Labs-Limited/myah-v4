import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxEmailSubjectSeparator } from '@/myah/inbox/components/MyahInboxEmailSubjectSeparator';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: { color: { light: 'lightgray', medium: 'gray' } },
    font: {
      color: { primary: 'black', secondary: 'dimgray', tertiary: 'gray' },
      family: 'sans-serif',
      size: { sm: '13px', xs: '11px' },
      weight: { medium: 500, semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

describe('MyahInboxEmailSubjectSeparator', () => {
  it('labels a thread boundary and selects the exact native MessageThread id', () => {
    const onSelectEmailThread = jest.fn();

    render(
      <MyahInboxEmailSubjectSeparator
        messageThreadId="78e40e64-66d8-4df5-a632-a6ebfdd7c121"
        subject="Spring launch"
        detailLabel="Ada · Sep 5, 2026, 10:00 AM"
        isSelected={false}
        onSelectEmailThread={onSelectEmailThread}
      />,
    );

    const separator = screen.getByRole('separator', {
      name: 'Email thread: Spring launch, Ada · Sep 5, 2026, 10:00 AM',
    });
    const target = screen.getByRole('button', {
      name: 'Select email thread Spring launch, Ada · Sep 5, 2026, 10:00 AM',
    });

    expect(separator).toBeInTheDocument();
    expect(target).toHaveTextContent('Spring launch');
    expect(target).toHaveTextContent('Ada · Sep 5, 2026, 10:00 AM');
    expect(target).not.toHaveTextContent(
      '78e40e64-66d8-4df5-a632-a6ebfdd7c121',
    );
    expect(target).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(target);

    expect(onSelectEmailThread).toHaveBeenCalledWith(
      '78e40e64-66d8-4df5-a632-a6ebfdd7c121',
    );
  });

  it('uses a safe label for null and restricted subjects', () => {
    const { rerender } = render(
      <MyahInboxEmailSubjectSeparator
        messageThreadId="thread-without-subject"
        subject={null}
        detailLabel="Unknown sender"
        isSelected
        onSelectEmailThread={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Selected email thread No subject, Unknown sender',
      }),
    ).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <MyahInboxEmailSubjectSeparator
        messageThreadId="restricted-thread"
        subject={FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED}
        detailLabel="Unknown sender"
        isSelected={false}
        onSelectEmailThread={jest.fn()}
      />,
    );

    expect(screen.getByText('Restricted subject')).toBeInTheDocument();
    expect(
      screen.queryByText(FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED),
    ).not.toBeInTheDocument();
  });
});
