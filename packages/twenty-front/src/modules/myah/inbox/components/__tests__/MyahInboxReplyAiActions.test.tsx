import { fireEvent, render, screen, within } from '@testing-library/react';

import { MyahInboxReplyAiActions } from '@/myah/inbox/components/MyahInboxReplyAiActions';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    font: { size: { xs: '12px' } },
    spacing: { 0.5: '2px', 2: '8px' },
  },
}));

jest.mock('twenty-ui/icon', () => ({
  useIcons: () => ({ getIcon: () => undefined }),
}));

const mockAppTooltip = jest.fn((_props: unknown) => null);

jest.mock('twenty-ui/surfaces', () => ({
  AppTooltip: (props: unknown) => mockAppTooltip(props),
  TooltipDelay: { shortDelay: '300ms' },
  TooltipPosition: { Top: 'top' },
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    ariaLabel,
    onClick,
    disabled,
    ...rest
  }: {
    title?: string;
    ariaLabel?: string;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button
      aria-label={ariaLabel ?? title}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={rest['aria-pressed'] as boolean | undefined}
      aria-disabled={rest['aria-disabled'] as boolean | undefined}
      aria-describedby={rest['aria-describedby'] as string | undefined}
      data-selected={rest['data-selected'] as boolean | undefined}
    >
      {title ?? ariaLabel}
    </button>
  ),
}));

describe('MyahInboxReplyAiActions', () => {
  it('renders guidance plus mutually exclusive reversible thumbs feedback in one group', () => {
    render(<MyahInboxReplyAiActions />);
    const group = screen.getByRole('group', { name: 'AI actions' });
    expect(
      within(group).getByRole('button', { name: 'Open AI guidance' }),
    ).toBeInTheDocument();
    const up = screen.getByRole('button', { name: 'Thumbs up' });
    const down = screen.getByRole('button', { name: 'Thumbs down' });

    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    expect(down).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(down);
    expect(up).toHaveAttribute('aria-pressed', 'false');
    expect(down).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(down);
    expect(down).toHaveAttribute('aria-pressed', 'false');
  });

  it('resets local feedback when the reset key changes', () => {
    const { rerender } = render(
      <MyahInboxReplyAiActions feedbackResetKey="scope-1:body-a" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thumbs up' }));
    expect(screen.getByRole('button', { name: 'Thumbs up' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rerender(<MyahInboxReplyAiActions feedbackResetKey="scope-1:body-b" />);
    expect(screen.getByRole('button', { name: 'Thumbs up' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('marks unavailable guidance with an accessible reason instead of hiding the control', () => {
    render(
      <MyahInboxReplyAiActions guidanceUnavailableReason="Select a Campaign to open AI guidance." />,
    );
    const guidance = screen.getByRole('button', { name: 'Open AI guidance' });
    expect(guidance).toHaveAttribute('aria-disabled', 'true');
    expect(guidance).toHaveAttribute('aria-describedby');
    expect(mockAppTooltip).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Select a Campaign to open AI guidance.',
      }),
    );
  });

  it('disables every control together', () => {
    render(<MyahInboxReplyAiActions disabled />);
    expect(
      screen.getByRole('button', { name: 'Open AI guidance' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thumbs up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thumbs down' })).toBeDisabled();
  });
});
